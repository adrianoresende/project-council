"""Supabase Postgres storage for conversations."""

from typing import Any, Dict, List, Optional
from datetime import datetime, timezone

import httpx

from .config import SUPABASE_SECRET_KEY, SUPABASE_URL


def _to_int(value: Any) -> int:
    """Best-effort integer conversion."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _to_float(value: Any) -> float | None:
    """Best-effort float conversion."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_iso_datetime(value: Any) -> str | None:
    """Best-effort conversion to ISO datetime in UTC."""
    if isinstance(value, str) and value.strip():
        return value.strip()

    timestamp = _to_int(value)
    if timestamp <= 0:
        return None
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()


def _empty_usage_summary() -> Dict[str, Any]:
    """Return a normalized usage summary payload."""
    return {
        "input_tokens": 0,
        "output_tokens": 0,
        "total_tokens": 0,
        "total_cost": 0.0,
        "model_calls": 0,
    }


def _add_usage_summary(total: Dict[str, Any], summary: Any):
    """Accumulate a normalized usage summary into a running total."""
    if not isinstance(summary, dict):
        return

    total["input_tokens"] += _to_int(summary.get("input_tokens"))
    total["output_tokens"] += _to_int(summary.get("output_tokens"))
    total["total_tokens"] += _to_int(summary.get("total_tokens"))
    total["model_calls"] += _to_int(summary.get("model_calls"))

    total_cost = _to_float(summary.get("total_cost"))
    if total_cost is not None:
        total["total_cost"] += total_cost


def _add_single_call_usage(total: Dict[str, Any], usage: Any):
    """Accumulate usage from one model invocation."""
    if not isinstance(usage, dict):
        return

    total["input_tokens"] += _to_int(usage.get("input_tokens"))
    total["output_tokens"] += _to_int(usage.get("output_tokens"))
    total["total_tokens"] += _to_int(usage.get("total_tokens"))

    cost = _to_float(usage.get("cost"))
    if cost is None:
        cost = _to_float(usage.get("total_cost"))
    if cost is not None:
        total["total_cost"] += cost

    total["model_calls"] += 1


def _calculate_message_usage(
    stage1: Any,
    stage2: Any,
    stage3: Any,
    persisted_total_tokens: Any = None,
    persisted_cost: Any = None,
) -> Dict[str, Any]:
    """Aggregate usage for a single assistant message payload."""
    usage = _empty_usage_summary()

    if isinstance(stage1, list):
        for item in stage1:
            if isinstance(item, dict):
                _add_single_call_usage(usage, item.get("usage"))

    if isinstance(stage2, list):
        for item in stage2:
            if isinstance(item, dict):
                _add_single_call_usage(usage, item.get("usage"))

    if isinstance(stage3, dict):
        _add_single_call_usage(usage, stage3.get("usage"))
        _add_single_call_usage(usage, stage3.get("title_usage"))

    # Prefer persisted column totals when available, but keep stage-derived
    # values as fallback for older rows that may not have been backfilled.
    total_tokens_from_column = _to_int(persisted_total_tokens)
    if total_tokens_from_column > 0:
        usage["total_tokens"] = total_tokens_from_column

    cost_from_column = _to_float(persisted_cost)
    if cost_from_column is not None and cost_from_column > 0:
        usage["total_cost"] = cost_from_column

    usage["total_cost"] = round(usage["total_cost"], 8)
    return usage


