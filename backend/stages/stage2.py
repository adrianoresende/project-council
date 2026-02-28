"""Stage 2: peer evaluation and ranking."""

import re
from collections import defaultdict
from typing import Any, Dict, List, Tuple

from ..config import COUNCIL_MODELS
from ..openrouter import query_models_parallel
from .shared import empty_usage_summary, history_to_context_text


def parse_ranking_from_text(ranking_text: str) -> List[str]:
    """
    Parse the FINAL RANKING section from the model response.

    Args:
        ranking_text: Full text response from the model.

    Returns:
        List of response labels in ranked order.
    """
    if "FINAL RANKING:" in ranking_text:
        parts = ranking_text.split("FINAL RANKING:")
        if len(parts) >= 2:
            ranking_section = parts[1]
            numbered_matches = re.findall(r"\d+\.\s*Response [A-Z]", ranking_section)
            if numbered_matches:
                labels: List[str] = []
                for match in numbered_matches:
                    label_match = re.search(r"Response [A-Z]", match)
                    if label_match:
                        labels.append(label_match.group())
                return labels

            matches = re.findall(r"Response [A-Z]", ranking_section)
            return matches

    return re.findall(r"Response [A-Z]", ranking_text)


def calculate_aggregate_rankings(
    stage2_results: List[Dict[str, Any]],
    label_to_model: Dict[str, str],
) -> List[Dict[str, Any]]:
    """Calculate aggregate rankings across all models."""
    model_positions: dict[str, list[int]] = defaultdict(list)

    for ranking in stage2_results:
        ranking_text = ranking.get("ranking", "")
        parsed_ranking = parse_ranking_from_text(ranking_text)

        for position, label in enumerate(parsed_ranking, start=1):
            if label in label_to_model:
                model_name = label_to_model[label]
                model_positions[model_name].append(position)

    aggregate: List[Dict[str, Any]] = []
    for model, positions in model_positions.items():
        if not positions:
            continue
        avg_rank = sum(positions) / len(positions)
        aggregate.append(
            {
                "model": model,
                "average_rank": round(avg_rank, 2),
                "rankings_count": len(positions),
            }
        )

    aggregate.sort(key=lambda item: item["average_rank"])
    return aggregate


async def stage2_collect_rankings(
    user_query: str,
    stage1_results: List[Dict[str, Any]],
    conversation_history: List[Dict[str, str]] | None = None,
    session_id: str | None = None,
    council_models: List[str] | None = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    """
    Stage 2: each model ranks the anonymized responses.

    Args:
        user_query: The original user query.
        stage1_results: Results from Stage 1.

    Returns:
        Tuple of (rankings list, label_to_model mapping).
    """
    labels = [chr(65 + i) for i in range(len(stage1_results))]

    label_to_model = {
        f"Response {label}": result["model"]
        for label, result in zip(labels, stage1_results)
    }

    responses_text = "\n\n".join(
        [
            f"Response {label}:\n{result['response']}"
            for label, result in zip(labels, stage1_results)
        ]
    )

    conversation_context_text = history_to_context_text(conversation_history)
    context_block = ""
    if conversation_context_text:
        context_block = f"""Conversation Context (previous turns):
{conversation_context_text}

"""

    ranking_prompt = f"""You are evaluating different responses to the following question:

{context_block}Current Question: {user_query}

Here are the responses from different models (anonymized):

{responses_text}

Your task:
1. First, evaluate each response individually. For each response, explain what it does well and what it does poorly.
2. Then, at the very end of your response, provide a final ranking.

IMPORTANT: Your final ranking MUST be formatted EXACTLY as follows:
- Start with the line "FINAL RANKING:" (all caps, with colon)
- Then list the responses from best to worst as a numbered list
- Each line should be: number, period, space, then ONLY the response label (e.g., "1. Response A")
- Do not add any other text or explanations in the ranking section

Example of the correct format for your ENTIRE response:

Response A provides good detail on X but misses Y...
Response B is accurate but lacks depth on Z...
Response C offers the most comprehensive answer...

FINAL RANKING:
1. Response C
2. Response A
3. Response B

Now provide your evaluation and ranking:"""

    messages = [{"role": "user", "content": ranking_prompt}]

    selected_council_models = council_models if council_models else COUNCIL_MODELS
    responses = await query_models_parallel(
        selected_council_models,
        messages,
        session_id=session_id,
        metadata={"stage": "stage2"},
    )

    stage2_results: List[Dict[str, Any]] = []
    for model, response in responses.items():
        if response is None:
            continue
        full_text = response.get("content", "")
        parsed = parse_ranking_from_text(full_text)
        stage2_results.append(
            {
                "model": model,
                "ranking": full_text,
                "parsed_ranking": parsed,
                "usage": response.get("usage", empty_usage_summary()),
            }
        )

    return stage2_results, label_to_model
