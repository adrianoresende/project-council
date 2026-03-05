# Implementation Report: Chairman model for each plan

## What was implemented
- Added plan-specific chairman model configuration in `backend/config.py`:
  - `FREE_CHAIRMAN_MODEL`
  - `PRO_CHAIRMAN_MODEL`
  - `get_chairman_model_for_plan(plan, environment=None)`
- Implemented fallback precedence for Stage 3 chairman model selection:
  1. Plan-specific env (`FREE_CHAIRMAN_MODEL` / `PRO_CHAIRMAN_MODEL`)
  2. Legacy global env (`CHAIRMAN_MODEL`)
  3. Environment default (`DEFAULT_CHAIRMAN_MODEL`)
- Updated Stage 3 synthesis API in `backend/stages/stage3.py` to accept optional `chairman_model` and use it for query + result metadata.
- Updated `backend/main.py`:
  - Resolve chairman model from user plan in both:
    - `POST /api/conversations/{id}/message`
    - `POST /api/conversations/{id}/message/stream`
  - Pass `chairman_model` into `stage3_synthesize_final(...)`.
  - Expanded admin system models payload with:
    - `free_chairman_model`
    - `pro_chairman_model`
    - kept `chairman_model` for compatibility.
- Updated environment/docs:
  - `.env.example` now includes `FREE_CHAIRMAN_MODEL` and `PRO_CHAIRMAN_MODEL` plus fallback `CHAIRMAN_MODEL`.
  - `README.md` model config section now documents per-plan chairman selection and precedence.
- Added/updated tests:
  - `backend/tests/test_model_config.py`
  - `backend/tests/test_admin_foundation.py`
  - `backend/tests/test_free_plan_quota.py`

## How the solution was tested
- Ran targeted backend tests:

```bash
uv run python -m unittest backend.tests.test_model_config backend.tests.test_admin_foundation backend.tests.test_free_plan_quota backend.tests.test_openrouter_user_tracking
```

- Result: all tests passed (`Ran 54 tests`, `OK`).

## Biggest issues or challenges encountered
- The main design decision was preserving backward compatibility for `CHAIRMAN_MODEL` while introducing plan-specific chairman settings.
- This was handled by explicit fallback precedence and by keeping `chairman_model` in the admin response while adding per-plan fields.
