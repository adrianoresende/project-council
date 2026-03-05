"""Stripe API client helpers."""

from typing import Any, Dict

import httpx
from fastapi import HTTPException

from ...config import STRIPE_SECRET_KEY


def _extract_stripe_error_message(payload: Any, fallback: str) -> str:
    """Extract a readable error message from Stripe JSON payloads."""
    if isinstance(payload, dict):
        return (
            payload.get("error", {}).get("message")
            or payload.get("message")
            or fallback
        )
    return fallback


async def stripe_request(
    method: str,
    path: str,
    *,
    data: Dict[str, Any] | None = None,
    params: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """Execute an authenticated Stripe API request and return a JSON object."""
    if not STRIPE_SECRET_KEY:
        raise HTTPException(
            status_code=500,
            detail="Stripe is not configured on server.",
        )

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
            message = _extract_stripe_error_message(payload, message)
        except ValueError:
            pass
        raise HTTPException(status_code=502, detail=message)

    try:
        payload = response.json()
    except ValueError as error:
        raise HTTPException(
            status_code=502,
            detail="Invalid response from Stripe.",
        ) from error

    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=502,
            detail="Invalid response shape from Stripe.",
        )
    return payload
