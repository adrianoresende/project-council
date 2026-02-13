"""FastAPI backend for LLM Council."""

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from typing import List, Dict, Any
from datetime import datetime, timezone
import uuid
import json
import asyncio
import hashlib
import hmac
import time
from urllib.parse import urlparse
import httpx

from . import storage
from .auth import (
    get_user_from_token,
    login_user,
    register_user,
    update_user_plan_metadata,
)
from .council import (
    run_full_council,
    generate_conversation_title,
    stage1_collect_responses,
    stage2_collect_rankings,
    stage3_synthesize_final,
    calculate_aggregate_rankings,
    summarize_council_usage,
    empty_usage_summary,
)
from .config import (
    STRIPE_SECRET_KEY,
    STRIPE_PUBLIC_KEY,
    STRIPE_WEBHOOK_SECRET,
    PRO_PLAN_PRICE_BRL_CENTS,
    COUNCIL_ENV,
)

app = FastAPI(title="LLM Council API")
bearer_scheme = HTTPBearer()

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CreateConversationRequest(BaseModel):
    """Request to create a new conversation."""
    pass


class SendMessageRequest(BaseModel):
    """Request to send a message in a conversation."""
    content: str


class ConversationMetadata(BaseModel):
    """Conversation metadata for list view."""
    id: str
    created_at: str
    title: str
    archived: bool = False
    message_count: int
    usage: Dict[str, Any] = Field(default_factory=dict)


class Conversation(BaseModel):
    """Full conversation with all messages."""
    id: str
    created_at: str
    title: str
    archived: bool = False
    messages: List[Dict[str, Any]]
    usage: Dict[str, Any] = Field(default_factory=dict)


class AuthRequest(BaseModel):
    """Email/password auth request payload."""
    email: str
    password: str


class AuthResponse(BaseModel):
    """Auth response for login/register."""
    access_token: str | None
    user: Dict[str, Any]
    requires_email_confirmation: bool = False


class AddCreditsRequest(BaseModel):
    """Request payload for adding credits."""
    amount: int = Field(gt=0, le=100000)


class CreditsResponse(BaseModel):
    """Current credit balance for the authenticated account."""
    credits: int


class AccountSummaryResponse(BaseModel):
    """Account summary for profile page."""
    email: str
    plan: str


class BillingPaymentResponse(BaseModel):
    """A processed Stripe payment linked to an account."""
    stripe_checkout_session_id: str
    plan: str
    amount_total: int
    currency: str
    checkout_status: str
    payment_status: str
    stripe_customer_id: str | None = None
    stripe_subscription_id: str | None = None
    stripe_payment_intent_id: str | None = None
    stripe_invoice_id: str | None = None
    last_event_type: str
    stripe_event_id: str | None = None
    paid_at: str | None = None
    next_payment_at: str | None = None
    processed_at: str
    created_at: str


class ArchiveConversationRequest(BaseModel):
    """Request payload for updating archived state."""
    archived: bool = True


class CreateProCheckoutSessionRequest(BaseModel):
    """Request payload for Stripe checkout session creation."""
    success_url: str
    cancel_url: str


class ConfirmCheckoutSessionRequest(BaseModel):
    """Request payload to confirm a Stripe checkout session."""
    session_id: str


def _is_valid_absolute_url(value: str) -> bool:
    """Allow only absolute http(s) URLs."""
    try:
        parsed = urlparse(value)
    except Exception:
        return False
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _extract_checkout_user_id(checkout_session: Dict[str, Any]) -> str | None:
    """Resolve an app user id from Stripe checkout session payload."""
    metadata = checkout_session.get("metadata") or {}
    if not isinstance(metadata, dict):
        metadata = {}

    user_id = metadata.get("user_id") or checkout_session.get("client_reference_id")
    if isinstance(user_id, str) and user_id.strip():
        return user_id.strip()
    return None


def _normalize_plan(value: Any) -> str:
    """Normalize plan text into accepted values."""
    if not isinstance(value, str):
        return "free"
    normalized = value.strip().lower()
    if normalized == "pro":
        return "pro"
    return "free"


def _iso_datetime_from_unix(value: Any) -> str | None:
    """Convert unix timestamp seconds to ISO datetime (UTC)."""
    try:
        timestamp = int(value)
    except (TypeError, ValueError):
        return None
    if timestamp <= 0:
        return None
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()


