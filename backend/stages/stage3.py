"""Stage 3: chairman synthesis."""

from typing import Any, Dict, List

from ..config import CHAIRMAN_MODEL
from ..openrouter import query_model
from .shared import empty_usage_summary, history_to_context_text


async def stage3_synthesize_final(
    user_query: str,
    stage1_results: List[Dict[str, Any]],
    stage2_results: List[Dict[str, Any]],
    conversation_history: List[Dict[str, str]] | None = None,
    session_id: str | None = None,
    user_attachments: List[Dict[str, Any]] | None = None,
    plugins: List[Dict[str, Any]] | None = None,
) -> Dict[str, Any]:
    """
    Stage 3: chairman synthesizes final response.

    Args:
        user_query: The original user query.
        stage1_results: Individual model responses from Stage 1.
        stage2_results: Rankings from Stage 2.

    Returns:
        Dict with model and response keys.
    """
    stage1_text = "\n\n".join(
        [
            f"Model: {result['model']}\nResponse: {result['response']}"
            for result in stage1_results
        ]
    )

    stage2_text = "\n\n".join(
        [
            f"Model: {result['model']}\nRanking: {result['ranking']}"
            for result in stage2_results
        ]
    )

    conversation_context_text = history_to_context_text(conversation_history)
    context_block = ""
    if conversation_context_text:
        context_block = f"""Conversation Context (previous turns):
{conversation_context_text}

"""

    chairman_prompt = f"""You are the Chairman of an LLM Council. Multiple AI models have provided responses to a user's question, and then ranked each other's responses.

{context_block}Current Question: {user_query}

STAGE 1 - Individual Responses:
{stage1_text}

STAGE 2 - Peer Rankings:
{stage2_text}

Your task as Chairman is to synthesize all of this information into a single, comprehensive, accurate answer to the user's original question. Consider:
- The individual responses and their insights
- The peer rankings and what they reveal about response quality
- Any patterns of agreement or disagreement

Provide a clear, well-reasoned final answer that represents the council's collective wisdom:"""

    if isinstance(user_attachments, list) and user_attachments:
        user_content_parts: List[Dict[str, Any]] = [{"type": "text", "text": chairman_prompt}]
        for attachment in user_attachments:
            if isinstance(attachment, dict):
                user_content_parts.append(attachment)
        messages: List[Dict[str, Any]] = [{"role": "user", "content": user_content_parts}]
    else:
        messages = [{"role": "user", "content": chairman_prompt}]

    response = await query_model(
        CHAIRMAN_MODEL,
        messages,
        session_id=session_id,
        metadata={"stage": "stage3"},
        plugins=plugins,
    )

    if response is None:
        return {
            "model": CHAIRMAN_MODEL,
            "response": "Error: Unable to generate final synthesis.",
            "usage": empty_usage_summary(),
        }

    return {
        "model": CHAIRMAN_MODEL,
        "response": response.get("content", ""),
        "usage": response.get("usage", empty_usage_summary()),
    }
