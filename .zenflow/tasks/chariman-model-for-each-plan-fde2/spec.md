# Technical Specification: Chairman Model Per Plan

## Difficulty Assessment
- **Difficulty**: medium
- **Why**: the core change is small (plan-specific Stage 3 model resolution), but it touches shared configuration, Stage 3 orchestration in both sync and streaming paths, admin system model contracts, and regression tests.

## Technical Context
- **Backend stack**: Python 3.10+, FastAPI, async stage orchestration.
- **Current model config behavior**:
  - Stage 1/2 already select model lists by plan via `get_council_models_for_plan(...)` in `backend/config.py`.
  - Stage 3 always uses a single global `CHAIRMAN_MODEL` imported in `backend/stages/stage3.py`.
- **Current admin contract**:
  - `GET /api/admin/system/models` returns `free_models`, `pro_models`, and a single `chairman_model`.

## Implementation Approach
1. Add plan-specific chairman env configuration in `backend/config.py`.
2. Route Stage 3 chairman model by resolved user plan in both `send_message` and `send_message_stream`.
3. Keep backward compatibility with existing `CHAIRMAN_MODEL` env var as fallback.
4. Update admin “system models” payload to expose plan-specific chairman values (and preserve legacy field for compatibility).
5. Add focused backend tests for env parsing/resolution and API contract updates.
6. Update `.env.example` and README model configuration docs.

## Source Code Structure Changes
- `backend/config.py`
  - Add env-backed constants:
    - `FREE_CHAIRMAN_MODEL`
    - `PRO_CHAIRMAN_MODEL`
  - Add helper:
    - `get_chairman_model_for_plan(plan: str | None, environment: str | None = None) -> str`
  - Resolution precedence:
    1. Plan-specific var (`FREE_CHAIRMAN_MODEL` or `PRO_CHAIRMAN_MODEL`)
    2. Legacy `CHAIRMAN_MODEL` (global override, for compatibility)
    3. Existing environment default chairman fallback
- `backend/stages/stage3.py`
  - Update `stage3_synthesize_final(...)` to accept optional `chairman_model`.
  - Use resolved chairman model for `query_model(...)` and response metadata.
- `backend/main.py`
  - Import and use `get_chairman_model_for_plan(...)`.
  - Resolve `chairman_model` from user plan before Stage 3 in:
    - `send_message`
    - `send_message_stream`
  - Pass resolved model into `stage3_synthesize_final(...)`.
  - Expand admin system response to include:
    - `free_chairman_model`
    - `pro_chairman_model`
    - keep `chairman_model` as compatibility alias.
- `backend/tests/test_model_config.py`
  - Add tests for chairman selection precedence and plan routing.
- `backend/tests/test_admin_foundation.py`
  - Update/extend admin system models response tests for plan-specific chairman fields.
- `backend/tests/test_free_plan_quota.py` (or equivalent endpoint-routing tests)
  - Add assertions that free/pro requests pass expected chairman model to Stage 3.
- `.env.example`
  - Add `FREE_CHAIRMAN_MODEL` and `PRO_CHAIRMAN_MODEL` examples.
  - Keep `CHAIRMAN_MODEL` documented as fallback compatibility.
- `README.md`
  - Document new env vars and precedence behavior.

## Data Model / API / Interface Changes
- **New environment variables**:
  - `FREE_CHAIRMAN_MODEL`
  - `PRO_CHAIRMAN_MODEL`
- **Backward compatibility**:
  - Existing `CHAIRMAN_MODEL` remains supported as fallback.
- **Admin API contract (additive)**:
  - `GET /api/admin/system/models` adds `free_chairman_model` and `pro_chairman_model`.
  - Existing `chairman_model` retained to avoid breaking existing consumers.
- **Internal Python interface**:
  - `stage3_synthesize_final(...)` gains optional `chairman_model` argument.

## Verification Approach
- Backend targeted unit tests:
  - `uv run python -m unittest backend.tests.test_model_config`
  - `uv run python -m unittest backend.tests.test_admin_foundation`
  - `uv run python -m unittest backend.tests.test_free_plan_quota`
- Optional additional regression coverage:
  - `uv run python -m unittest backend.tests.test_openrouter_user_tracking`
- If frontend admin contract is updated in implementation:
  - `cd frontend && npm test -- src/pages/admin/page.test.jsx`

## Notes
- No database schema changes are required.
- No storage payload changes are required for conversations/messages.
- This task does not require replacing the Implementation step with smaller root tasks; the change scope is medium and can be implemented coherently in one implementation step.
