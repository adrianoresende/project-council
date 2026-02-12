"""FastAPI backend for LLM Council."""

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from typing import List, Dict, Any
import uuid
import json
import asyncio

from . import storage
from .auth import get_user_from_token, login_user, register_user
from .council import (
    run_full_council,
    generate_conversation_title,
    stage1_collect_responses,
    stage2_collect_rankings,
    stage3_synthesize_final,
    calculate_aggregate_rankings,
    summarize_council_usage,
    empty_usage_summary,
)

app = FastAPI(title="LLM Council API")
bearer_scheme = HTTPBearer()

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CreateConversationRequest(BaseModel):
    """Request to create a new conversation."""
    pass


class SendMessageRequest(BaseModel):
    """Request to send a message in a conversation."""
    content: str


class ConversationMetadata(BaseModel):
    """Conversation metadata for list view."""
    id: str
    created_at: str
    title: str
    archived: bool = False
    message_count: int
    usage: Dict[str, Any] = Field(default_factory=dict)


class Conversation(BaseModel):
    """Full conversation with all messages."""
    id: str
    created_at: str
    title: str
    archived: bool = False
    messages: List[Dict[str, Any]]
    usage: Dict[str, Any] = Field(default_factory=dict)


class AuthRequest(BaseModel):
    """Email/password auth request payload."""
    email: str
    password: str


class AuthResponse(BaseModel):
    """Auth response for login/register."""
    access_token: str | None
    user: Dict[str, Any]
    requires_email_confirmation: bool = False


class AddCreditsRequest(BaseModel):
    """Request payload for adding credits."""
    amount: int = Field(gt=0, le=100000)


class CreditsResponse(BaseModel):
    """Current credit balance for the authenticated account."""
    credits: int


class ArchiveConversationRequest(BaseModel):
    """Request payload for updating archived state."""
    archived: bool = True


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "service": "LLM Council API"}


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
):
    """Validate bearer token with Supabase and return user profile."""
    return await get_user_from_token(credentials.credentials)