def _build_stage_metadata(stage1: Any, stage2: Any, usage: Dict[str, Any]) -> Dict[str, Any]:
    """Reconstruct stage metadata needed by the frontend from stored stage payloads."""
    metadata: Dict[str, Any] = {"usage": usage}
    if not isinstance(stage1, list) or not isinstance(stage2, list):
        return metadata

    label_to_model: Dict[str, str] = {}
    for index, result in enumerate(stage1):
        if not isinstance(result, dict):
            continue
        model = result.get("model")
        if not isinstance(model, str):
            continue
        label_to_model[f"Response {chr(65 + index)}"] = model

    if not label_to_model:
        return metadata

    normalized_stage2 = []
    for item in stage2:
        if not isinstance(item, dict):
            continue
        ranking_text = item.get("ranking")
        if not isinstance(ranking_text, str):
            continue
        normalized_stage2.append(item)

    from .council import calculate_aggregate_rankings

    metadata["label_to_model"] = label_to_model
    metadata["aggregate_rankings"] = calculate_aggregate_rankings(
        normalized_stage2, label_to_model
    )
    return metadata


def _ensure_supabase_db_config() -> tuple[str, str]:
    """Return validated Supabase REST config values."""
    if not SUPABASE_URL:
        raise RuntimeError(
            "Supabase DB is not configured. Missing SUPABASE_URL (or SUPABASE_PROJECT_URL)."
        )
    if not SUPABASE_SECRET_KEY:
        raise RuntimeError(
            "Supabase DB is not configured. Missing SUPABASE_API_KEY_SECRET "
            "(or SUPABASE_SERVICE_ROLE_KEY)."
        )
    return SUPABASE_URL.rstrip("/"), SUPABASE_SECRET_KEY


def _extract_error_message(payload: Any, fallback: str) -> str:
    """Extract readable error messages from PostgREST payloads."""
    if isinstance(payload, dict):
        return (
            payload.get("message")
            or payload.get("hint")
            or payload.get("details")
            or fallback
        )
    return fallback


async def _rest_request(
    method: str,
    resource: str,
    *,
    params: Optional[Dict[str, str]] = None,
    json_body: Optional[Dict[str, Any]] = None,
    prefer: Optional[str] = None,
):
    """Make an authenticated request to Supabase PostgREST."""
    supabase_url, api_key = _ensure_supabase_db_config()
    url = f"{supabase_url}/rest/v1/{resource}"

    headers: Dict[str, str] = {
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
    }
    if json_body is not None:
        headers["Content-Type"] = "application/json"
    if prefer:
        headers["Prefer"] = prefer

    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.request(
            method=method,
            url=url,
            params=params,
            json=json_body,
            headers=headers,
        )

    if response.status_code >= 400:
        try:
            payload = response.json()
        except ValueError:
            payload = None
        raise RuntimeError(
            _extract_error_message(payload, f"Database request failed ({response.status_code}).")
        )

    if not response.content:
        return None

    try:
        return response.json()
    except ValueError:
        return None


async def _get_conversation_row(
    conversation_id: str, user_id: str
) -> Optional[Dict[str, Any]]:
    """Load a single conversation row owned by the provided user."""
    rows = await _rest_request(
        "GET",
        "conversations",
        params={
            "select": "id,created_at,title,user_id,archived",
            "id": f"eq.{conversation_id}",
            "user_id": f"eq.{user_id}",
            "limit": "1",
        },
    )
    if not rows:
        return None
    return rows[0]


async def create_conversation(conversation_id: str, user_id: str) -> Dict[str, Any]:
    """Create a new conversation owned by user_id."""
    rows = await _rest_request(
        "POST",
        "conversations",
        json_body={
            "id": conversation_id,
            "user_id": user_id,
            "title": "New Conversation",
            "archived": False,
        },
        prefer="return=representation",
    )
    row = rows[0]
    return {
        "id": row["id"],
        "created_at": row["created_at"],
        "title": row.get("title") or "New Conversation",
        "archived": bool(row.get("archived", False)),
        "messages": [],
        "usage": _empty_usage_summary(),
    }


