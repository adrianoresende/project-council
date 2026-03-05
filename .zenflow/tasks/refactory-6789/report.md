# Backend Refactory Report

## Implemented changes

### 1) Removed runtime-unused credit RPC helpers
- Deleted unused Supabase credit-RPC parsing and wrappers from `backend/services/supabase/storage.py`:
  - `_parse_credit_result`
  - `get_account_credits`
  - `add_account_credits`
  - `consume_account_credit`
- Kept the active daily-quota/token-based credit flow intact (`get_account_daily_credits`, `reset_account_daily_credits`, `consume_account_tokens`).

### 2) Removed dead request models/params in API layer
- Removed unused request models from `backend/main.py`:
  - `CreateConversationRequest`
  - `AddCreditsRequest`
- Removed now-unused endpoint parameters:
  - `request` from `POST /api/account/credits/add`
  - `request` from `POST /api/conversations`
- Endpoint behavior and contracts remain unchanged for runtime behavior (credits add is still explicitly disabled with `400`).

### 3) Deprecated compatibility-only runtime-unused helpers
- Marked `backend/council.py:run_full_council` as deprecated via `DeprecationWarning` while preserving callable compatibility.
- Marked `backend/config.py` compatibility helpers as deprecated:
  - `resolve_council_env_prefix`
  - `_parse_council_models`
- Reduced parsing duplication by routing `_parse_council_models` through canonical `_parse_council_model_list`.

## Test / verification evidence
- Executed full backend regression suite:
  - `uv run python -m unittest discover -s backend/tests -v`
- Result:
  - `Ran 76 tests in 0.180s`
  - `OK`
- Notes:
  - Expected `DeprecationWarning` output appears for tests intentionally exercising deprecated config compatibility helpers.

## Key issues / trade-offs
- Chose **deprecation** (not hard removal) for compatibility-facing helpers (`run_full_council`, legacy config parse/env-prefix helpers) to avoid breaking external imports abruptly.
- Chose **hard removal** for disabled credit-RPC helpers because they were runtime-unused and tied to intentionally disabled top-up behavior.
- Kept compatibility module aliases (`backend/auth.py`, `backend/storage.py`, `backend/openrouter.py`) unchanged in this step to avoid widening scope beyond the runtime-unused cleanup objective.
