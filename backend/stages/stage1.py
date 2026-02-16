"""Stage 1: collect individual model responses."""

from typing import Any, Dict, List

from ..config import COUNCIL_MODELS
from ..openrouter import query_models_parallel
from .shared import empty_usage_summary


def _describe_user_attachments(user_attachments: List[Dict[str, Any]] | None) -> str:
    """Create a compact attachment summary for stage-1 prompt text."""
    if not isinstance(user_attachments, list) or not user_attachments:
        return ""

    named_files: List[str] = []
    unnamed_files = 0
    image_attachments = 0

    for attachment in user_attachments:
        if not isinstance(attachment, dict):
            continue

        attachment_type = attachment.get("type")
        if attachment_type == "file":
            file_payload = attachment.get("file")
            filename = (
                file_payload.get("filename")
                if isinstance(file_payload, dict)
                else None
            )
            if isinstance(filename, str) and filename.strip():
                named_files.append(filename.strip())
            else:
                unnamed_files += 1
        elif attachment_type == "image_url":
            image_attachments += 1

    summary_parts: List[str] = []
    if named_files:
        unique_names = list(dict.fromkeys(named_files))
        summary_parts.append(f"Named files: {', '.join(unique_names[:6])}.")
    if unnamed_files > 0:
        summary_parts.append(f"Additional file attachments: {unnamed_files}.")
    if image_attachments > 0:
        summary_parts.append(f"Image attachments: {image_attachments}.")

    return " ".join(summary_parts).strip()


def _build_stage1_user_text(
    user_query: str,
    user_attachments: List[Dict[str, Any]] | None = None,
) -> str:
    """
    Build stage-1 user text.

    When attachments are present, reinforce that attached files are required context.
    """
    base_query = user_query.strip()
    if not isinstance(user_attachments, list) or not user_attachments:
        return base_query

    attachment_summary = _describe_user_attachments(user_attachments)
    instruction = (
        "File context is attached to this message. "
        "Use the attached files as primary context for your answer. "
        "If any attachment cannot be read, state that clearly."
    )
    if attachment_summary:
        instruction = f"{instruction}\n\n{attachment_summary}"

    if base_query:
        return f"{base_query}\n\n{instruction}"
    return instruction


async def stage1_collect_responses(
    user_query: str,
    conversation_history: List[Dict[str, str]] | None = None,
    session_id: str | None = None,
    user_attachments: List[Dict[str, Any]] | None = None,
    plugins: List[Dict[str, Any]] | None = None,
) -> List[Dict[str, Any]]:
    """
    Stage 1: collect individual responses from all council models.

    Args:
        user_query: The user's question.
        conversation_history: Previous turns in this conversation.

    Returns:
        List of dicts with model and response keys.
    """
    messages: List[Dict[str, Any]] = [
        {
            "role": "system",
            "content": (
                "You are participating in an ongoing user conversation. "
                "Use prior turns to preserve context and subject continuity, "
                "unless the user explicitly changes topic."
            ),
        }
    ]
    if isinstance(conversation_history, list):
        for item in conversation_history:
            if not isinstance(item, dict):
                continue
            role = item.get("role")
            content = item.get("content")
            if role in {"user", "assistant"} and isinstance(content, str) and content.strip():
                messages.append({"role": role, "content": content})

    stage1_user_text = _build_stage1_user_text(user_query, user_attachments)

    if isinstance(user_attachments, list) and user_attachments:
        user_content_parts: List[Dict[str, Any]] = [{"type": "text", "text": stage1_user_text}]
        for attachment in user_attachments:
            if isinstance(attachment, dict):
                user_content_parts.append(attachment)
        messages.append({"role": "user", "content": user_content_parts})
    else:
        messages.append({"role": "user", "content": stage1_user_text})

    responses = await query_models_parallel(
        COUNCIL_MODELS,
        messages,
        session_id=session_id,
        metadata={"stage": "stage1"},
        plugins=plugins,
    )

    stage1_results: List[Dict[str, Any]] = []
    for model, response in responses.items():
        if response is not None:
            stage1_results.append(
                {
                    "model": model,
                    "response": response.get("content", ""),
                    "usage": response.get("usage", empty_usage_summary()),
                }
            )

    return stage1_results
