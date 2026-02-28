# Technical Specification: Add user id on OpenRouter

## Difficulty Assessment
- Level: Medium
- Rationale: The change is conceptually simple but cross-cutting. We need to thread a new OpenRouter request field through all model-call paths (title, stage 1, stage 2, stage 3, sync endpoint, streaming endpoint) and add regression tests to avoid silently losing attribution.

## Technical Context
- Language/runtime: Python 3.10+, FastAPI backend, async `httpx` HTTP client.
- Authentication source: Supabase user object from `get_current_user` in `backend/main.py` (contains `id` and `email`).
- OpenRouter integration: centralized in `backend/openrouter.py` (`query_model`, `query_models_parallel`) and used by stage modules and title generation.
- OpenRouter contract reference:
  - User-provided doc: `https://openrouter.ai/docs/api-reference/chat/send-chat-completion-request`
  - OpenAPI schema (`https://openrouter.ai/openapi.json`) defines `ChatGenerationParams.user` as a string (`"Unique user identifier"`).

## Implementation Approach
1. Resolve OpenRouter user identifier from authenticated user email.
- In `backend/main.py`, add a helper that extracts and normalizes `user["email"]` (trim + lowercase).
- If email is missing/empty, fallback to `user["id"]` as a defensive identifier so requests are still attributable.

2. Extend OpenRouter request wrapper to accept user identifier.
- In `backend/openrouter.py`:
  - Add an optional parameter (e.g., `openrouter_user: str | None = None`) to `query_model` and `query_models_parallel`.
  - When present and non-empty, include `payload["user"] = openrouter_user` in the `/chat/completions` request body.
  - Keep existing `metadata`, `session_id`, and `plugins` behavior unchanged.

3. Propagate identifier through stage orchestration.
- Update stage function signatures and pass-through calls:
  - `backend/stages/stage1.py`
  - `backend/stages/stage2.py`
  - `backend/stages/stage3.py`
  - `backend/stages/title.py`
- Optionally keep orchestration parity in `backend/council.py` by accepting and passing the same optional identifier.

4. Wire identifier into all authenticated message flows.
- In `backend/main.py`, compute identifier once per request and pass it into:
  - `generate_conversation_title(...)`
  - `stage1_collect_responses(...)`
  - `stage2_collect_rankings(...)`
  - `stage3_synthesize_final(...)`
- Apply this in both endpoints:
  - `POST /api/conversations/{conversation_id}/message`
  - `POST /api/conversations/{conversation_id}/message/stream`

## Source Code Structure Changes
Files to modify:
- `backend/openrouter.py`
- `backend/main.py`
- `backend/stages/stage1.py`
- `backend/stages/stage2.py`
- `backend/stages/stage3.py`
- `backend/stages/title.py`
- `backend/council.py` (if maintaining wrapper API parity)
- `backend/tests/test_free_plan_quota.py` (or equivalent endpoint-level regression tests)

Files to create:
- `backend/tests/test_openrouter_user_tracking.py`
  - Unit tests for OpenRouter payload construction and user field behavior.

## Data Model / API / Interface Changes
- External HTTP API (frontend/backend contract): No endpoint schema changes.
- OpenRouter outbound payload changes:
  - Adds top-level `user` string field to chat completion requests.
- Internal Python interface changes:
  - New optional `openrouter_user` parameter propagated through model-call helpers and stage functions.
- Persistence/storage changes: None.

## Verification Approach
1. Run targeted backend tests for the new behavior.
- `uv run python -m unittest backend.tests.test_openrouter_user_tracking`
- `uv run python -m unittest backend.tests.test_free_plan_quota`

2. Run full backend test suite as regression check.
- `uv run python -m unittest`

3. Manual verification (API-level).
- Send an authenticated message request and confirm outbound OpenRouter payload includes:
  - `user: <normalized user email>`
  - existing `metadata.stage` and `session_id` values still present.
- Repeat once for streaming endpoint path to ensure parity.
