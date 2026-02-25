"""Supabase authentication helpers."""

from typing import Any, Dict, List

import httpx
from fastapi import HTTPException

from .config import SUPABASE_SECRET_KEY, SUPABASE_URL


ROLE_USER = "user"
ROLE_ADMIN = "admin"
VALID_USER_ROLES = {ROLE_USER, ROLE_ADMIN}


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


def _admin_headers(api_key: str) -> Dict[str, str]:
    """Headers for Supabase admin API calls."""
    return {
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


def normalize_user_role(value: Any) -> str:
    """Normalize role text to the accepted role set."""
    if not isinstance(value, str):
        return ROLE_USER
    normalized = value.strip().lower()
    if normalized in VALID_USER_ROLES:
        return normalized
    return ROLE_USER


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


async def get_user_by_id_admin(user_id: str) -> Dict[str, Any]:
    """Fetch a user by id through Supabase admin API."""
    supabase_url, api_key = _ensure_supabase_config()
    url = f"{supabase_url}/auth/v1/admin/users/{user_id}"

    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(url, headers=_admin_headers(api_key))

    data = response.json()
    if response.status_code >= 400:
        raise HTTPException(
            status_code=response.status_code,
            detail=_extract_error_message(data, "Failed to fetch user."),
        )

    if isinstance(data, dict) and isinstance(data.get("user"), dict):
        return data["user"]
    if isinstance(data, dict):
        return data
    raise HTTPException(status_code=502, detail="Invalid user payload from Supabase.")


async def _update_user_app_metadata(
    user_id: str, app_metadata: Dict[str, Any]
) -> Dict[str, Any]:
    """Persist full app_metadata payload for a Supabase auth user."""
    supabase_url, api_key = _ensure_supabase_config()
    url = f"{supabase_url}/auth/v1/admin/users/{user_id}"

    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.put(
            url,
            headers=_admin_headers(api_key),
            json={"app_metadata": app_metadata},
        )

    data = response.json()
    if response.status_code >= 400:
        raise HTTPException(
            status_code=response.status_code,
            detail=_extract_error_message(data, "Failed to update user metadata."),
        )

    if isinstance(data, dict) and isinstance(data.get("user"), dict):
        return data["user"]
    if isinstance(data, dict):
        return data
    raise HTTPException(status_code=502, detail="Invalid user payload from Supabase.")


async def ensure_default_user_role_metadata(user_id: str) -> Dict[str, Any]:
    """Ensure a newly-created account has the default 'user' app role."""
    existing_user = await get_user_by_id_admin(user_id)
    existing_app_metadata = existing_user.get("app_metadata") or {}
    if not isinstance(existing_app_metadata, dict):
        existing_app_metadata = {}

    raw_role = existing_app_metadata.get("role")
    if isinstance(raw_role, str) and raw_role.strip().lower() in VALID_USER_ROLES:
        return existing_user

    merged_app_metadata = {
        **existing_app_metadata,
        "role": ROLE_USER,
    }
    return await _update_user_app_metadata(user_id, merged_app_metadata)


async def list_users_admin(per_page: int = 200) -> List[Dict[str, Any]]:
    """List all auth users via Supabase admin API, paginating as needed."""
    supabase_url, api_key = _ensure_supabase_config()
    url = f"{supabase_url}/auth/v1/admin/users"

    safe_per_page = max(1, min(int(per_page), 1000))
    page = 1
    users: List[Dict[str, Any]] = []

    async with httpx.AsyncClient(timeout=20) as client:
        while True:
            response = await client.get(
                url,
                headers=_admin_headers(api_key),
                params={"page": page, "per_page": safe_per_page},
            )

            data = response.json()
            if response.status_code >= 400:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=_extract_error_message(data, "Failed to list users."),
                )

            batch = data.get("users")
            if not isinstance(batch, list):
                raise HTTPException(
                    status_code=502,
                    detail="Invalid users payload from Supabase.",
                )

            users.extend(user for user in batch if isinstance(user, dict))

            next_page = data.get("next_page")
            if next_page is None or next_page == "":
                if len(batch) < safe_per_page:
                    break
                page += 1
                continue

            try:
                next_page_int = int(next_page)
            except (TypeError, ValueError):
                break

            if next_page_int <= page:
                break
            page = next_page_int

    return users


async def update_user_plan_metadata(
    user_id: str,
    plan: str,
    *,
    stripe_customer_id: str | None = None,
    stripe_subscription_id: str | None = None,
) -> Dict[str, Any]:
    """Set account plan metadata for a Supabase auth user."""
    normalized_plan = (plan or "free").strip().lower()
    if normalized_plan not in {"free", "pro"}:
        normalized_plan = "free"

    existing_user = await get_user_by_id_admin(user_id)
    existing_app_metadata = existing_user.get("app_metadata") or {}
    if not isinstance(existing_app_metadata, dict):
        existing_app_metadata = {}

    billing_metadata = existing_app_metadata.get("billing") or {}
    if not isinstance(billing_metadata, dict):
        billing_metadata = {}

    billing_metadata["plan"] = normalized_plan
    if stripe_customer_id:
        billing_metadata["stripe_customer_id"] = stripe_customer_id
    if stripe_subscription_id:
        billing_metadata["stripe_subscription_id"] = stripe_subscription_id

    merged_app_metadata = {
        **existing_app_metadata,
        "plan": normalized_plan,
        "billing": billing_metadata,
    }

    return await _update_user_app_metadata(user_id, merged_app_metadata)


async def update_user_role_metadata(user_id: str, role: str) -> Dict[str, Any]:
    """Set app role metadata for a Supabase auth user."""
    normalized_role = normalize_user_role(role)

    existing_user = await get_user_by_id_admin(user_id)
    existing_app_metadata = existing_user.get("app_metadata") or {}
    if not isinstance(existing_app_metadata, dict):
        existing_app_metadata = {}

    merged_app_metadata = {
        **existing_app_metadata,
        "role": normalized_role,
    }
    return await _update_user_app_metadata(user_id, merged_app_metadata)
