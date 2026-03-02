# Implementation Report: Fix council models

## What was implemented

- Added plan-aware council model resolution in `backend/config.py`:
  - New env-prefix resolver: `resolve_council_env_prefix(...)` (`DEVELOPMENT` vs `PRODUCTION`).
  - New model list parser with trimming, quote-stripping, de-duplication, and fallback:
    - `_parse_council_models(...)`
  - New plan selector:
    - `resolve_council_models_for_plan(...)`
    - `get_council_models_for_plan(...)`
  - Runtime env vars now supported:
    - `<PREFIX>_FREE_COUNCIL_MODELS`
    - `<PREFIX>_PRO_COUNCIL_MODELS`
    - Example for production: `PRODUCTION_FREE_COUNCIL_MODELS`, `PRODUCTION_PRO_COUNCIL_MODELS`.

- Updated stage functions to accept plan-selected models while preserving backward compatibility:
  - `backend/stages/stage1.py`
    - `stage1_collect_responses(..., council_models: List[str] | None = None)`
  - `backend/stages/stage2.py`
    - `stage2_collect_rankings(..., council_models: List[str] | None = None)`
  - If `council_models` is omitted, existing `COUNCIL_MODELS` behavior is retained.

- Wired plan-specific model selection into both message endpoints in `backend/main.py`:
  - `send_message(...)`
  - `send_message_stream(...)`
  - Both now call `get_council_models_for_plan(plan)` and pass the result to Stage 1 and Stage 2.

- Added/expanded tests:
  - `backend/tests/test_cors_config.py`
    - Added tests for env prefix mapping, council model parsing, and plan-based model resolution helpers.
  - `backend/tests/test_free_plan_quota.py`
    - Added endpoint routing tests to confirm FREE users pass FREE model list and PRO users pass PRO model list.
    - Added stream-path test to confirm FREE model list routing in `/message/stream`.

## How the solution was tested

- Ran targeted backend tests:

```bash
PYTHONDONTWRITEBYTECODE=1 uv run python -m unittest backend.tests.test_cors_config backend.tests.test_free_plan_quota
```

- Result:
  - 28 tests ran
  - All passed

## Biggest issues or challenges encountered

- Ensuring both sync and streaming endpoints apply identical plan-aware model selection required touching two orchestration paths without changing quota semantics.
- Preserving compatibility for existing call sites required optional `council_models` parameters with safe default behavior.