async def get_conversation(conversation_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    """Load conversation and its messages only if owned by user_id."""
    conversation_row = await _get_conversation_row(conversation_id, user_id)
    if conversation_row is None:
        return None

    message_rows = await _rest_request(
        "GET",
        "messages",
        params={
            "select": "id,role,content,stage1,stage2,stage3,cost,total_tokens,created_at",
            "conversation_id": f"eq.{conversation_id}",
            "order": "created_at.asc,id.asc",
        },
    )

    messages: List[Dict[str, Any]] = []
    conversation_usage = _empty_usage_summary()
    for row in message_rows or []:
        if row["role"] == "user":
            messages.append(
                {
                    "role": "user",
                    "content": row.get("content", ""),
                }
            )
            continue

        stage1 = row.get("stage1")
        stage2 = row.get("stage2")
        stage3 = row.get("stage3")
        message_usage = _calculate_message_usage(
            stage1,
            stage2,
            stage3,
            row.get("total_tokens"),
            row.get("cost"),
        )
        _add_usage_summary(conversation_usage, message_usage)

        messages.append(
            {
                "role": "assistant",
                "stage1": stage1,
                "stage2": stage2,
                "stage3": stage3,
                "usage": message_usage,
                "metadata": _build_stage_metadata(stage1, stage2, message_usage),
            }
        )

    conversation_usage["total_cost"] = round(conversation_usage["total_cost"], 8)

    return {
        "id": conversation_row["id"],
        "created_at": conversation_row["created_at"],
        "title": conversation_row.get("title") or "New Conversation",
        "archived": bool(conversation_row.get("archived", False)),
        "messages": messages,
        "usage": conversation_usage,
    }


async def list_conversations(user_id: str, archived: bool = False) -> List[Dict[str, Any]]:
    """List conversation metadata for a single authenticated user."""
    rows = await _rest_request(
        "GET",
        "conversations",
        params={
            "select": "id,created_at,title,archived",
            "user_id": f"eq.{user_id}",
            "archived": f"eq.{str(archived).lower()}",
            "order": "created_at.desc",
        },
    )

    if not rows:
        return []

    conversation_ids = [row["id"] for row in rows]
    conversation_id_list = ",".join(conversation_ids)
    message_rows = await _rest_request(
        "GET",
        "messages",
        params={
            "select": "conversation_id,role,stage1,stage2,stage3,cost,total_tokens",
            "conversation_id": f"in.({conversation_id_list})",
        },
    )

    message_counts: Dict[str, int] = {}
    usage_totals: Dict[str, Dict[str, Any]] = {
        conversation_id: _empty_usage_summary() for conversation_id in conversation_ids
    }
    for row in message_rows or []:
        conversation_id = row["conversation_id"]
        message_counts[conversation_id] = message_counts.get(conversation_id, 0) + 1
        if row.get("role") != "assistant":
            continue

        message_usage = _calculate_message_usage(
            row.get("stage1"),
            row.get("stage2"),
            row.get("stage3"),
            row.get("total_tokens"),
            row.get("cost"),
        )
        _add_usage_summary(usage_totals[conversation_id], message_usage)

    for usage in usage_totals.values():
        usage["total_cost"] = round(usage["total_cost"], 8)

    return [
        {
            "id": row["id"],
            "created_at": row["created_at"],
            "title": row.get("title") or "New Conversation",
            "archived": bool(row.get("archived", False)),
            "message_count": message_counts.get(row["id"], 0),
            "usage": usage_totals.get(row["id"], _empty_usage_summary()),
        }
        for row in rows
    ]


async def add_user_message(conversation_id: str, user_id: str, content: str):
    """Add a user message to a user-owned conversation."""
    conversation_row = await _get_conversation_row(conversation_id, user_id)
    if conversation_row is None:
        raise ValueError(f"Conversation {conversation_id} not found")

    await _rest_request(
        "POST",
        "messages",
        json_body={
            "conversation_id": conversation_id,
            "role": "user",
            "content": content,
        },
        prefer="return=minimal",
    )


async def add_assistant_message(
    conversation_id: str,
    user_id: str,
    stage1: List[Dict[str, Any]],
    stage2: List[Dict[str, Any]],
    stage3: Dict[str, Any],
):
    """Add the assistant's staged response to a user-owned conversation."""
    conversation_row = await _get_conversation_row(conversation_id, user_id)
    if conversation_row is None:
        raise ValueError(f"Conversation {conversation_id} not found")

    message_usage = _calculate_message_usage(stage1, stage2, stage3)

    await _rest_request(
        "POST",
        "messages",
        json_body={
            "conversation_id": conversation_id,
            "role": "assistant",
            "content": None,
            "stage1": stage1,
            "stage2": stage2,
            "stage3": stage3,
            "cost": message_usage["total_cost"],
            "total_tokens": message_usage["total_tokens"],
        },
        prefer="return=minimal",
    )


async def update_conversation_title(conversation_id: str, user_id: str, title: str):
    """Update the title for a user-owned conversation."""
    conversation_row = await _get_conversation_row(conversation_id, user_id)
    if conversation_row is None:
        raise ValueError(f"Conversation {conversation_id} not found")

    await _rest_request(
        "PATCH",
        "conversations",
        params={
            "id": f"eq.{conversation_id}",
            "user_id": f"eq.{user_id}",
        },
        json_body={"title": title},
        prefer="return=minimal",
    )


async def update_conversation_archived(
    conversation_id: str,
    user_id: str,
    archived: bool,
):
    """Update archived state for a user-owned conversation."""
    conversation_row = await _get_conversation_row(conversation_id, user_id)
    if conversation_row is None:
        raise ValueError(f"Conversation {conversation_id} not found")

    await _rest_request(
        "PATCH",
        "conversations",
        params={
            "id": f"eq.{conversation_id}",
            "user_id": f"eq.{user_id}",
        },
        json_body={"archived": archived},
        prefer="return=minimal",
    )


def _parse_credit_result(result: Any) -> int:
    """Normalize RPC credit result payloads into an integer."""
    if isinstance(result, int):
        return result

    if isinstance(result, dict):
        for key in ("credits", "get_account_credits", "add_account_credits", "consume_account_credit"):
            value = result.get(key)
            if isinstance(value, int):
                return value

    if isinstance(result, list) and result:
        first = result[0]
        if isinstance(first, int):
            return first
        if isinstance(first, dict):
            return _parse_credit_result(first)

    raise RuntimeError("Unexpected credit response from database.")


async def _ensure_credit_account(user_id: str):
    """Ensure a credit row exists for the user without overwriting current balance."""
    await _rest_request(
        "POST",
        "account_credits",
        params={"on_conflict": "user_id"},
        json_body={"user_id": user_id, "credits": 0},
        prefer="resolution=ignore-duplicates,return=minimal",
    )


async def get_account_credits(user_id: str) -> int:
    """Return the current credit balance for a user."""
    await _ensure_credit_account(user_id)
    rows = await _rest_request(
        "GET",
        "account_credits",
        params={
            "select": "credits",
            "user_id": f"eq.{user_id}",
            "limit": "1",
        },
    )
    if not rows:
        return 0
    return int(rows[0].get("credits", 0))


async def add_account_credits(user_id: str, amount: int) -> int:
    """Add credits to a user account and return updated balance."""
    if amount <= 0:
        raise ValueError("Credit amount must be greater than zero.")

    result = await _rest_request(
        "POST",
        "rpc/add_account_credits",
        json_body={
            "p_user_id": user_id,
            "p_amount": amount,
        },
    )
    return _parse_credit_result(result)


async def consume_account_credit(user_id: str) -> int:
    """Consume one credit from a user account and return remaining balance."""
    try:
        result = await _rest_request(
            "POST",
            "rpc/consume_account_credit",
            json_body={"p_user_id": user_id},
        )
        return _parse_credit_result(result)
    except RuntimeError as error:
        if "INSUFFICIENT_CREDITS" in str(error):
            raise ValueError(
                "Insufficient credits. Add credits to send a message."
            ) from error
        raise


async def upsert_billing_payment(
    user_id: str,
    checkout_session: Dict[str, Any],
    *,
    event_type: str,
    stripe_event_id: str | None = None,
    paid_at: str | None = None,
    next_payment_at: str | None = None,
) -> Dict[str, Any]:
    """Create or update a billing payment row for a checkout session."""
    session_id = checkout_session.get("id")
    if not isinstance(session_id, str) or not session_id.strip():
        raise RuntimeError("Stripe checkout session id is required to persist billing payment.")

    currency = checkout_session.get("currency")
    if not isinstance(currency, str):
        currency = "brl"
    currency = currency.strip().lower() or "brl"

    customer_id = checkout_session.get("customer")
    if not isinstance(customer_id, str):
        customer_id = None

    payment_intent_id = checkout_session.get("payment_intent")
    if not isinstance(payment_intent_id, str):
        payment_intent_id = None

    invoice_id = checkout_session.get("invoice")
    if not isinstance(invoice_id, str):
        invoice_id = None

    subscription_field = checkout_session.get("subscription")
    subscription_id = (
        subscription_field.get("id")
        if isinstance(subscription_field, dict)
        else subscription_field
    )
    if not isinstance(subscription_id, str):
        subscription_id = None

    metadata = checkout_session.get("metadata") or {}
    if not isinstance(metadata, dict):
        metadata = {}
    plan = metadata.get("plan")
    if not isinstance(plan, str) or not plan.strip():
        plan = "free"
    normalized_plan = plan.strip().lower()
    if normalized_plan not in {"free", "pro"}:
        normalized_plan = "free"

    amount_total = _to_int(checkout_session.get("amount_total"))
    checkout_status = checkout_session.get("status")
    if not isinstance(checkout_status, str):
        checkout_status = "unknown"

    payment_status = checkout_session.get("payment_status")
    if not isinstance(payment_status, str):
        payment_status = "unknown"

    normalized_paid_at = paid_at
    if not normalized_paid_at and payment_status in {"paid", "no_payment_required"}:
        normalized_paid_at = datetime.now(timezone.utc).isoformat()

    normalized_next_payment_at = next_payment_at

    rows = await _rest_request(
        "POST",
        "billing_payments",
        params={"on_conflict": "stripe_checkout_session_id"},
        json_body={
            "stripe_checkout_session_id": session_id,
            "user_id": user_id,
            "plan": normalized_plan,
            "amount_total": amount_total,
            "currency": currency,
            "checkout_status": checkout_status,
            "payment_status": payment_status,
            "stripe_customer_id": customer_id,
            "stripe_subscription_id": subscription_id,
            "stripe_payment_intent_id": payment_intent_id,
            "stripe_invoice_id": invoice_id,
            "last_event_type": event_type,
            "stripe_event_id": stripe_event_id,
            "paid_at": normalized_paid_at,
            "next_payment_at": normalized_next_payment_at,
            "processed_at": datetime.now(timezone.utc).isoformat(),
            "payload": checkout_session,
        },
        prefer="resolution=merge-duplicates,return=representation",
    )

    if isinstance(rows, list) and rows:
        return rows[0]
    return {}


async def list_billing_payments(user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Return recent billing payments for a user."""
    safe_limit = min(max(limit, 1), 200)
    rows = await _rest_request(
        "GET",
        "billing_payments",
        params={
            "select": (
                "stripe_checkout_session_id,plan,amount_total,currency,checkout_status,"
                "payment_status,stripe_customer_id,stripe_subscription_id,"
                "stripe_payment_intent_id,stripe_invoice_id,last_event_type,"
                "stripe_event_id,paid_at,next_payment_at,processed_at,created_at"
            ),
            "user_id": f"eq.{user_id}",
            "order": "processed_at.desc",
            "limit": str(safe_limit),
        },
    )

    if not isinstance(rows, list):
        return []
    return rows