def _verify_stripe_signature(payload: bytes, signature_header: str) -> bool:
    """Verify Stripe webhook signature with the configured webhook secret."""
    if not STRIPE_WEBHOOK_SECRET:
        return COUNCIL_ENV in {"development", "dev", "local"}

    parts = {}
    for item in signature_header.split(","):
        if "=" not in item:
            continue
        key, value = item.split("=", 1)
        parts[key.strip()] = value.strip()

    timestamp_text = parts.get("t")
    signature_v1 = parts.get("v1")
    if not timestamp_text or not signature_v1:
        return False

    try:
        timestamp = int(timestamp_text)
    except ValueError:
        return False

    # Stripe recommends a 5-minute tolerance.
    if abs(int(time.time()) - timestamp) > 300:
        return False

    signed_payload = f"{timestamp}.{payload.decode('utf-8')}"
    expected = hmac.new(
        STRIPE_WEBHOOK_SECRET.encode("utf-8"),
        signed_payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature_v1)


async def _stripe_request(
    method: str,
    path: str,
    *,
    data: Dict[str, Any] | None = None,
    params: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """Execute an authenticated Stripe API request and return parsed JSON."""
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe is not configured on server.")

    url = f"https://api.stripe.com{path}"
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.request(
            method=method,
            url=url,
            data=data,
            params=params,
            headers={"Authorization": f"Bearer {STRIPE_SECRET_KEY}"},
        )

    if response.status_code >= 400:
        message = "Stripe request failed."
        try:
            payload = response.json()
            message = (
                payload.get("error", {}).get("message")
                or payload.get("message")
                or message
            )
        except ValueError:
            pass
        raise HTTPException(status_code=502, detail=message)

    try:
        payload = response.json()
    except ValueError as error:
        raise HTTPException(status_code=502, detail="Invalid response from Stripe.") from error

    if not isinstance(payload, dict):
        raise HTTPException(status_code=502, detail="Invalid response shape from Stripe.")
    return payload


async def _link_checkout_session_to_plan(
    checkout_session: Dict[str, Any],
    *,
    event_type: str,
    stripe_event_id: str | None = None,
) -> Dict[str, Any]:
    """Update the account plan based on a Stripe checkout session payload."""
    user_id = _extract_checkout_user_id(checkout_session)
    if not user_id:
        raise HTTPException(status_code=400, detail="Checkout session is missing user mapping.")

    if checkout_session.get("mode") != "subscription":
        raise HTTPException(status_code=400, detail="Checkout session is not a subscription.")

    status = checkout_session.get("status")
    if status != "complete":
        raise HTTPException(status_code=400, detail="Checkout session is not complete.")

    payment_status = checkout_session.get("payment_status")
    should_activate_pro = payment_status in {"paid", "no_payment_required"}

    subscription_field = checkout_session.get("subscription")
    stripe_subscription_id = (
        subscription_field.get("id")
        if isinstance(subscription_field, dict)
        else subscription_field
    )
    if not isinstance(stripe_subscription_id, str):
        stripe_subscription_id = None

    customer_field = checkout_session.get("customer")
    stripe_customer_id = customer_field if isinstance(customer_field, str) else None

    next_payment_at = None
    if isinstance(subscription_field, dict):
        next_payment_at = _iso_datetime_from_unix(subscription_field.get("current_period_end"))
    if not next_payment_at and stripe_subscription_id:
        try:
            subscription_payload = await _stripe_request(
                "GET",
                f"/v1/subscriptions/{stripe_subscription_id}",
            )
            next_payment_at = _iso_datetime_from_unix(
                subscription_payload.get("current_period_end")
            )
        except HTTPException:
            next_payment_at = None

    target_plan = "pro" if should_activate_pro else "free"
    await update_user_plan_metadata(
        user_id,
        target_plan,
        stripe_customer_id=stripe_customer_id,
        stripe_subscription_id=stripe_subscription_id,
    )

    await storage.upsert_billing_payment(
        user_id,
        checkout_session,
        event_type=event_type,
        stripe_event_id=stripe_event_id,
        paid_at=(
            datetime.now(timezone.utc).isoformat()
            if should_activate_pro
            else None
        ),
        next_payment_at=next_payment_at,
    )

    return {
        "user_id": user_id,
        "plan": target_plan,
        "payment_status": payment_status or "unknown",
    }


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "service": "LLM Council API"}


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
):
    """Validate bearer token with Supabase and return user profile."""
    return await get_user_from_token(credentials.credentials)


