"""FastAPI backend for LLM Council."""

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from typing import List, Dict, Any
from datetime import datetime, timezone
from contextlib import suppress
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
    ROLE_ADMIN,
    ensure_default_user_role_metadata,
    get_user_from_token,
    list_users_admin,
    login_user,
    normalize_user_role,
    register_user,
    update_user_plan_metadata,
)
from .council import (
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
    PRO_DAILY_TOKEN_CREDITS,
    FREE_DAILY_QUERY_LIMIT,
    COUNCIL_ENV,
)
from .files import (
    PDF_TEXT_PLUGIN,
    build_file_context_note,
    extract_message_content_and_files,
    prepare_uploaded_files_for_model,
    resolve_message_prompt,
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
    """Current daily quota balance for the authenticated account."""
    credits: int
    unit: str
    limit: int
    plan: str


class AccountSummaryResponse(BaseModel):
    """Account summary for profile page."""
    email: str
    plan: str


class AdminUserResponse(BaseModel):
    """Admin-facing user row payload."""
    email: str
    plan: str
    stripe_payment_id: str | None = None
    registration_date: str | None = None
    last_login_date: str | None = None


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


def _get_user_plan(user: Dict[str, Any]) -> str:
    """Resolve current account plan from auth metadata."""
    user_metadata = user.get("user_metadata") or {}
    app_metadata = user.get("app_metadata") or {}
    billing_metadata = app_metadata.get("billing") if isinstance(app_metadata, dict) else {}
    if not isinstance(billing_metadata, dict):
        billing_metadata = {}
    return _normalize_plan(
        user_metadata.get("plan")
        or billing_metadata.get("plan")
        or app_metadata.get("plan")
        or "free"
    )


def _get_user_role(user: Dict[str, Any]) -> str:
    """Resolve account role from auth metadata."""
    app_metadata = user.get("app_metadata") or {}
    if not isinstance(app_metadata, dict):
        app_metadata = {}
    return normalize_user_role(app_metadata.get("role"))


def _get_user_stripe_payment_id(user: Dict[str, Any]) -> str | None:
    """Resolve Stripe identifier from billing metadata."""
    app_metadata = user.get("app_metadata") or {}
    if not isinstance(app_metadata, dict):
        app_metadata = {}

    billing_metadata = app_metadata.get("billing") or {}
    if not isinstance(billing_metadata, dict):
        billing_metadata = {}

    for key in ("stripe_customer_id", "stripe_subscription_id"):
        value = billing_metadata.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


async def _get_remaining_daily_tokens(user: Dict[str, Any]) -> int:
    """Return remaining daily tokens for PRO accounts, or 0 for non-PRO."""
    if _get_user_plan(user) != "pro":
        return 0
    return await storage.get_account_daily_credits(user["id"], PRO_DAILY_TOKEN_CREDITS)


async def _get_remaining_daily_queries(user: Dict[str, Any]) -> int:
    """Return remaining daily conversation queries for FREE accounts, or 0 for PRO."""
    if _get_user_plan(user) != "free":
        return 0
    return await storage.get_account_daily_credits(user["id"], FREE_DAILY_QUERY_LIMIT)


async def _get_remaining_plan_quota(user: Dict[str, Any]) -> tuple[int, str, int, str]:
    """Return remaining quota and descriptor for current user plan."""
    plan = _get_user_plan(user)
    if plan == "pro":
        remaining = await _get_remaining_daily_tokens(user)
        return remaining, "tokens", PRO_DAILY_TOKEN_CREDITS, "pro"

    remaining = await _get_remaining_daily_queries(user)
    return remaining, "queries", FREE_DAILY_QUERY_LIMIT, "free"


def _compress_message_content(text: str, max_chars: int) -> str:
    """Keep both the start and end of long messages to preserve topic + details."""
    cleaned = text.strip()
    if len(cleaned) <= max_chars:
        return cleaned
    head_chars = max_chars // 2
    tail_chars = max_chars - head_chars
    return f"{cleaned[:head_chars]}\n...\n{cleaned[-tail_chars:]}"


def _build_conversation_history(
    messages: List[Dict[str, Any]],
    *,
    max_messages: int = 16,
    max_total_chars: int = 16000,
    max_chars_per_message: int = 2200,
) -> List[Dict[str, str]]:
    """
    Build structured chat history for multi-turn model calls.

    Returns OpenAI/OpenRouter-compatible message objects:
    [{"role": "user"|"assistant", "content": "..."}]
    """
    if not isinstance(messages, list):
        return []

    history: List[Dict[str, str]] = []
    for message in messages:
        if not isinstance(message, dict):
            continue

        role = message.get("role")
        text: str | None = None

        if role == "user":
            raw_text = message.get("content")
            file_note = build_file_context_note(message.get("files") or [])
            if isinstance(raw_text, str) and raw_text.strip():
                text = raw_text
                if file_note:
                    text = f"{raw_text}\n\n{file_note}"
            elif file_note:
                text = file_note
        elif role == "assistant":
            stage3 = message.get("stage3")
            if isinstance(stage3, dict):
                stage3_response = stage3.get("response")
                if isinstance(stage3_response, str) and stage3_response.strip():
                    text = stage3_response
            if text is None:
                raw_text = message.get("content")
                if isinstance(raw_text, str) and raw_text.strip():
                    text = raw_text

        if role in {"user", "assistant"} and text:
            history.append(
                {
                    "role": role,
                    "content": _compress_message_content(text, max_chars_per_message),
                }
            )

    if len(history) > max_messages:
        history = history[-max_messages:]

    bounded: List[Dict[str, str]] = []
    running_chars = 0
    for item in reversed(history):
        content = item["content"]
        next_size = len(content)
        if bounded and running_chars + next_size > max_total_chars:
            break
        bounded.append(item)
        running_chars += next_size

    bounded.reverse()
    return bounded


def _normalize_session_id(value: Any) -> str | None:
    """Best-effort normalization for model conversation session IDs."""
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if not normalized:
        return None
    return normalized[:128]


def _resolve_conversation_session_id(conversation: Dict[str, Any]) -> str:
    """
    Resolve a stable session ID for model continuation.

    Priority:
    1. Last stored message id_session
    2. Conversation ID
    3. New UUID fallback
    """
    messages = conversation.get("messages")
    if isinstance(messages, list):
        for message in reversed(messages):
            if not isinstance(message, dict):
                continue
            session_id = _normalize_session_id(
                message.get("id_session") or message.get("session_id")
            )
            if session_id:
                return session_id

    conversation_id = _normalize_session_id(conversation.get("id"))
    if conversation_id:
        return conversation_id
    return str(uuid.uuid4())


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


async def get_current_admin_user(
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Validate that the authenticated user has administrator privileges."""
    if _get_user_role(user) != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required.")
    return user


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
    registered_user = result.get("user") or {}
    registered_user_id = registered_user.get("id")
    if isinstance(registered_user_id, str) and registered_user_id:
        with suppress(HTTPException):
            registered_user = await ensure_default_user_role_metadata(registered_user_id)

    session = result.get("session")
    return {
        "access_token": session.get("access_token") if session else None,
        "user": registered_user,
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
    """Get remaining daily quota for the logged in account."""
    credits, unit, limit, plan = await _get_remaining_plan_quota(user)
    return {
        "credits": credits,
        "unit": unit,
        "limit": limit,
        "plan": plan,
    }


@app.get("/api/account/summary", response_model=AccountSummaryResponse)
async def get_account_summary(user: Dict[str, Any] = Depends(get_current_user)):
    """Return basic account summary (email and current plan)."""
    return {
        "email": user.get("email", ""),
        "plan": _get_user_plan(user),
    }


@app.get("/api/account/payments", response_model=List[BillingPaymentResponse])
async def get_account_payments(
    limit: int = Query(default=50, ge=1, le=200),
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Return processed Stripe payments linked to the authenticated account."""
    return await storage.list_billing_payments(user["id"], limit)


@app.get("/api/admin/users", response_model=List[AdminUserResponse])
async def get_admin_users(_: Dict[str, Any] = Depends(get_current_admin_user)):
    """Return registered users for administrators, sorted by email ascending."""
    users = await list_users_admin()
    rows = []
    for user in users:
        email = user.get("email")
        if not isinstance(email, str):
            email = ""

        rows.append(
            {
                "email": email.strip(),
                "plan": _get_user_plan(user),
                "stripe_payment_id": _get_user_stripe_payment_id(user),
                "registration_date": (
                    user["created_at"].strip()
                    if isinstance(user.get("created_at"), str)
                    else None
                ),
                "last_login_date": (
                    user["last_sign_in_at"].strip()
                    if isinstance(user.get("last_sign_in_at"), str)
                    else None
                ),
            }
        )

    rows.sort(key=lambda row: (row["email"].lower(), row["email"]))
    return rows


@app.post("/api/account/credits/add", response_model=CreditsResponse)
async def add_credits(
    request: AddCreditsRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Manual credit top-up is disabled; quota renews daily for PRO users."""
    raise HTTPException(
        status_code=400,
        detail="Manual credit top-up is disabled. PRO token credits renew daily.",
    )


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
    plan = _get_user_plan(user)
    if plan == "free":
        # Free users spend one query when they send the first message in a conversation.
        # We still block opening drafts when daily query quota is exhausted.
        remaining_queries = await _get_remaining_daily_queries(user)
        if remaining_queries <= 0:
            raise HTTPException(
                status_code=402,
                detail="Daily query limit has run out. You must wait until tomorrow for renewal.",
            )
    else:
        remaining_tokens = await _get_remaining_daily_tokens(user)
        if remaining_tokens <= 0:
            raise HTTPException(
                status_code=402,
                detail="Daily token credit has run out. You must wait until tomorrow for renewal.",
            )

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
    http_request: Request,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Send a message and run the 3-stage council process.
    Returns the complete response with all stages.
    """
    message_content, incoming_files = await extract_message_content_and_files(http_request)
    if not message_content.strip() and not incoming_files:
        raise HTTPException(status_code=400, detail="Message text or file is required.")

    # Check if conversation exists
    conversation = await get_owned_conversation(conversation_id, user["id"])

    # Check if this is the first message
    is_first_message = len(conversation["messages"]) == 0
    conversation_history = _build_conversation_history(conversation.get("messages", []))
    conversation_session_id = _resolve_conversation_session_id(conversation)
    plan = _get_user_plan(user)
    remaining_balance_after = 0

    if plan == "pro":
        remaining_tokens = await _get_remaining_daily_tokens(user)
        if remaining_tokens <= 0:
            raise HTTPException(
                status_code=402,
                detail="Daily token credit has run out. You must wait until tomorrow for renewal.",
            )
    elif is_first_message:
        remaining_queries = await _get_remaining_daily_queries(user)
        if remaining_queries <= 0:
            raise HTTPException(
                status_code=402,
                detail="Daily query limit has run out. You must wait until tomorrow for renewal.",
            )
        remaining_balance_after = remaining_queries

    attachment_parts, safe_user_files, needs_pdf_parser = await prepare_uploaded_files_for_model(
        incoming_files
    )
    resolved_prompt = resolve_message_prompt(message_content, safe_user_files)

    # Add user message
    await storage.add_user_message(
        conversation_id,
        user["id"],
        message_content,
        files=safe_user_files,
        id_session=conversation_session_id,
    )

    # If this is the first message, generate a title
    title_usage = empty_usage_summary()
    if is_first_message:
        title_result = await generate_conversation_title(
            resolved_prompt,
            session_id=conversation_session_id,
        )
        title = title_result.get("title", "New Conversation")
        title_usage = title_result.get("usage", empty_usage_summary())
        await storage.update_conversation_title(conversation_id, user["id"], title)

    # Stage 1
    stage1_results = await stage1_collect_responses(
        resolved_prompt,
        conversation_history=conversation_history,
        session_id=conversation_session_id,
        user_attachments=attachment_parts,
        plugins=PDF_TEXT_PLUGIN if needs_pdf_parser else None,
    )
    stage2_results: List[Dict[str, Any]] = []
    if not stage1_results:
        stage3_result = {
            "model": "error",
            "response": "All models failed to respond. Please try again.",
            "usage": empty_usage_summary(),
        }
        metadata = {
            "label_to_model": {},
            "aggregate_rankings": [],
            "usage": summarize_council_usage(stage1_results, stage2_results, stage3_result),
        }
    else:
        # Free plan: count one query after Stage 1 is complete and before Stage 2 starts.
        if plan == "free" and is_first_message:
            try:
                remaining_balance_after = await storage.consume_account_tokens(
                    user["id"],
                    1,
                    FREE_DAILY_QUERY_LIMIT,
                )
            except ValueError as error:
                raise HTTPException(status_code=402, detail=str(error)) from error

        # Stage 2
        stage2_results, label_to_model = await stage2_collect_rankings(
            resolved_prompt,
            stage1_results,
            conversation_history=conversation_history,
            session_id=conversation_session_id,
        )
        aggregate_rankings = calculate_aggregate_rankings(stage2_results, label_to_model)

        # Stage 3
        stage3_result = await stage3_synthesize_final(
            resolved_prompt,
            stage1_results,
            stage2_results,
            conversation_history=conversation_history,
            session_id=conversation_session_id,
            user_attachments=attachment_parts,
            plugins=PDF_TEXT_PLUGIN if needs_pdf_parser else None,
        )
        metadata = {
            "label_to_model": label_to_model,
            "aggregate_rankings": aggregate_rankings,
            "usage": summarize_council_usage(stage1_results, stage2_results, stage3_result),
        }

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

    if plan == "pro":
        tokens_to_consume = max(0, int((metadata.get("usage") or {}).get("total_tokens", 0)))
        try:
            remaining_balance_after = await storage.consume_account_tokens(
                user["id"],
                tokens_to_consume,
                PRO_DAILY_TOKEN_CREDITS,
            )
        except ValueError as error:
            raise HTTPException(status_code=402, detail=str(error)) from error
    elif not is_first_message:
        remaining_balance_after = await _get_remaining_daily_queries(user)

    # Add assistant message with all stages
    await storage.add_assistant_message(
        conversation_id,
        user["id"],
        stage1_results,
        stage2_results,
        stage3_result,
        id_session=conversation_session_id,
    )
    updated_conversation = await storage.get_conversation(conversation_id, user["id"])

    # Return the complete response with metadata
    return {
        "stage1": stage1_results,
        "stage2": stage2_results,
        "stage3": stage3_result,
        "metadata": metadata,
        "credits": remaining_balance_after,
        "conversation_usage": (updated_conversation or {}).get("usage", empty_usage_summary()),
    }


@app.post("/api/conversations/{conversation_id}/message/stream")
async def send_message_stream(
    conversation_id: str,
    http_request: Request,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Send a message and stream the 3-stage council process.
    Returns Server-Sent Events as each stage completes.
    """
    message_content, incoming_files = await extract_message_content_and_files(http_request)
    if not message_content.strip() and not incoming_files:
        raise HTTPException(status_code=400, detail="Message text or file is required.")

    # Check if conversation exists
    conversation = await get_owned_conversation(conversation_id, user["id"])

    # Check if this is the first message
    is_first_message = len(conversation["messages"]) == 0
    conversation_history = _build_conversation_history(conversation.get("messages", []))
    conversation_session_id = _resolve_conversation_session_id(conversation)
    plan = _get_user_plan(user)
    remaining_balance_after = 0

    if plan == "pro":
        remaining_tokens = await _get_remaining_daily_tokens(user)
        if remaining_tokens <= 0:
            raise HTTPException(
                status_code=402,
                detail="Daily token credit has run out. You must wait until tomorrow for renewal.",
            )
    elif is_first_message:
        remaining_queries = await _get_remaining_daily_queries(user)
        if remaining_queries <= 0:
            raise HTTPException(
                status_code=402,
                detail="Daily query limit has run out. You must wait until tomorrow for renewal.",
            )
        remaining_balance_after = remaining_queries

    attachment_parts, safe_user_files, needs_pdf_parser = await prepare_uploaded_files_for_model(
        incoming_files
    )
    resolved_prompt = resolve_message_prompt(message_content, safe_user_files)

    async def event_generator():
        remaining_balance_current = remaining_balance_after
        stage1_results: List[Dict[str, Any]] = []
        stage2_results: List[Dict[str, Any]] = []
        stage3_result: Dict[str, Any] | None = None
        label_to_model: Dict[str, str] = {}
        aggregate_rankings: List[Dict[str, Any]] = []
        title_task: asyncio.Task | None = None
        free_query_consumed = False
        user_message_saved = False
        stage1_started = False
        stage2_started = False
        stage3_started = False

        async def resolve_title_result(wait_for_completion: bool) -> Dict[str, Any] | None:
            if title_task is None:
                return None

            if wait_for_completion:
                return await title_task

            if title_task.done():
                try:
                    return title_task.result()
                except Exception:
                    return None

            title_task.cancel()
            with suppress(asyncio.CancelledError):
                await title_task
            return None

        async def persist_turn(
            *,
            cancelled: bool,
            title_result: Dict[str, Any] | None = None,
            wait_for_title: bool = False,
            save_title: bool = True,
        ) -> tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any] | None]:
            nonlocal remaining_balance_current, stage3_result, free_query_consumed
            nonlocal stage1_started, stage2_started, stage3_started

            resolved_title = title_result
            if resolved_title is None:
                resolved_title = await resolve_title_result(wait_for_completion=wait_for_title)

            if cancelled and stage3_result is None:
                stage3_result = {
                    "model": "system/cancelled",
                    "response": "Generation stopped by user.",
                    "usage": empty_usage_summary(),
                    "cancelled": True,
                }

            if stage3_result is None:
                stage3_result = {
                    "model": "system/error",
                    "response": "No final response available.",
                    "usage": empty_usage_summary(),
                }

            metadata = {
                "label_to_model": label_to_model,
                "aggregate_rankings": aggregate_rankings,
                "usage": summarize_council_usage(stage1_results, stage2_results, stage3_result),
            }

            if isinstance(resolved_title, dict):
                title = resolved_title.get("title", "New Conversation")
                title_usage = resolved_title.get("usage", empty_usage_summary())
                if save_title:
                    await storage.update_conversation_title(conversation_id, user["id"], title)

                metadata["title_usage"] = title_usage
                metadata_usage = metadata.get("usage", empty_usage_summary())
                metadata["usage"] = {
                    "input_tokens": int(metadata_usage.get("input_tokens", 0))
                    + int(title_usage.get("input_tokens", 0)),
                    "output_tokens": int(metadata_usage.get("output_tokens", 0))
                    + int(title_usage.get("output_tokens", 0)),
                    "total_tokens": int(metadata_usage.get("total_tokens", 0))
                    + int(title_usage.get("total_tokens", 0)),
                    "total_cost": round(
                        float(metadata_usage.get("total_cost", 0.0))
                        + float(title_usage.get("cost", 0.0) or 0.0),
                        8,
                    ),
                    "model_calls": int(metadata_usage.get("model_calls", 0)) + 1,
                }
                stage3_result["title_usage"] = title_usage

            if plan == "pro":
                usage_summary = metadata.get("usage") or {}
                tokens_to_consume = max(0, int(usage_summary.get("total_tokens", 0)))
                model_calls = max(0, int(usage_summary.get("model_calls", 0)))
                started_any_stage = stage1_started or stage2_started or stage3_started

                # Fallback: when cancellation interrupts usage reporting but model
                # work already started, charge at least 1 token.
                if cancelled and tokens_to_consume <= 0 and (model_calls > 0 or started_any_stage):
                    tokens_to_consume = 1

                if tokens_to_consume > 0:
                    remaining_balance_current = await storage.consume_account_tokens(
                        user["id"],
                        tokens_to_consume,
                        PRO_DAILY_TOKEN_CREDITS,
                    )
                else:
                    remaining_balance_current = await _get_remaining_daily_tokens(user)
            elif plan == "free":
                if is_first_message and stage1_results and not free_query_consumed:
                    remaining_balance_current = await storage.consume_account_tokens(
                        user["id"],
                        1,
                        FREE_DAILY_QUERY_LIMIT,
                    )
                    free_query_consumed = True
                elif is_first_message and not free_query_consumed:
                    remaining_balance_current = await _get_remaining_daily_queries(user)
                elif not is_first_message:
                    remaining_balance_current = await _get_remaining_daily_queries(user)

            if not user_message_saved:
                updated_conversation = await storage.get_conversation(conversation_id, user["id"]) or {}
                return metadata, updated_conversation, resolved_title

            await storage.add_assistant_message(
                conversation_id,
                user["id"],
                stage1_results,
                stage2_results,
                stage3_result,
                id_session=conversation_session_id,
            )
            updated_conversation = await storage.get_conversation(conversation_id, user["id"]) or {}
            return metadata, updated_conversation, resolved_title

        try:
            # Add user message
            await storage.add_user_message(
                conversation_id,
                user["id"],
                message_content,
                files=safe_user_files,
                id_session=conversation_session_id,
            )
            user_message_saved = True

            # Start title generation in parallel (don't await yet)
            if is_first_message:
                title_task = asyncio.create_task(
                    generate_conversation_title(
                        resolved_prompt,
                        session_id=conversation_session_id,
                    )
                )

            # Stage 1: Collect responses
            stage1_started = True
            yield f"data: {json.dumps({'type': 'stage1_start'})}\n\n"
            stage1_results = await stage1_collect_responses(
                resolved_prompt,
                conversation_history=conversation_history,
                session_id=conversation_session_id,
                user_attachments=attachment_parts,
                plugins=PDF_TEXT_PLUGIN if needs_pdf_parser else None,
            )

            # Free plan: count one query only after Stage 1 is complete,
            # immediately before Stage 2 begins.
            if plan == "free" and is_first_message and stage1_results and not free_query_consumed:
                remaining_balance_current = await storage.consume_account_tokens(
                    user["id"],
                    1,
                    FREE_DAILY_QUERY_LIMIT,
                )
                free_query_consumed = True

            if await http_request.is_disconnected():
                await persist_turn(cancelled=True, wait_for_title=False)
                return

            yield f"data: {json.dumps({'type': 'stage1_complete', 'data': stage1_results})}\n\n"

            # Stage 2: Collect rankings
            stage2_started = True
            yield f"data: {json.dumps({'type': 'stage2_start'})}\n\n"
            stage2_results, label_to_model = await stage2_collect_rankings(
                resolved_prompt,
                stage1_results,
                conversation_history=conversation_history,
                session_id=conversation_session_id,
            )
            aggregate_rankings = calculate_aggregate_rankings(stage2_results, label_to_model)

            if await http_request.is_disconnected():
                await persist_turn(cancelled=True, wait_for_title=False)
                return

            yield f"data: {json.dumps({'type': 'stage2_complete', 'data': stage2_results, 'metadata': {'label_to_model': label_to_model, 'aggregate_rankings': aggregate_rankings}})}\n\n"

            # Stage 3: Synthesize final answer
            stage3_started = True
            yield f"data: {json.dumps({'type': 'stage3_start'})}\n\n"
            stage3_result = await stage3_synthesize_final(
                resolved_prompt,
                stage1_results,
                stage2_results,
                conversation_history=conversation_history,
                session_id=conversation_session_id,
                user_attachments=attachment_parts,
                plugins=PDF_TEXT_PLUGIN if needs_pdf_parser else None,
            )

            if await http_request.is_disconnected():
                await persist_turn(cancelled=True, wait_for_title=False)
                return

            yield f"data: {json.dumps({'type': 'stage3_complete', 'data': stage3_result})}\n\n"

            title_result = await resolve_title_result(wait_for_completion=True)
            metadata, updated_conversation, resolved_title = await persist_turn(
                cancelled=False,
                title_result=title_result,
                save_title=True,
            )

            if isinstance(resolved_title, dict):
                title = resolved_title.get("title", "New Conversation")
                yield f"data: {json.dumps({'type': 'title_complete', 'data': {'title': title}})}\n\n"

            # Send completion event
            yield f"data: {json.dumps({'type': 'complete', 'metadata': metadata, 'credits': remaining_balance_current, 'conversation_usage': (updated_conversation or {}).get('usage', empty_usage_summary())})}\n\n"

        except asyncio.CancelledError:
            # Client disconnected abruptly. Persist partial work and usage.
            await asyncio.shield(
                persist_turn(
                    cancelled=True,
                    wait_for_title=False,
                )
            )
            raise
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