async def get_owned_conversation(conversation_id: str, user_id: str):
    """Return conversation only when it belongs to the current user."""
    conversation = await storage.get_conversation(conversation_id, user_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


@app.post("/api/auth/register", response_model=AuthResponse)
async def register(request: AuthRequest):
    """Register a new user in Supabase."""
    result = await register_user(request.email, request.password)
    session = result.get("session")
    return {
        "access_token": session.get("access_token") if session else None,
        "user": result.get("user") or {},
        "requires_email_confirmation": session is None,
    }


@app.post("/api/auth/login", response_model=AuthResponse)
async def login(request: AuthRequest):
    """Sign in an existing Supabase user."""
    result = await login_user(request.email, request.password)
    return {
        "access_token": result.get("access_token"),
        "user": result.get("user") or {},
        "requires_email_confirmation": False,
    }


@app.get("/api/auth/me")
async def me(user: Dict[str, Any] = Depends(get_current_user)):
    """Return the authenticated user profile."""
    return {"user": user}


@app.get("/api/account/credits", response_model=CreditsResponse)
async def get_credits(user: Dict[str, Any] = Depends(get_current_user)):
    """Get current account credits for the logged in user."""
    credits = await storage.get_account_credits(user["id"])
    return {"credits": credits}


@app.post("/api/account/credits/add", response_model=CreditsResponse)
async def add_credits(
    request: AddCreditsRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Add credits to the logged in user account."""
    try:
        credits = await storage.add_account_credits(user["id"], request.amount)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return {"credits": credits}


@app.get("/api/conversations", response_model=List[ConversationMetadata])
async def list_conversations(
    archived: bool = Query(default=False),
    user: Dict[str, Any] = Depends(get_current_user),
):
    """List all conversations (metadata only)."""
    return await storage.list_conversations(user["id"], archived=archived)


@app.post("/api/conversations", response_model=Conversation)
async def create_conversation(
    request: CreateConversationRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Create a new conversation."""
    conversation_id = str(uuid.uuid4())
    conversation = await storage.create_conversation(conversation_id, user["id"])
    return conversation


@app.get("/api/conversations/{conversation_id}", response_model=Conversation)
async def get_conversation(
    conversation_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Get a specific conversation with all its messages."""
    conversation = await get_owned_conversation(conversation_id, user["id"])
    return conversation


@app.patch("/api/conversations/{conversation_id}/archive")
async def archive_conversation(
    conversation_id: str,
    request: ArchiveConversationRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Archive/unarchive a conversation owned by the authenticated user."""
    try:
        await storage.update_conversation_archived(
            conversation_id,
            user["id"],
            request.archived,
        )
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    return {"id": conversation_id, "archived": request.archived}


@app.post("/api/conversations/{conversation_id}/message")
async def send_message(
    conversation_id: str,
    request: SendMessageRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Send a message and run the 3-stage council process.
    Returns the complete response with all stages.
    """
    # Check if conversation exists
    conversation = await get_owned_conversation(conversation_id, user["id"])

    # Check if this is the first message
    is_first_message = len(conversation["messages"]) == 0

    # Consume one credit for each user question
    try:
        await storage.consume_account_credit(user["id"])
    except ValueError as error:
        raise HTTPException(status_code=402, detail=str(error)) from error

    # Add user message
    await storage.add_user_message(conversation_id, user["id"], request.content)

    # If this is the first message, generate a title
    title_usage = empty_usage_summary()
    if is_first_message:
        title_result = await generate_conversation_title(request.content)
        title = title_result.get("title", "New Conversation")
        title_usage = title_result.get("usage", empty_usage_summary())
        await storage.update_conversation_title(conversation_id, user["id"], title)

    # Run the 3-stage council process
    stage1_results, stage2_results, stage3_result, metadata = await run_full_council(
        request.content
    )
    if is_first_message:
        metadata["title_usage"] = title_usage
        metadata_usage = metadata.get("usage", empty_usage_summary())
        metadata["usage"] = {
            "input_tokens": int(metadata_usage.get("input_tokens", 0)) + int(title_usage.get("input_tokens", 0)),
            "output_tokens": int(metadata_usage.get("output_tokens", 0)) + int(title_usage.get("output_tokens", 0)),
            "total_tokens": int(metadata_usage.get("total_tokens", 0)) + int(title_usage.get("total_tokens", 0)),
            "total_cost": round(
                float(metadata_usage.get("total_cost", 0.0)) + float(title_usage.get("cost", 0.0) or 0.0),
                8,
            ),
            "model_calls": int(metadata_usage.get("model_calls", 0)) + 1,
        }
        stage3_result["title_usage"] = title_usage

    # Add assistant message with all stages
    await storage.add_assistant_message(
        conversation_id,
        user["id"],
        stage1_results,
        stage2_results,
        stage3_result
    )
    updated_conversation = await storage.get_conversation(conversation_id, user["id"])

    # Return the complete response with metadata
    return {
        "stage1": stage1_results,
        "stage2": stage2_results,
        "stage3": stage3_result,
        "metadata": metadata,
        "conversation_usage": (updated_conversation or {}).get("usage", empty_usage_summary()),
    }


@app.post("/api/conversations/{conversation_id}/message/stream")
async def send_message_stream(
    conversation_id: str,
    request: SendMessageRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Send a message and stream the 3-stage council process.
    Returns Server-Sent Events as each stage completes.
    """
    # Check if conversation exists
    conversation = await get_owned_conversation(conversation_id, user["id"])

    # Check if this is the first message
    is_first_message = len(conversation["messages"]) == 0

    # Consume one credit for each user question
    try:
        await storage.consume_account_credit(user["id"])
    except ValueError as error:
        raise HTTPException(status_code=402, detail=str(error)) from error

    async def event_generator():
        try:
            # Add user message
            await storage.add_user_message(conversation_id, user["id"], request.content)

            # Start title generation in parallel (don't await yet)
            title_task = None
            if is_first_message:
                title_task = asyncio.create_task(generate_conversation_title(request.content))

            # Stage 1: Collect responses
            yield f"data: {json.dumps({'type': 'stage1_start'})}\n\n"
            stage1_results = await stage1_collect_responses(request.content)
            yield f"data: {json.dumps({'type': 'stage1_complete', 'data': stage1_results})}\n\n"

            # Stage 2: Collect rankings
            yield f"data: {json.dumps({'type': 'stage2_start'})}\n\n"
            stage2_results, label_to_model = await stage2_collect_rankings(request.content, stage1_results)
            aggregate_rankings = calculate_aggregate_rankings(stage2_results, label_to_model)
            yield f"data: {json.dumps({'type': 'stage2_complete', 'data': stage2_results, 'metadata': {'label_to_model': label_to_model, 'aggregate_rankings': aggregate_rankings}})}\n\n"

            # Stage 3: Synthesize final answer
            yield f"data: {json.dumps({'type': 'stage3_start'})}\n\n"
            stage3_result = await stage3_synthesize_final(request.content, stage1_results, stage2_results)
            yield f"data: {json.dumps({'type': 'stage3_complete', 'data': stage3_result})}\n\n"

            metadata = {
                "label_to_model": label_to_model,
                "aggregate_rankings": aggregate_rankings,
                "usage": summarize_council_usage(stage1_results, stage2_results, stage3_result),
            }

            # Wait for title generation if it was started
            if title_task:
                title_result = await title_task
                title = title_result.get("title", "New Conversation")
                title_usage = title_result.get("usage", empty_usage_summary())
                await storage.update_conversation_title(conversation_id, user["id"], title)
                yield f"data: {json.dumps({'type': 'title_complete', 'data': {'title': title}})}\n\n"
                metadata["title_usage"] = title_usage
                metadata_usage = metadata.get("usage", empty_usage_summary())
                metadata["usage"] = {
                    "input_tokens": int(metadata_usage.get("input_tokens", 0)) + int(title_usage.get("input_tokens", 0)),
                    "output_tokens": int(metadata_usage.get("output_tokens", 0)) + int(title_usage.get("output_tokens", 0)),
                    "total_tokens": int(metadata_usage.get("total_tokens", 0)) + int(title_usage.get("total_tokens", 0)),
                    "total_cost": round(
                        float(metadata_usage.get("total_cost", 0.0)) + float(title_usage.get("cost", 0.0) or 0.0),
                        8,
                    ),
                    "model_calls": int(metadata_usage.get("model_calls", 0)) + 1,
                }
                stage3_result["title_usage"] = title_usage

            # Save complete assistant message
            await storage.add_assistant_message(
                conversation_id,
                user["id"],
                stage1_results,
                stage2_results,
                stage3_result
            )
            updated_conversation = await storage.get_conversation(conversation_id, user["id"])

            # Send completion event
            yield f"data: {json.dumps({'type': 'complete', 'metadata': metadata, 'conversation_usage': (updated_conversation or {}).get('usage', empty_usage_summary())})}\n\n"

        except Exception as e:
            # Send error event
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
