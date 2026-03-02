# Investigation: PRO model list not honoring env config

## Bug summary
A PRO-plan request used the model set:
- `openai/gpt-5-nano`
- `google/gemini-2.5-flash-lite`
- `anthropic/claude-3-haiku`

But `PRODUCTION_PRO_COUNCIL_MODELS` was configured as:
- `openai/gpt-5-nano`
- `google/gemini-2.5-flash-lite`

Expected behavior: PRO routing should use the configured env model list and not add `claude-3-haiku`.

## Root cause analysis
1. `backend/config.py` contains two definitions of `get_council_models_for_plan`.
2. The second definition (later in the file) overrides the first one at import time.
3. The active resolver uses `PRO_COUNCIL_MODELS`, which is derived from `COUNCIL_ENV_PREFIX` (`DEVELOPMENT` or `PRODUCTION`), not directly from `PRODUCTION_PRO_COUNCIL_MODELS`.
4. With `COUNCIL_ENV="development"` (current `.env`), `COUNCIL_ENV_PREFIX` becomes `DEVELOPMENT` and `PRO_COUNCIL_MODELS` falls back to `COUNCIL_MODELS` (the hardcoded development trio including `anthropic/claude-3-haiku`) when `DEVELOPMENT_PRO_COUNCIL_MODELS` is not set.
5. Result: the configured `PRODUCTION_PRO_COUNCIL_MODELS` is parsed but not used in runtime plan routing in this scenario.

Evidence collected:
- Current runtime signature is `get_council_models_for_plan(plan: str | None)`, confirming the later override is active.
- Runtime probe with `COUNCIL_ENV=development` returned `['openai/gpt-5-nano', 'google/gemini-2.5-flash-lite', 'anthropic/claude-3-haiku']` for PRO plan.

## Affected components
- `backend/config.py`
  - duplicated `get_council_models_for_plan` definitions
  - environment-prefix/fallback model resolution (`COUNCIL_ENV_PREFIX`, `PRO_COUNCIL_MODELS`)
- `backend/main.py`
  - `send_message()` and `send_message_stream()` call `get_council_models_for_plan(plan)` and inherit incorrect model selection
- Admin visibility endpoint
  - `/api/admin/system/models` also depends on the same resolver

## Proposed solution
1. Remove/replace the duplicated resolver path so there is exactly one canonical `get_council_models_for_plan` implementation.
2. Ensure plan routing uses env-backed per-plan lists consistently, with explicit precedence that honors configured env model lists.
3. Align behavior with the bug requirement: PRO plan should use configured PRO env model list and not silently append fallback development models.
4. Add/adjust regression tests in `backend/tests/test_model_config.py` to lock expected behavior, including the scenario where `PRODUCTION_PRO_COUNCIL_MODELS` is set and must be returned exactly for PRO routing.

## Edge cases and side effects considered
- Quoted/comma-separated env values and duplicates (already handled by existing parsing helpers).
- Empty env values should still have deterministic fallback behavior.
- Any change to model resolver affects both normal and streaming message endpoints; both should be covered in tests.

## Implementation notes
Implemented in `backend/config.py`:

1. Removed duplicate configuration blocks and duplicate `get_council_models_for_plan` definition so there is one canonical resolver.
2. Added explicit env parsing constants:
   - `RAW_PRODUCTION_FREE_COUNCIL_MODELS`
   - `RAW_PRODUCTION_PRO_COUNCIL_MODELS`
   - `EXPLICIT_PRODUCTION_FREE_COUNCIL_MODELS`
   - `EXPLICIT_PRODUCTION_PRO_COUNCIL_MODELS`
3. Added `_resolve_explicit_production_models_for_plan(plan)` and updated `get_council_models_for_plan(plan, environment=None)` to:
   - Honor explicit `PRODUCTION_*_COUNCIL_MODELS` values first.
   - Fall back to development defaults when no explicit plan env list exists and environment is development.
   - Fall back to resolved production lists otherwise.
4. Updated `resolve_council_models_for_plan` to normalize quoted plan strings before comparison.

Regression coverage in `backend/tests/test_model_config.py`:

- Hardened development fallback test by patching env explicitly to empty `PRODUCTION_*` vars.
- Added `test_get_council_models_for_plan_honors_explicit_production_pro_models_in_dev` to lock the bug scenario:
  - `COUNCIL_ENV=development`
  - `PRODUCTION_PRO_COUNCIL_MODELS=openai/gpt-5-nano,google/gemini-2.5-flash-lite`
  - Expected PRO plan models exactly match env list (no `claude-3-haiku`).

## Test results
- `uv run python -m unittest backend.tests.test_model_config backend.tests.test_cors_config`
  - Result: `Ran 23 tests ... OK`

Runtime verification:
- `uv run python - <<'PY' ...` with current `.env` (`COUNCIL_ENV=development`) now returns:
  - `get_council_models_for_plan("pro") == ['openai/gpt-5-nano', 'google/gemini-2.5-flash-lite']`