async def get_owned_conversation(conversation_id: str, user_id: str):
    """Return conversation only when it belongs to the current user."""
    conversation = await storage.get_conversation(conversation_id, user_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


@app.post("/api/auth/register", response_model=AuthResponse)
async def register(request: AuthRequest):
    """Register a new user in Supabase."""
    result = await register_user(request.email, request.password)
    session = result.get("session")
    return {
        "access_token": session.get("access_token") if session else None,
        "user": result.get("user") or {},
        "requires_email_confirmation": session is None,
    }


@app.post("/api/auth/login", response_model=AuthResponse)
async def login(request: AuthRequest):
    """Sign in an existing Supabase user."""
    result = await login_user(request.email, request.password)
    return {
        "access_token": result.get("access_token"),
        "user": result.get("user") or {},
        "requires_email_confirmation": False,
    }


@app.get("/api/auth/me")
async def me(user: Dict[str, Any] = Depends(get_current_user)):
    """Return the authenticated user profile."""
    return {"user": user}


@app.get("/api/billing/config")
async def get_billing_config(user: Dict[str, Any] = Depends(get_current_user)):
    """Return pricing and Stripe publishable key for the frontend."""
    return {
        "stripe_public_key": STRIPE_PUBLIC_KEY or "",
        "plans": [
            {"id": "free", "name": "Free", "price_brl": 0},
            {
                "id": "pro",
                "name": "Pro",
                "price_brl": PRO_PLAN_PRICE_BRL_CENTS // 100,
                "price_brl_cents": PRO_PLAN_PRICE_BRL_CENTS,
                "interval": "month",
            },
        ],
    }


@app.post("/api/billing/checkout/pro")
async def create_pro_checkout_session(
    request: CreateProCheckoutSessionRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Create a Stripe checkout session for the Pro plan."""
    if not _is_valid_absolute_url(request.success_url) or not _is_valid_absolute_url(request.cancel_url):
        raise HTTPException(status_code=400, detail="Invalid success_url or cancel_url.")

    user_email = user.get("email")
    payload = {
        "mode": "subscription",
        "success_url": request.success_url,
        "cancel_url": request.cancel_url,
        "payment_method_types[0]": "card",
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": "brl",
        "line_items[0][price_data][unit_amount]": str(PRO_PLAN_PRICE_BRL_CENTS),
        "line_items[0][price_data][recurring][interval]": "month",
        "line_items[0][price_data][product_data][name]": "LLM Council Pro",
        "line_items[0][price_data][product_data][description]": "Pro monthly plan",
        "client_reference_id": user["id"],
        "metadata[user_id]": user["id"],
        "metadata[plan]": "pro",
    }
    if isinstance(user_email, str) and user_email:
        payload["customer_email"] = user_email

    data = await _stripe_request("POST", "/v1/checkout/sessions", data=payload)

    checkout_url = data.get("url")
    if not checkout_url:
        raise HTTPException(status_code=502, detail="Stripe checkout URL not returned.")

    return {
        "session_id": data.get("id"),
        "checkout_url": checkout_url,
    }


@app.post("/api/billing/confirm")
async def confirm_checkout_session(
    request: ConfirmCheckoutSessionRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Confirm a Stripe checkout session and link it to current account plan."""
    session_id = (request.session_id or "").strip()
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required.")

    checkout_session = await _stripe_request(
        "GET",
        f"/v1/checkout/sessions/{session_id}",
        params={"expand[]": "subscription"},
    )

    checkout_user_id = _extract_checkout_user_id(checkout_session)
    if checkout_user_id != user["id"]:
        raise HTTPException(status_code=403, detail="Checkout session does not belong to this user.")

    result = await _link_checkout_session_to_plan(
        checkout_session,
        event_type="checkout.session.confirmed",
        stripe_event_id=None,
    )
    return {
        "session_id": session_id,
        "plan": result["plan"],
        "linked": True,
    }


@app.post("/api/billing/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str | None = Header(default=None, alias="Stripe-Signature"),
):
    """Handle Stripe webhook events for payment/account reconciliation."""
    payload = await request.body()
    if not payload:
        raise HTTPException(status_code=400, detail="Missing webhook payload.")

    if STRIPE_WEBHOOK_SECRET and not stripe_signature:
        raise HTTPException(status_code=400, detail="Missing Stripe-Signature header.")

    if not _verify_stripe_signature(payload, stripe_signature or ""):
        raise HTTPException(status_code=400, detail="Invalid Stripe signature.")

    try:
        event = json.loads(payload.decode("utf-8"))
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Invalid webhook payload.") from error

    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid webhook payload shape.")

    event_type = event.get("type")
    data_object = (event.get("data") or {}).get("object")
    if not isinstance(data_object, dict):
        return {"received": True, "ignored": True}

    if event_type == "checkout.session.completed":
        stripe_event_id = event.get("id")
        if not isinstance(stripe_event_id, str):
            stripe_event_id = None
        try:
            await _link_checkout_session_to_plan(
                data_object,
                event_type=event_type,
                stripe_event_id=stripe_event_id,
            )
        except HTTPException:
            # Acknowledge webhook to avoid retries on irrecoverable payload mismatch.
            return {"received": True, "processed": False}

    return {"received": True}


@app.get("/api/account/credits", response_model=CreditsResponse)
async def get_credits(user: Dict[str, Any] = Depends(get_current_user)):
    """Get current account credits for the logged in user."""
    credits = await storage.get_account_credits(user["id"])
    return {"credits": credits}


@app.get("/api/account/summary", response_model=AccountSummaryResponse)
async def get_account_summary(user: Dict[str, Any] = Depends(get_current_user)):
    """Return basic account summary (email and current plan)."""
    user_metadata = user.get("user_metadata") or {}
    app_metadata = user.get("app_metadata") or {}
    billing_metadata = app_metadata.get("billing") if isinstance(app_metadata, dict) else {}
    if not isinstance(billing_metadata, dict):
        billing_metadata = {}
    plan = (
        user_metadata.get("plan")
        or billing_metadata.get("plan")
        or app_metadata.get("plan")
        or "free"
    )
    normalized_plan = _normalize_plan(plan)

    return {
        "email": user.get("email", ""),
        "plan": normalized_plan,
    }


@app.get("/api/account/payments", response_model=List[BillingPaymentResponse])
async def get_account_payments(
    limit: int = Query(default=50, ge=1, le=200),
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Return processed Stripe payments linked to the authenticated account."""
    return await storage.list_billing_payments(user["id"], limit)


@app.post("/api/account/credits/add", response_model=CreditsResponse)
async def add_credits(
    request: AddCreditsRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Add credits to the logged in user account."""
    try:
        credits = await storage.add_account_credits(user["id"], request.amount)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return {"credits": credits}


@app.get("/api/conversations", response_model=List[ConversationMetadata])
async def list_conversations(
    archived: bool = Query(default=False),
    user: Dict[str, Any] = Depends(get_current_user),
):
    """List all conversations (metadata only)."""
    return await storage.list_conversations(user["id"], archived=archived)


@app.post("/api/conversations", response_model=Conversation)
async def create_conversation(
    request: CreateConversationRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Create a new conversation."""
    conversation_id = str(uuid.uuid4())
    conversation = await storage.create_conversation(conversation_id, user["id"])
    return conversation


@app.get("/api/conversations/{conversation_id}", response_model=Conversation)
async def get_conversation(
    conversation_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Get a specific conversation with all its messages."""
    conversation = await get_owned_conversation(conversation_id, user["id"])
    return conversation


@app.patch("/api/conversations/{conversation_id}/archive")
async def archive_conversation(
    conversation_id: str,
    request: ArchiveConversationRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Archive/unarchive a conversation owned by the authenticated user."""
    try:
        await storage.update_conversation_archived(
            conversation_id,
            user["id"],
            request.archived,
        )
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    return {"id": conversation_id, "archived": request.archived}


@app.post("/api/conversations/{conversation_id}/message")
async def send_message(
    conversation_id: str,
    request: SendMessageRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Send a message and run the 3-stage council process.
    Returns the complete response with all stages.
    """
    # Check if conversation exists
    conversation = await get_owned_conversation(conversation_id, user["id"])

    # Check if this is the first message
    is_first_message = len(conversation["messages"]) == 0

    # Consume one credit for each user question
    try:
        await storage.consume_account_credit(user["id"])
    except ValueError as error:
        raise HTTPException(status_code=402, detail=str(error)) from error

    # Add user message
    await storage.add_user_message(conversation_id, user["id"], request.content)

    # If this is the first message, generate a title
    title_usage = empty_usage_summary()
    if is_first_message:
        title_result = await generate_conversation_title(request.content)
        title = title_result.get("title", "New Conversation")
        title_usage = title_result.get("usage", empty_usage_summary())
        await storage.update_conversation_title(conversation_id, user["id"], title)

    # Run the 3-stage council process
    stage1_results, stage2_results, stage3_result, metadata = await run_full_council(
        request.content
    )
    if is_first_message:
        metadata["title_usage"] = title_usage
        metadata_usage = metadata.get("usage", empty_usage_summary())
        metadata["usage"] = {
            "input_tokens": int(metadata_usage.get("input_tokens", 0)) + int(title_usage.get("input_tokens", 0)),
            "output_tokens": int(metadata_usage.get("output_tokens", 0)) + int(title_usage.get("output_tokens", 0)),
            "total_tokens": int(metadata_usage.get("total_tokens", 0)) + int(title_usage.get("total_tokens", 0)),
            "total_cost": round(
                float(metadata_usage.get("total_cost", 0.0)) + float(title_usage.get("cost", 0.0) or 0.0),
                8,
            ),
            "model_calls": int(metadata_usage.get("model_calls", 0)) + 1,
        }
        stage3_result["title_usage"] = title_usage

    # Add assistant message with all stages
    await storage.add_assistant_message(
        conversation_id,
        user["id"],
        stage1_results,
        stage2_results,
        stage3_result
    )
    updated_conversation = await storage.get_conversation(conversation_id, user["id"])

    # Return the complete response with metadata
    return {
        "stage1": stage1_results,
        "stage2": stage2_results,
        "stage3": stage3_result,
        "metadata": metadata,
        "conversation_usage": (updated_conversation or {}).get("usage", empty_usage_summary()),
    }


@app.post("/api/conversations/{conversation_id}/message/stream")
async def send_message_stream(
    conversation_id: str,
    request: SendMessageRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Send a message and stream the 3-stage council process.
    Returns Server-Sent Events as each stage completes.
    """
    # Check if conversation exists
    conversation = await get_owned_conversation(conversation_id, user["id"])

    # Check if this is the first message
    is_first_message = len(conversation["messages"]) == 0

    # Consume one credit for each user question
    try:
        await storage.consume_account_credit(user["id"])
    except ValueError as error:
        raise HTTPException(status_code=402, detail=str(error)) from error

    async def event_generator():
        try:
            # Add user message
            await storage.add_user_message(conversation_id, user["id"], request.content)

            # Start title generation in parallel (don't await yet)
            title_task = None
            if is_first_message:
                title_task = asyncio.create_task(generate_conversation_title(request.content))

            # Stage 1: Collect responses
            yield f"data: {json.dumps({'type': 'stage1_start'})}\n\n"
            stage1_results = await stage1_collect_responses(request.content)
            yield f"data: {json.dumps({'type': 'stage1_complete', 'data': stage1_results})}\n\n"

            # Stage 2: Collect rankings
            yield f"data: {json.dumps({'type': 'stage2_start'})}\n\n"
            stage2_results, label_to_model = await stage2_collect_rankings(request.content, stage1_results)
            aggregate_rankings = calculate_aggregate_rankings(stage2_results, label_to_model)
            yield f"data: {json.dumps({'type': 'stage2_complete', 'data': stage2_results, 'metadata': {'label_to_model': label_to_model, 'aggregate_rankings': aggregate_rankings}})}\n\n"

            # Stage 3: Synthesize final answer
            yield f"data: {json.dumps({'type': 'stage3_start'})}\n\n"
            stage3_result = await stage3_synthesize_final(request.content, stage1_results, stage2_results)
            yield f"data: {json.dumps({'type': 'stage3_complete', 'data': stage3_result})}\n\n"

            metadata = {
                "label_to_model": label_to_model,
                "aggregate_rankings": aggregate_rankings,
                "usage": summarize_council_usage(stage1_results, stage2_results, stage3_result),
            }

            # Wait for title generation if it was started
            if title_task:
                title_result = await title_task
                title = title_result.get("title", "New Conversation")
                title_usage = title_result.get("usage", empty_usage_summary())
                await storage.update_conversation_title(conversation_id, user["id"], title)
                yield f"data: {json.dumps({'type': 'title_complete', 'data': {'title': title}})}\n\n"
                metadata["title_usage"] = title_usage
                metadata_usage = metadata.get("usage", empty_usage_summary())
                metadata["usage"] = {
                    "input_tokens": int(metadata_usage.get("input_tokens", 0)) + int(title_usage.get("input_tokens", 0)),
                    "output_tokens": int(metadata_usage.get("output_tokens", 0)) + int(title_usage.get("output_tokens", 0)),
                    "total_tokens": int(metadata_usage.get("total_tokens", 0)) + int(title_usage.get("total_tokens", 0)),
                    "total_cost": round(
                        float(metadata_usage.get("total_cost", 0.0)) + float(title_usage.get("cost", 0.0) or 0.0),
                        8,
                    ),
                    "model_calls": int(metadata_usage.get("model_calls", 0)) + 1,
                }
                stage3_result["title_usage"] = title_usage

            # Save complete assistant message
            await storage.add_assistant_message(
                conversation_id,
                user["id"],
                stage1_results,
                stage2_results,
                stage3_result
            )
            updated_conversation = await storage.get_conversation(conversation_id, user["id"])

            # Send completion event
            yield f"data: {json.dumps({'type': 'complete', 'metadata': metadata, 'conversation_usage': (updated_conversation or {}).get('usage', empty_usage_summary())})}\n\n"

        except Exception as e:
            # Send error event
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
