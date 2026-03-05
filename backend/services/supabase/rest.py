"""Shared Supabase config, headers, and HTTP helpers."""

from typing import Any, Dict, Optional

import httpx
from fastapi import HTTPException

from ...config import SUPABASE_SECRET_KEY, SUPABASE_URL


def ensure_supabase_auth_config() -> tuple[str, str]:
    """Return validated Supabase config values for auth/admin flows."""
    if not SUPABASE_URL:
        raise HTTPException(
            status_code=500,
            detail=(
                "Supabase is not configured. Missing SUPABASE_URL (or SUPABASE_PROJECT_URL) "
                "in environment."
            ),
        )

    if not SUPABASE_SECRET_KEY:
        raise HTTPException(
            status_code=500,
            detail=(
                "Supabase is not configured. Missing SUPABASE_API_KEY_SECRET "
                "(or SUPABASE_SERVICE_ROLE_KEY) in environment."
            ),
        )

    return SUPABASE_URL.rstrip("/"), SUPABASE_SECRET_KEY


def ensure_supabase_db_config() -> tuple[str, str]:
    """Return validated Supabase config values for PostgREST data access."""
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


def build_service_role_headers(
    api_key: str,
    *,
    include_content_type: bool = False,
) -> Dict[str, str]:
    """Build standard service-role Supabase headers."""
    headers: Dict[str, str] = {
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
    }
    if include_content_type:
        headers["Content-Type"] = "application/json"
    return headers


def extract_auth_error_message(payload: Any, fallback: str) -> str:
    """Extract a readable auth/admin API error message."""
    if isinstance(payload, dict):
        return (
            payload.get("msg")
            or payload.get("error_description")
            or payload.get("error")
            or fallback
        )
    return fallback


def extract_db_error_message(payload: Any, fallback: str) -> str:
    """Extract readable error messages from PostgREST payloads."""
    if isinstance(payload, dict):
        return (
            payload.get("message")
            or payload.get("hint")
            or payload.get("details")
            or fallback
        )
    return fallback


async def rest_request(
    method: str,
    resource: str,
    *,
    params: Optional[Dict[str, str]] = None,
    json_body: Optional[Dict[str, Any]] = None,
    prefer: Optional[str] = None,
):
    """Make an authenticated request to Supabase PostgREST."""
    supabase_url, api_key = ensure_supabase_db_config()
    url = f"{supabase_url}/rest/v1/{resource}"

    headers = build_service_role_headers(
        api_key,
        include_content_type=json_body is not None,
    )
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
            extract_db_error_message(
                payload, f"Database request failed ({response.status_code})."
            )
        )

    if not response.content:
        return None

    try:
        return response.json()
    except ValueError:
        return None
