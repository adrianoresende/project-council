"""Conversation title generation."""

from typing import Any, Dict

from ..openrouter import query_model
from .shared import empty_usage_summary


async def generate_conversation_title(
    user_query: str,
    session_id: str | None = None,
    openrouter_user: str | None = None,
) -> Dict[str, Any]:
    """
    Generate a short title for a conversation based on the first user message.

    Args:
        user_query: The first user message.

    Returns:
        Dict with title and usage summary.
    """
    title_prompt = f"""Generate a very short title (3-5 words maximum) that summarizes the following question.
The title should be concise and descriptive. Do not use quotes or punctuation in the title.

Question: {user_query}

Title:"""

    messages = [{"role": "user", "content": title_prompt}]

    response = await query_model(
        "google/gemini-2.5-flash",
        messages,
        timeout=30.0,
        session_id=session_id,
        metadata={"stage": "title"},
        openrouter_user=openrouter_user,
    )

    if response is None:
        return {
            "title": "New Conversation",
            "usage": empty_usage_summary(),
        }

    title = response.get("content", "New Conversation").strip()
    title = title.strip('"\'')

    if len(title) > 50:
        title = title[:47] + "..."

    return {
        "title": title,
        "usage": response.get("usage", empty_usage_summary()),
    }
