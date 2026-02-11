"""Supabase Postgres storage for conversations."""

from typing import Any, Dict, List, Optional

import httpx

from .config import SUPABASE_SECRET_KEY, SUPABASE_URL


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
            "select": "id,created_at,title,user_id",
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
        },
        prefer="return=representation",
    )
    row = rows[0]
    return {
        "id": row["id"],
        "created_at": row["created_at"],
        "title": row.get("title") or "New Conversation",
        "messages": [],
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
            "select": "id,role,content,stage1,stage2,stage3,created_at",
            "conversation_id": f"eq.{conversation_id}",
            "order": "created_at.asc,id.asc",
        },
    )

    messages: List[Dict[str, Any]] = []
    for row in message_rows or []:
        if row["role"] == "user":
            messages.append(
                {
                    "role": "user",
                    "content": row.get("content", ""),
                }
            )
            continue

        messages.append(
            {
                "role": "assistant",
                "stage1": row.get("stage1"),
                "stage2": row.get("stage2"),
                "stage3": row.get("stage3"),
            }
        )

    return {
        "id": conversation_row["id"],
        "created_at": conversation_row["created_at"],
        "title": conversation_row.get("title") or "New Conversation",
        "messages": messages,
    }


async def list_conversations(user_id: str) -> List[Dict[str, Any]]:
    """List conversation metadata for a single authenticated user."""
    rows = await _rest_request(
        "GET",
        "conversations",
        params={
            "select": "id,created_at,title",
            "user_id": f"eq.{user_id}",
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
            "select": "conversation_id",
            "conversation_id": f"in.({conversation_id_list})",
        },
    )

    message_counts: Dict[str, int] = {}
    for row in message_rows or []:
        conversation_id = row["conversation_id"]
        message_counts[conversation_id] = message_counts.get(conversation_id, 0) + 1

    return [
        {
            "id": row["id"],
            "created_at": row["created_at"],
            "title": row.get("title") or "New Conversation",
            "message_count": message_counts.get(row["id"], 0),
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
