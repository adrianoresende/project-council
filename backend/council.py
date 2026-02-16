"""LLM Council orchestration facade."""

from typing import Any, Dict, List, Tuple

from .stages import (
    calculate_aggregate_rankings,
    empty_usage_summary,
    generate_conversation_title,
    parse_ranking_from_text,
    stage1_collect_responses,
    stage2_collect_rankings,
    stage3_synthesize_final,
    summarize_council_usage,
)


async def run_full_council(
    user_query: str,
    conversation_history: List[Dict[str, str]] | None = None,
    session_id: str | None = None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, Any], Dict[str, Any]]:
    """
    Run the complete 3-stage council process.

    Args:
        user_query: The user's question.
        conversation_history: Previous turns in this conversation.

    Returns:
        Tuple of (stage1_results, stage2_results, stage3_result, metadata).
    """
    stage1_results = await stage1_collect_responses(
        user_query,
        conversation_history=conversation_history,
        session_id=session_id,
    )

    if not stage1_results:
        return (
            [],
            [],
            {
                "model": "error",
                "response": "All models failed to respond. Please try again.",
            },
            {},
        )

    stage2_results, label_to_model = await stage2_collect_rankings(
        user_query,
        stage1_results,
        conversation_history=conversation_history,
        session_id=session_id,
    )

    aggregate_rankings = calculate_aggregate_rankings(stage2_results, label_to_model)

    stage3_result = await stage3_synthesize_final(
        user_query,
        stage1_results,
        stage2_results,
        conversation_history=conversation_history,
        session_id=session_id,
    )

    metadata = {
        "label_to_model": label_to_model,
        "aggregate_rankings": aggregate_rankings,
        "usage": summarize_council_usage(stage1_results, stage2_results, stage3_result),
    }

    return stage1_results, stage2_results, stage3_result, metadata


__all__ = [
    "empty_usage_summary",
    "summarize_council_usage",
    "stage1_collect_responses",
    "stage2_collect_rankings",
    "stage3_synthesize_final",
    "parse_ranking_from_text",
    "calculate_aggregate_rankings",
    "generate_conversation_title",
    "run_full_council",
]
