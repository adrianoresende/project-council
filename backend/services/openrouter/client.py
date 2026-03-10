"""OpenRouter API client for making LLM requests."""

import asyncio
import httpx
from typing import List, Dict, Any, Optional
from ...config import OPENROUTER_API_KEY, OPENROUTER_API_URL
from ...utils import coerce_float as _to_float
from ...utils import coerce_int as _to_int
from ...utils import normalize_session_id

OPENROUTER_MODELS_API_URL = "https://openrouter.ai/api/v1/models"
OPENROUTER_MODELS_MAX_LIMIT = 200
OPENROUTER_MODELS_DEFAULT_LIMIT = 50


def _normalize_usage(raw_usage: Any) -> Dict[str, Any]:
    """
    Normalize usage payloads across OpenRouter/OpenAI-compatible key variants.

    Returns:
        Dict with input_tokens, output_tokens, total_tokens, and cost.
    """
    usage = raw_usage if isinstance(raw_usage, dict) else {}

    input_tokens = _to_int(usage.get("input_tokens", usage.get("prompt_tokens")))
    output_tokens = _to_int(
        usage.get("output_tokens", usage.get("completion_tokens"))
    )
    total_tokens = _to_int(usage.get("total_tokens"))
    if total_tokens <= 0:
        total_tokens = input_tokens + output_tokens

    cost: Optional[float] = None
    for key in ("cost", "total_cost"):
        parsed = _to_float(usage.get(key))
        if parsed is not None:
            cost = parsed
            break

    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
        "cost": cost,
    }


def _normalize_openrouter_model_row(raw_row: Any) -> Dict[str, Any] | None:
    """Normalize one OpenRouter model row into a lightweight API contract."""
    if not isinstance(raw_row, dict):
        return None

    raw_id = raw_row.get("id")
    if not isinstance(raw_id, str):
        return None
    model_id = raw_id.strip()
    if not model_id:
        return None

    raw_name = raw_row.get("name")
    model_name = raw_name.strip() if isinstance(raw_name, str) and raw_name.strip() else model_id

    category = "unknown"
    if "/" in model_id:
        candidate = model_id.split("/", 1)[0].strip().lower()
        if candidate:
            category = candidate

    context_length = _to_int(raw_row.get("context_length"))
    if context_length <= 0:
        top_provider = raw_row.get("top_provider")
        if isinstance(top_provider, dict):
            context_length = _to_int(top_provider.get("context_length"))

    return {
        "id": model_id,
        "name": model_name,
        "category": category,
        "context_length": max(0, context_length),
    }


def _openrouter_model_matches_query(model_row: Dict[str, Any], query: str | None) -> bool:
    """Return whether a normalized model row matches a search query."""
    if not isinstance(query, str):
        return True
    normalized_query = query.strip().lower()
    if not normalized_query:
        return True

    for key in ("id", "name", "category"):
        value = model_row.get(key)
        if isinstance(value, str) and normalized_query in value.lower():
            return True
    return False


async def list_openrouter_models(
    *,
    query: str | None = None,
    limit: int = OPENROUTER_MODELS_DEFAULT_LIMIT,
    timeout: float = 20.0,
) -> List[Dict[str, Any]]:
    """
    Discover OpenRouter models and normalize for admin search flows.

    Returns:
        List of {id, name, category, context_length} rows.
    """
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OpenRouter is not configured. Missing OPENROUTER_API_KEY.")

    safe_limit = min(max(int(limit), 1), OPENROUTER_MODELS_MAX_LIMIT)
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
    }

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(
                OPENROUTER_MODELS_API_URL,
                headers=headers,
            )
            response.raise_for_status()
            payload = response.json()
    except Exception as error:
        raise RuntimeError(f"Failed to fetch models from OpenRouter: {error}") from error

    raw_rows = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(raw_rows, list):
        return []

    rows: List[Dict[str, Any]] = []
    seen_model_ids: set[str] = set()
    for raw_row in raw_rows:
        normalized_row = _normalize_openrouter_model_row(raw_row)
        if normalized_row is None:
            continue

        model_id = normalized_row["id"]
        if model_id in seen_model_ids:
            continue
        seen_model_ids.add(model_id)

        if not _openrouter_model_matches_query(normalized_row, query):
            continue

        rows.append(normalized_row)
        if len(rows) >= safe_limit:
            break

    return rows


async def query_model(
    model: str,
    messages: List[Dict[str, Any]],
    timeout: float = 120.0,
    session_id: str | None = None,
    metadata: Dict[str, str] | None = None,
    plugins: List[Dict[str, Any]] | None = None,
    openrouter_user: str | None = None,
) -> Optional[Dict[str, Any]]:
    """
    Query a single model via OpenRouter API.

    Args:
        model: OpenRouter model identifier (e.g., "openai/gpt-4o")
        messages: List of message dicts with 'role' and 'content'
        timeout: Request timeout in seconds

    Returns:
        Response dict with 'content' and optional 'reasoning_details', or None if failed
    """
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": model,
        "messages": messages,
    }
    normalized_session_id = normalize_session_id(session_id)
    normalized_openrouter_user = (
        openrouter_user.strip()
        if isinstance(openrouter_user, str) and openrouter_user.strip()
        else None
    )
    if normalized_session_id:
        payload["session_id"] = normalized_session_id
        headers["X-Session-Id"] = normalized_session_id
    if normalized_openrouter_user:
        payload["user"] = normalized_openrouter_user

    if isinstance(metadata, dict) and metadata:
        metadata_payload = {
            str(key): str(value)
            for key, value in metadata.items()
            if value is not None
        }
        if metadata_payload:
            payload["metadata"] = metadata_payload

    if isinstance(plugins, list) and plugins:
        payload["plugins"] = plugins

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                OPENROUTER_API_URL,
                headers=headers,
                json=payload
            )
            response.raise_for_status()

            data = response.json()
            message = data['choices'][0]['message']
            usage = _normalize_usage(data.get("usage"))

            return {
                'content': message.get('content'),
                'reasoning_details': message.get('reasoning_details'),
                'usage': usage,
            }

    except Exception as e:
        print(f"Error querying model {model}: {e}")
        return None


async def query_models_parallel(
    models: List[str],
    messages: List[Dict[str, Any]],
    session_id: str | None = None,
    metadata: Dict[str, str] | None = None,
    plugins: List[Dict[str, Any]] | None = None,
    openrouter_user: str | None = None,
) -> Dict[str, Optional[Dict[str, Any]]]:
    """
    Query multiple models in parallel.

    Args:
        models: List of OpenRouter model identifiers
        messages: List of message dicts to send to each model

    Returns:
        Dict mapping model identifier to response dict (or None if failed)
    """
    # Create tasks for all models
    tasks = [
        query_model(
            model,
            messages,
            session_id=session_id,
            metadata=metadata,
            plugins=plugins,
            openrouter_user=openrouter_user,
        )
        for model in models
    ]

    # Wait for all to complete
    responses = await asyncio.gather(*tasks)

    # Map models to their responses
    return {model: response for model, response in zip(models, responses)}
