"""OpenRouter API client for making LLM requests."""

import asyncio
import httpx
from typing import List, Dict, Any, Optional
from .config import OPENROUTER_API_KEY, OPENROUTER_API_URL


def _to_int(value: Any) -> int:
    """Convert a value to int, returning 0 when conversion is not possible."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _to_float(value: Any) -> Optional[float]:
    """Convert a value to float, returning None when conversion is not possible."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


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


async def query_model(
    model: str,
    messages: List[Dict[str, Any]],
    timeout: float = 120.0,
    session_id: str | None = None,
    metadata: Dict[str, str] | None = None,
    plugins: List[Dict[str, Any]] | None = None,
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
    normalized_session_id = (
        session_id.strip()[:128]
        if isinstance(session_id, str) and session_id.strip()
        else None
    )
    if normalized_session_id:
        payload["session_id"] = normalized_session_id
        headers["X-Session-Id"] = normalized_session_id

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
        )
        for model in models
    ]

    # Wait for all to complete
    responses = await asyncio.gather(*tasks)

    # Map models to their responses
    return {model: response for model, response in zip(models, responses)}
