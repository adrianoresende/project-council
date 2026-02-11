"""Supabase authentication helpers."""

from typing import Any, Dict

import httpx
from fastapi import HTTPException

from .config import SUPABASE_SECRET_KEY, SUPABASE_URL


def _ensure_supabase_config() -> tuple[str, str]:
    """Return validated Supabase config values."""
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


def _extract_error_message(payload: Dict[str, Any], fallback: str) -> str:
    """Extract a readable error from Supabase's error shape."""
    return (
        payload.get("msg")
        or payload.get("error_description")
        or payload.get("error")
        or fallback
    )


async def register_user(email: str, password: str) -> Dict[str, Any]:
    """Register a Supabase user with email/password."""
    supabase_url, api_key = _ensure_supabase_config()
    url = f"{supabase_url}/auth/v1/signup"

    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            url,
            headers={
                "apikey": api_key,
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={"email": email, "password": password},
        )

    data = response.json()
    if response.status_code >= 400:
        raise HTTPException(
            status_code=response.status_code,
            detail=_extract_error_message(data, "Failed to register user."),
        )

    return data


async def login_user(email: str, password: str) -> Dict[str, Any]:
    """Sign in a Supabase user with email/password."""
    supabase_url, api_key = _ensure_supabase_config()
    url = f"{supabase_url}/auth/v1/token?grant_type=password"

    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            url,
            headers={
                "apikey": api_key,
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={"email": email, "password": password},
        )

    data = response.json()
    if response.status_code >= 400:
        raise HTTPException(
            status_code=response.status_code,
            detail=_extract_error_message(data, "Invalid email or password."),
        )

    return data


async def get_user_from_token(access_token: str) -> Dict[str, Any]:
    """Validate access token and return user profile from Supabase."""
    supabase_url, api_key = _ensure_supabase_config()
    url = f"{supabase_url}/auth/v1/user"

    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(
            url,
            headers={
                "apikey": api_key,
                "Authorization": f"Bearer {access_token}",
            },
        )

    data = response.json()
    if response.status_code >= 400:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")

    return data
