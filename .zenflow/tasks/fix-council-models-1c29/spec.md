# Technical Specification: Plan-Aware Council Models

## Difficulty

**Medium**: the change is localized but touches runtime model selection across config, stage orchestration, and both sync/stream message flows. It also needs regression-safe defaults and test coverage.

## Technical context (language, dependencies)

- Backend stack: Python 3.10+, FastAPI, Pydantic, asyncio, httpx.
- Current council model resolution is static at process startup:
  - `backend/config.py` computes a single `COUNCIL_MODELS` list from `COUNCIL_ENV`.
  - `backend/stages/stage1.py` and `backend/stages/stage2.py` import and use that global list.
- User plan is resolved per request in `backend/main.py` via `_get_user_plan(user)` (`free` or `pro`).
- Stage execution entry points are:
  - `POST /api/conversations/{conversation_id}/message`
  - `POST /api/conversations/{conversation_id}/message/stream`

## Implementation approach

1. Add plan-specific, environment-aware model list resolution in `backend/config.py`.
   - Support env vars:
     - `<ENV>_FREE_COUNCIL_MODELS`
     - `<ENV>_PRO_COUNCIL_MODELS`
   - `ENV` is derived from resolved `COUNCIL_ENV`:
     - development-like (`development`, `dev`, `local`) -> `DEVELOPMENT_...`
     - otherwise -> `PRODUCTION_...`
   - Parse comma-separated model lists with whitespace/quote normalization and deduplication.
   - Preserve sane defaults when vars are absent/empty to avoid startup/runtime breaks.
2. Expose a config helper to resolve models per plan at runtime.
   - Proposed interface: `get_council_models_for_plan(plan: str) -> list[str]`.
   - `free` returns free list; `pro` returns pro list.
   - Unknown plans normalize to free behavior, matching existing plan normalization patterns.
3. Thread selected models through stage calls.
   - Update `stage1_collect_responses(...)` and `stage2_collect_rankings(...)` to accept optional `council_models`.
   - Default to current global behavior when omitted for backward compatibility with existing call sites.
4. Use per-user selected models in both message endpoints.
   - In `send_message` and `send_message_stream`, compute:
     - `plan = _get_user_plan(user)`
     - `council_models = get_council_models_for_plan(plan)`
   - Pass `council_models` to stage1 and stage2.
5. Keep chairman behavior unchanged.
   - `stage3_synthesize_final` continues using `CHAIRMAN_MODEL`; this task only changes council membership per plan.

## Source code structure changes

### Files to modify

- `backend/config.py`
  - Add model-list parsing and plan-aware resolver helpers.
  - Add env-specific free/pro defaults and derived constants.
- `backend/stages/stage1.py`
  - Add optional `council_models` parameter and use it when querying parallel models.
- `backend/stages/stage2.py`
  - Add optional `council_models` parameter and use it when querying parallel models.
- `backend/main.py`
  - Import and call new resolver.
  - Pass resolved model list into stage1/stage2 in both sync and stream endpoints.
- `backend/tests/test_cors_config.py`
  - Extend (or split) config tests to cover plan-aware model env parsing/resolution.
- `backend/tests/test_free_plan_quota.py`
  - Add endpoint tests asserting free/pro users route through the correct model lists.
- `README.md` (optional but recommended)
  - Document the new env vars and examples:
    - `PRODUCTION_FREE_COUNCIL_MODELS="openai/gpt-oss-120b,google/gemini-2.0-flash"`
    - `PRODUCTION_PRO_COUNCIL_MODELS="openai/gpt-5-nano,google/gemini-2.5-flash-lite"`

## Data model / API / interface changes

- Database schema: **no changes**.
- External HTTP API contracts: **no changes**.
- Internal interfaces:
  - `stage1_collect_responses(..., council_models: List[str] | None = None, ...)`
  - `stage2_collect_rankings(..., council_models: List[str] | None = None, ...)`
- Configuration surface:
  - New env vars for per-plan council lists (environment-prefixed).
  - Existing `COUNCIL_ENV` remains the environment selector.

## Verification approach

1. Config-level tests
   - Verify parsing of comma-separated free/pro model env vars (trim, quote stripping, dedupe).
   - Verify env-prefix selection from `COUNCIL_ENV`.
   - Verify fallback defaults when vars are missing.
2. Endpoint behavior tests
   - For a free user, assert stage1/stage2 are called with resolved free model list.
   - For a pro user, assert stage1/stage2 are called with resolved pro model list.
   - Cover both non-stream and stream entry points where practical.
3. Regression checks
   - Run targeted tests:
     - `python -m unittest backend.tests.test_cors_config`
     - `python -m unittest backend.tests.test_free_plan_quota`
   - Optional broader pass:
     - `python -m unittest discover -s backend/tests`

## Notes and constraints

- Model resolution must be request-safe; avoid mutating global shared lists based on user plan.
- Keep behavior deterministic if env vars are malformed/empty by falling back to defaults.
- Ensure plan handling remains consistent with existing `_normalize_plan` / `_get_user_plan` conventions.
