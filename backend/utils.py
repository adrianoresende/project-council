"""Shared normalization and formatting helpers for backend modules."""

from datetime import datetime, timezone
from typing import Any


def coerce_int(value: Any, default: int = 0) -> int:
    """Best-effort integer conversion."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def coerce_float(value: Any) -> float | None:
    """Best-effort float conversion."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def normalize_session_id(value: Any, max_length: int = 128) -> str | None:
    """Normalize a model/session identifier or return None when invalid."""
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if not normalized:
        return None
    return normalized[:max_length]


def normalize_plan(value: Any) -> str:
    """Normalize plan text into accepted values."""
    if not isinstance(value, str):
        return "free"
    normalized = value.strip().lower()
    if normalized == "pro":
        return "pro"
    return "free"


def unix_to_iso_datetime(value: Any) -> str | None:
    """Convert unix timestamp seconds to ISO datetime in UTC."""
    timestamp = coerce_int(value)
    if timestamp <= 0:
        return None
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()


def normalize_iso_datetime(value: Any) -> str | None:
    """Return normalized ISO datetime text or convert unix timestamp input."""
    if isinstance(value, str) and value.strip():
        return value.strip()
    return unix_to_iso_datetime(value)


def parse_iso_datetime(value: Any) -> datetime | None:
    """Best-effort parse for ISO datetime values."""
    if not isinstance(value, str) or not value.strip():
        return None
    raw_value = value.strip()
    if raw_value.endswith("Z"):
        raw_value = f"{raw_value[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(raw_value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def now_utc() -> datetime:
    """Return current UTC time (wrapper to simplify deterministic tests)."""
    return datetime.now(timezone.utc)
