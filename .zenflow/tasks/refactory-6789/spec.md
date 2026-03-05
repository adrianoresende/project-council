# Technical Specification: Backend Refactory

## Complexity Assessment
- **Difficulty:** hard
- **Why:** The backend currently concentrates API routing, billing, orchestration, quota logic, and external integrations in large modules (especially `backend/main.py`). Refactoring requires careful extraction to preserve API contracts, billing behavior, and test coverage while changing internal module boundaries.

## Technical Context
- **Language:** Python 3.10+
- **Frameworks/Libraries:** FastAPI, Pydantic v2, httpx, python-dotenv, python-multipart
- **Architecture today:**
  - API and business logic mixed in `backend/main.py`
  - OpenRouter integration in `backend/openrouter.py`
  - Supabase auth in `backend/auth.py`
  - Supabase PostgREST data access in `backend/storage.py`
  - Council stage orchestration in `backend/stages/*` and `backend/council.py`

## Current Findings (Backend-Only)

### 1) Runtime-unused or low-value code candidates
- `backend/council.py:run_full_council` is not referenced by API handlers.
- `backend/storage.py:get_account_credits`, `add_account_credits`, `consume_account_credit` are not used by runtime endpoints.
  - Related helper `_parse_credit_result` becomes removable if those functions are removed.
- `backend/config.py:resolve_council_env_prefix` and `_parse_council_models` are runtime-unused (currently test-facing utilities).
- `backend/main.py`:
  - `create_conversation(request: CreateConversationRequest, ...)` does not use `request`.
  - `/api/account/credits/add` is intentionally disabled (always raises `400`) while related request model and storage RPC helpers still exist.

### 2) Duplication and cohesion issues
- Duplicate conversion helpers (`_to_int`, `_to_float`) across multiple modules.
- Duplicate/session normalization patterns (`_normalize_session_id`) across `main.py` and `storage.py`.
- Integration concerns mixed into API module (`main.py`) for Stripe request/signature logic and plan-linking workflow.
- Supabase integration split across `auth.py` and `storage.py` with repeated config/header/http patterns.

### 3) Service boundary gaps against requested structure
- No `backend/services/` package yet.
- OpenRouter, Stripe, and Supabase logic are not grouped into dedicated service domains.
- Utility/helper logic is scattered; no centralized `utils.py`.

## Implementation Approach

### Goal
Refactor backend internals for maintainability while keeping existing external API behavior stable.

### Approach Summary
1. Introduce `backend/services/` and move integration/business logic into domain services:
   - `services/supabase`
   - `services/stripe`
   - `services/openrouter`
2. Create `backend/utils.py` for reusable formatting/normalization helpers currently duplicated across modules.
3. Keep `backend/main.py` focused on FastAPI endpoints + request/response mapping.
4. Remove or isolate runtime-unused code paths after migration (or mark deprecated if API compatibility is required).
5. Preserve existing endpoint contracts unless explicitly approved otherwise.

## Source Code Structure Changes

### New files/directories (planned)
- `backend/services/__init__.py`
- `backend/services/openrouter/__init__.py`
- `backend/services/openrouter/client.py`
- `backend/services/supabase/__init__.py`
- `backend/services/supabase/auth.py`
- `backend/services/supabase/storage.py`
- `backend/services/supabase/rest.py`
- `backend/services/stripe/__init__.py`
- `backend/services/stripe/client.py`
- `backend/services/stripe/billing.py`
- `backend/utils.py`

### Existing files to modify (planned)
- `backend/main.py`
  - Replace direct integration logic with service calls.
  - Keep endpoint behavior/response shape stable.
- `backend/stages/stage1.py`, `backend/stages/stage2.py`, `backend/stages/stage3.py`, `backend/stages/title.py`
  - Update imports to `services/openrouter/client.py`.
- `backend/auth.py`, `backend/storage.py`, `backend/openrouter.py`
  - Convert to compatibility wrappers or remove after imports are fully migrated.
- `backend/council.py`
  - Remove or repurpose `run_full_council` if still unused after migration.
- `backend/tests/*`
  - Update import paths and add coverage for new service modules.

## Proposed Service Responsibilities

### `services/openrouter`
- OpenRouter API client calls (`query_model`, `query_models_parallel`).
- Usage payload normalization for model responses.

### `services/supabase`
- Auth flows (`register_user`, `login_user`, `get_user_from_token`, admin user metadata operations).
- Data persistence and retrieval (conversations, messages, credits, billing payments, feedback).
- Shared Supabase REST client/config validation in one place.

### `services/stripe`
- Stripe API request wrapper.
- Stripe webhook signature verification.
- Checkout-session-to-plan reconciliation workflow.

### `utils.py`
- Reusable conversions and normalization helpers:
  - int/float coercion
  - session id normalization
  - plan normalization
  - timestamp conversion helpers
  - shared usage summary helpers (where appropriate)

## Data Model / API / Interface Changes

### External API changes
- **Planned:** none (no route/path/response contract changes required for this refactor).
- Keep current endpoints, status codes, and response payload shapes stable.

### Internal interface changes
- Endpoints in `main.py` will call service-layer functions rather than direct mixed helpers.
- Service function signatures will become the internal contracts for integrations.

### Database / schema changes
- **Planned:** none required for this refactor.
- Existing `backend/supabase_schema.sql` remains valid.

## Verification Approach

### Automated tests
- Run full backend test suite:
  - `uv run python -m unittest discover -s backend/tests -v`
- Run targeted tests while migrating:
  - `uv run python -m unittest backend.tests.test_openrouter_user_tracking -v`
  - `uv run python -m unittest backend.tests.test_free_plan_quota -v`
  - `uv run python -m unittest backend.tests.test_admin_foundation -v`
  - `uv run python -m unittest backend.tests.test_model_config -v`
  - `uv run python -m unittest backend.tests.test_cors_config -v`

### Manual verification checkpoints
- Auth: register/login/me still work.
- Conversations: create/get/list/archive unchanged.
- Message flows: `/message` and `/message/stream` return same staged shape and metadata.
- Billing: checkout creation/confirm/webhook paths behave the same.
- Admin: users, plan/role update, quota reset, feedback list remain stable.

## Structural Improvement Points (for maintenance/context)
- Reduce `main.py` size and cognitive load by removing Stripe/Supabase/OpenRouter internals.
- Centralize duplicated helpers in `utils.py` to avoid subtle behavior drift.
- Keep integration code in `services/*` so future provider swaps are localized.
- Make runtime-unused paths explicit (remove or deprecate) to reduce noise and onboarding friction.
- Establish clear internal layering:
  - `main.py` (HTTP/API)
  - `services/*` (business + provider orchestration)
  - `utils.py` (shared pure helpers)
  - `stages/*` (council-specific prompt/orchestration logic)
