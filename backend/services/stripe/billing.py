"""Stripe billing workflows for checkout and webhook reconciliation."""

from datetime import datetime, timezone
import hashlib
import hmac
import json
import time
from typing import Any, Dict
from urllib.parse import urlparse

from fastapi import HTTPException

from ...config import COUNCIL_ENV, STRIPE_WEBHOOK_SECRET
from ...utils import unix_to_iso_datetime as _iso_datetime_from_unix
from ..supabase import storage
from ..supabase.auth import update_user_plan_metadata
from .client import stripe_request


def _is_valid_absolute_url(value: str) -> bool:
    """Allow only absolute http(s) URLs."""
    try:
        parsed = urlparse(value)
    except Exception:
        return False
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def extract_checkout_user_id(checkout_session: Dict[str, Any]) -> str | None:
    """Resolve an app user id from Stripe checkout session payload."""
    metadata = checkout_session.get("metadata") or {}
    if not isinstance(metadata, dict):
        metadata = {}

    user_id = metadata.get("user_id") or checkout_session.get("client_reference_id")
    if isinstance(user_id, str) and user_id.strip():
        return user_id.strip()
    return None


def verify_stripe_signature(payload: bytes, signature_header: str) -> bool:
    """Verify Stripe webhook signature with configured secret and tolerance."""
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


async def reconcile_checkout_session_to_plan(
    checkout_session: Dict[str, Any],
    *,
    event_type: str,
    stripe_event_id: str | None = None,
) -> Dict[str, Any]:
    """Update account plan and billing records from a checkout session payload."""
    user_id = extract_checkout_user_id(checkout_session)
    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="Checkout session is missing user mapping.",
        )

    if checkout_session.get("mode") != "subscription":
        raise HTTPException(
            status_code=400,
            detail="Checkout session is not a subscription.",
        )

    status = checkout_session.get("status")
    if status != "complete":
        raise HTTPException(
            status_code=400,
            detail="Checkout session is not complete.",
        )

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
        next_payment_at = _iso_datetime_from_unix(
            subscription_field.get("current_period_end")
        )
    if not next_payment_at and stripe_subscription_id:
        try:
            subscription_payload = await stripe_request(
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
            datetime.now(timezone.utc).isoformat() if should_activate_pro else None
        ),
        next_payment_at=next_payment_at,
    )

    return {
        "user_id": user_id,
        "plan": target_plan,
        "payment_status": payment_status or "unknown",
    }


async def create_pro_checkout_session(
    *,
    success_url: str,
    cancel_url: str,
    user_id: str,
    user_email: str | None,
    pro_price_brl_cents: int,
) -> Dict[str, Any]:
    """Create a Stripe Checkout Session payload for the Pro subscription."""
    if not _is_valid_absolute_url(success_url) or not _is_valid_absolute_url(
        cancel_url
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid success_url or cancel_url.",
        )

    payload = {
        "mode": "subscription",
        "success_url": success_url,
        "cancel_url": cancel_url,
        "payment_method_types[0]": "card",
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": "brl",
        "line_items[0][price_data][unit_amount]": str(pro_price_brl_cents),
        "line_items[0][price_data][recurring][interval]": "month",
        "line_items[0][price_data][product_data][name]": "LLM Council Pro",
        "line_items[0][price_data][product_data][description]": "Pro monthly plan",
        "client_reference_id": user_id,
        "metadata[user_id]": user_id,
        "metadata[plan]": "pro",
    }
    if isinstance(user_email, str) and user_email:
        payload["customer_email"] = user_email

    data = await stripe_request(
        "POST",
        "/v1/checkout/sessions",
        data=payload,
    )

    checkout_url = data.get("url")
    if not checkout_url:
        raise HTTPException(
            status_code=502,
            detail="Stripe checkout URL not returned.",
        )

    return {
        "session_id": data.get("id"),
        "checkout_url": checkout_url,
    }


async def confirm_checkout_session(
    *,
    session_id: str,
    user_id: str,
) -> Dict[str, Any]:
    """Confirm a checkout session and reconcile account plan ownership."""
    normalized_session_id = (session_id or "").strip()
    if not normalized_session_id:
        raise HTTPException(status_code=400, detail="session_id is required.")

    checkout_session = await stripe_request(
        "GET",
        f"/v1/checkout/sessions/{normalized_session_id}",
        params={"expand[]": "subscription"},
    )

    checkout_user_id = extract_checkout_user_id(checkout_session)
    if checkout_user_id != user_id:
        raise HTTPException(
            status_code=403,
            detail="Checkout session does not belong to this user.",
        )

    result = await reconcile_checkout_session_to_plan(
        checkout_session,
        event_type="checkout.session.confirmed",
        stripe_event_id=None,
    )
    return {
        "session_id": normalized_session_id,
        "plan": result["plan"],
        "linked": True,
    }


async def process_stripe_webhook(
    payload: bytes,
    stripe_signature: str | None,
) -> Dict[str, Any]:
    """Process Stripe webhook payloads for checkout reconciliation."""
    if not payload:
        raise HTTPException(status_code=400, detail="Missing webhook payload.")

    if STRIPE_WEBHOOK_SECRET and not stripe_signature:
        raise HTTPException(status_code=400, detail="Missing Stripe-Signature header.")

    if not verify_stripe_signature(payload, stripe_signature or ""):
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
            await reconcile_checkout_session_to_plan(
                data_object,
                event_type=event_type,
                stripe_event_id=stripe_event_id,
            )
        except HTTPException:
            # Acknowledge webhook to avoid retries on irrecoverable payload mismatch.
            return {"received": True, "processed": False}

    return {"received": True}
