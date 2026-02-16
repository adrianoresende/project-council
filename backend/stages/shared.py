"""Shared helpers for council stages."""

from typing import Any, Dict, List


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


def empty_usage_summary() -> Dict[str, Any]:
    """Return a normalized empty usage summary."""
    return {
        "input_tokens": 0,
        "output_tokens": 0,
        "total_tokens": 0,
        "total_cost": 0.0,
        "model_calls": 0,
    }


def _add_call_usage(total: Dict[str, Any], usage: Any):
    """Accumulate usage from a single model call."""
    if not isinstance(usage, dict):
        return

    total["input_tokens"] += _to_int(usage.get("input_tokens"))
    total["output_tokens"] += _to_int(usage.get("output_tokens"))
    total["total_tokens"] += _to_int(usage.get("total_tokens"))

    cost = _to_float(usage.get("cost"))
    if cost is not None:
        total["total_cost"] += cost

    total["model_calls"] += 1


def summarize_council_usage(
    stage1_results: List[Dict[str, Any]],
    stage2_results: List[Dict[str, Any]],
    stage3_result: Dict[str, Any],
) -> Dict[str, Any]:
    """Aggregate usage across stage 1, stage 2, and stage 3 model calls."""
    total = empty_usage_summary()

    for result in stage1_results:
        _add_call_usage(total, result.get("usage"))

    for result in stage2_results:
        _add_call_usage(total, result.get("usage"))

    _add_call_usage(total, stage3_result.get("usage"))

    total["total_cost"] = round(total["total_cost"], 8)
    return total


def history_to_context_text(
    conversation_history: List[Dict[str, str]] | None,
    max_chars: int = 5000,
) -> str:
    """Render structured conversation history into compact text blocks."""
    if not isinstance(conversation_history, list):
        return ""

    lines: List[str] = []
    for item in conversation_history:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        content = item.get("content")
        if role not in {"user", "assistant"}:
            continue
        if not isinstance(content, str) or not content.strip():
            continue
        label = "User" if role == "user" else "Assistant"
        lines.append(f"{label}: {content.strip()}")

    context_text = "\n\n".join(lines)
    if len(context_text) <= max_chars:
        return context_text
    return f"...{context_text[-max_chars:]}"
