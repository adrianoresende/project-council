# Implementation Report: Add user id on OpenRouter

## What was implemented
- Added OpenRouter user attribution support to outbound chat completion payloads.
- Extended `backend/openrouter.py`:
  - `query_model(...)` now accepts `openrouter_user: str | None`.
  - Adds `payload["user"]` when a non-empty identifier is provided.
  - `query_models_parallel(...)` now forwards the same parameter to every model call.
- Propagated `openrouter_user` through all stage wrappers:
  - `backend/stages/stage1.py`
  - `backend/stages/stage2.py`
  - `backend/stages/stage3.py`
  - `backend/stages/title.py`
- Updated orchestration facade `backend/council.py` to accept/forward `openrouter_user`.
- Added identifier resolution in `backend/main.py`:
  - New helper `_resolve_openrouter_user_identifier(user)`.
  - Uses normalized email (`strip().lower()`) as primary identifier.
  - Falls back to normalized `user.id` if email is unavailable.
- Wired identifier into both authenticated message flows:
  - `POST /api/conversations/{conversation_id}/message`
  - `POST /api/conversations/{conversation_id}/message/stream`
  - Applied consistently for title generation + stage1/stage2/stage3 calls.

## How the solution was tested
- Added new regression test module:
  - `backend/tests/test_openrouter_user_tracking.py`
- New tests cover:
  - OpenRouter payload includes `user` when provided.
  - OpenRouter payload omits `user` when empty.
  - Parallel wrapper forwards `openrouter_user` to each per-model call.
  - Main helper resolves normalized email and fallback user id.
  - `send_message` propagates the identifier to title/stage1/stage2/stage3.
  - `send_message_stream` propagates the identifier to title/stage1/stage2/stage3.
- Executed commands:
  - `uv run python -m unittest backend.tests.test_openrouter_user_tracking`
  - `uv run python -m unittest backend.tests.test_free_plan_quota`
  - `uv run python -m unittest`

## Biggest issues or challenges encountered
- The main complexity was ensuring parity between synchronous and streaming execution paths so attribution could not be dropped in one path while present in the other.
- Existing free-plan first-message behavior has deferred persistence/title logic, so propagation had to be applied in both early and deferred title-generation branches.
