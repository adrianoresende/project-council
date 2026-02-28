# Technical Specification: Add Model Lists for FREE and PRO Plans

## Difficulty Assessment

**Complexity: medium**

Reasoning:
- The change is not only configuration; model selection currently uses one global list (`COUNCIL_MODELS`) in runtime paths that serve both FREE and PRO users.
- We need plan-aware model routing in both non-streaming and streaming endpoints without changing existing API contracts.
- Backward compatibility is required so current deployments keep working when new env vars are not yet set.

## Technical Context

- Backend stack: Python 3.10+, FastAPI, unittest, async OpenRouter calls.
- Model execution path:
  - `backend/main.py` orchestrates user plan checks and calls Stage 1/2/3.
  - `backend/stages/stage1.py` and `backend/stages/stage2.py` currently import and use global `COUNCIL_MODELS`.
  - `backend/config.py` currently chooses a single model list based on environment (`development` vs `production`).
- Existing plan model metadata is already available from auth (`_get_user_plan`), so no database/schema changes are needed.

## Implementation Approach

### 1) Add plan-aware production model configuration in `backend/config.py`

Introduce two production model list settings backed by `.env`:
- `PRODUCTION_FREE_COUNCIL_MODELS`
- `PRODUCTION_PRO_COUNCIL_MODELS`

Add helper(s) to parse comma-separated model identifiers with normalization (trim spaces/quotes, ignore empty entries, de-duplicate while preserving order).

Behavior:
- Development (`development` / `dev` / `local`): keep current `DEVELOPMENT_COUNCIL_MODELS` behavior for all plans.
- Production:
  - FREE users use `PRODUCTION_FREE_COUNCIL_MODELS`.
  - PRO users use `PRODUCTION_PRO_COUNCIL_MODELS`.
- Backward compatibility fallback:
  - If a new env var is empty/missing, use safe defaults (preserving current behavior by default, i.e. existing production model set).

Expose a resolver function for runtime use, e.g.:
- `get_council_models_for_plan(plan: str, environment: str | None = None) -> list[str]`

### 2) Make stage execution accept explicit model lists

Update stage interfaces to accept resolved model lists instead of always using the global constant:
- `stage1_collect_responses(..., council_models: List[str] | None = None, ...)`
- `stage2_collect_rankings(..., council_models: List[str] | None = None, ...)`

Behavior:
- If `council_models` is provided, use it.
- If not provided, preserve old behavior using the current global default list (for compatibility and non-HTTP callers).

### 3) Wire plan-aware selection in request orchestration

In `backend/main.py`, for both endpoints:
- `send_message`
- `send_message_stream`

Resolve plan once (`free`/`pro`) and resolve model list via config helper, then pass the same `council_models` into both Stage 1 and Stage 2 calls.

This keeps Stage 1 and Stage 2 using the same cohort in a request and avoids changing response schemas.

### 4) Documentation updates

Update `README.md` model configuration section to document:
- New env vars for production FREE/PRO lists.
- Example `.env` values with comma-separated models.
- Fallback behavior when vars are omitted.

## Source Code Structure Changes

Planned modified files:
- `backend/config.py`
  - Add parser and plan-aware model resolver.
  - Add new config constants for FREE/PRO production lists.
- `backend/stages/stage1.py`
  - Accept optional `council_models` parameter.
- `backend/stages/stage2.py`
  - Accept optional `council_models` parameter.
- `backend/main.py`
  - Resolve per-user-plan model list and pass to stage calls in both message endpoints.
- `backend/tests/test_cors_config.py` or new `backend/tests/test_model_config.py`
  - Add tests for model list env parsing and plan-aware resolution.
- `backend/tests/test_free_plan_quota.py` (or new focused endpoint test file)
  - Add assertions that FREE/PRO requests route to different model lists in production paths.
- `README.md`
  - Document env-driven FREE/PRO model lists.

## Data Model / API / Interface Changes

- Database schema: **no changes**.
- Public HTTP API contracts: **no response/request shape changes**.
- Internal function signatures:
  - `stage1_collect_responses` and `stage2_collect_rankings` gain optional `council_models` parameter.
  - Any internal callers should remain compatible due to optional defaults.

## Verification Approach

### Automated tests

Run targeted backend tests:
- `uv run python -m unittest backend.tests.test_cors_config`
- `uv run python -m unittest backend.tests.test_free_plan_quota`
- `uv run python -m unittest backend.tests.test_admin_foundation`
- plus new/updated model-routing tests (file chosen during implementation).

### Manual checks

1. Set `COUNCIL_ENV=production` with distinct FREE/PRO env model lists.
2. Use one FREE and one PRO account.
3. Send one message from each account and verify Stage 1/2 model identities reflect the configured plan list.
4. Confirm development mode (`COUNCIL_ENV=development`) still uses development model list regardless of plan.

## Risks and Mitigations

- Risk: Misconfigured env list (empty or malformed) causing no models to run.
  - Mitigation: normalize and fallback to defaults when parsing yields an empty list.
- Risk: Stage 1 and Stage 2 accidentally use different model cohorts in a request.
  - Mitigation: resolve model list once per request in `main.py` and pass same list to both calls.
- Risk: Regression in existing flows/tests due to signature changes.
  - Mitigation: keep new params optional with backward-compatible defaults and cover with unit tests.
