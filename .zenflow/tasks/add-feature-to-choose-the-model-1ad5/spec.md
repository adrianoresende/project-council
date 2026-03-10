# Technical Specification: Add Feature to Choose the Model

## Complexity Assessment
- Level: **hard**
- Rationale:
  - Cross-cutting change across database schema, backend APIs, message orchestration, streaming flow, admin UI, chat UI, and tests.
  - Introduces a second execution mode (`single`) while preserving the current 3-stage council mode.
  - Requires remote model discovery integration with OpenRouter plus local model governance (CRUD + activation).

## Technical Context
- Backend:
  - Python 3.10+, FastAPI, Pydantic, httpx.
  - Supabase PostgREST access via `backend/services/supabase/rest.py` and storage facade in `backend/services/supabase/storage.py`.
  - Current inference orchestration in `backend/main.py` + `backend/stages/*` is council-centric.
- Frontend:
  - React 19 + Vite + Tailwind 4.
  - Existing shadcn-style UI primitives already present (`Select`, `DropdownMenu`, `Dialog`, `Sheet`) under `frontend/src/components/ui/`.
  - Admin page currently supports tabs: Users, System, Feedback.
- Data:
  - Existing tables: `conversations`, `messages`, `account_credits`, `billing_payments`, `feedback_messages`.
  - Message storage currently expects assistant payload in staged format (`stage1`, `stage2`, `stage3`).

## Implementation Approach

### 1) Add Managed Model Catalog (DB + Storage)
Create a new model management table used by admin and chat selection.

Proposed table: `public.app_models`
- `id` (bigint identity primary key)
- `title` (text, required)
- `model` (text, required, unique) -> OpenRouter model ID (`openai/gpt-5.1`)
- `category` (text, required) -> provider/vendor (`openai`, `google`, `anthropic`, etc.)
- `active` (boolean, required, default `true`)
- `created_at` / `updated_at` timestamps

Add conversation model configuration columns to `public.conversations`:
- `model_mode` text not null default `'council'` (`'council' | 'single'`)
- `selected_model` text nullable (OpenRouter model ID when `model_mode='single'`)
- `selected_model_title` text nullable (display snapshot for UI convenience)

Storage layer updates:
- Add CRUD methods for `app_models`.
- Add method to list active models for end users.
- Add method to update a conversation’s model selection.
- Expand conversation load/list methods to include `model_mode`, `selected_model`, `selected_model_title`.

### 2) Add OpenRouter Model Discovery API
Add backend endpoint that proxies OpenRouter model list for admin search.

OpenRouter integration:
- Extend `backend/services/openrouter/client.py` with `list_openrouter_models(query, limit)`:
  - GET `https://openrouter.ai/api/v1/models`
  - Normalize output to lightweight contract: `id`, `name`, `category`, `context_length`
  - Category fallback: parse prefix before `/` in `id`
  - Apply server-side query filter (`id` or `name` contains query)

Endpoint:
- `GET /api/admin/openrouter/models?query=<text>&limit=<n>` (admin-only)

### 3) Add Model Management APIs
Admin APIs for local catalog management:
- `GET /api/admin/models` -> list all managed models
- `POST /api/admin/models` -> add model from OpenRouter search result (or direct ID)
- `PATCH /api/admin/models/{id}` -> edit title/category/active
- `DELETE /api/admin/models/{id}` -> remove model

User API for chat selector:
- `GET /api/models` -> list active managed models

Conversation model selector API:
- `PATCH /api/conversations/{conversation_id}/model`
  - Body: `{ model_mode: "council" | "single", selected_model?: string }`
  - Validation:
    - `single` requires `selected_model` existing and active in `app_models`
    - `council` clears `selected_model` and `selected_model_title`

### 4) Support Dual Conversation Modes in Message Execution
Update both `/api/conversations/{id}/message` and `/api/conversations/{id}/message/stream`.

Mode resolution:
- Read from conversation (`model_mode`, `selected_model`)

Council mode (`model_mode='council'`):
- Keep existing 3-stage flow.
- Council model set source:
  - Primary: active `app_models` list
  - Fallback: existing `get_council_models_for_plan(plan)` when no active catalog rows exist (backward compatibility)

Single mode (`model_mode='single'`):
- Skip stage1/stage2 computation.
- Query exactly one model (`selected_model`) with conversation history + attachments + plugin handling.
- Persist assistant message using existing schema compatibility:
  - `stage1 = []`
  - `stage2 = []`
  - `stage3 = { model, response, usage, workflow_mode: "single" }`
- Return metadata including mode so frontend can render without stage UI.

Streaming compatibility:
- Reuse current event contract where possible; single mode emits only relevant completion path (no stage1/stage2 payload events).
- Preserve `complete` event with usage/credits.

### 5) Frontend Chat Model Selector
Add a model selector inside chat composer using shadcn `Select` primitives.

Behavior:
- Load active models from `GET /api/models`.
- Options:
  - `Council` (synthetic option)
  - active admin-managed models
- On selection change:
  - call `PATCH /api/conversations/{id}/model`
  - update local conversation state
- Rendering:
  - `council`: current stage-oriented UX unchanged
  - `single`: show normal chat answer only; hide process details/stage drilldown for those turns

### 6) Frontend Admin “Models” Tab
Extend Admin page with new tab: `Models`.

Features:
- Search input in tab header:
  - query OpenRouter models endpoint
  - pick a result and add to managed catalog
- Managed models table:
  - columns: Title, Model, Category, Active, Actions
  - actions: edit, remove, disable/active
- Use shadcn UI components/patterns for select/input/dialog/toggle interactions, consistent with current frontend architecture.

## Source Code Structure Changes

### Backend files to modify
- `backend/supabase_schema.sql`
- `backend/services/openrouter/client.py`
- `backend/services/supabase/storage.py`
- `backend/main.py`

### Backend files to add
- `backend/tests/test_admin_models_api.py`
- `backend/tests/test_conversation_model_modes.py`

### Frontend files to modify
- `frontend/src/api.js`
- `frontend/src/App.jsx`
- `frontend/src/components/chat-interface/chat-interface.jsx`
- `frontend/src/components/sidebar/sidebar-right.jsx`
- `frontend/src/pages/admin/page.jsx`
- `frontend/src/pages/admin/page.test.jsx`
- `frontend/src/components/chat-interface/chat-interface.test.jsx`
- `frontend/src/i18n/translations.js`

### Frontend files likely to add (if needed for shadcn ergonomics)
- `frontend/src/components/ui/input.jsx`
- `frontend/src/components/ui/switch.jsx`
- `frontend/src/components/ui/button.jsx`

## Data Model / API / Interface Changes

### Database
1. New table `app_models` with required model management fields (`title`, `model`, `category`, `active`).
2. New columns in `conversations` for per-conversation model configuration.

### API contracts (new/changed)
- New admin discovery and management endpoints:
  - `GET /api/admin/openrouter/models`
  - `GET /api/admin/models`
  - `POST /api/admin/models`
  - `PATCH /api/admin/models/{id}`
  - `DELETE /api/admin/models/{id}`
- New user endpoint:
  - `GET /api/models`
- New conversation config endpoint:
  - `PATCH /api/conversations/{id}/model`
- Existing conversation/message contracts extended with conversation model fields and mode-aware metadata.

### UI contracts
- Chat composer receives model options and selected mode/model for the active conversation.
- Admin page includes `models` tab state + API calls.
- i18n adds labels/errors/actions for model management and chat mode selection.

## Verification Approach

### Backend verification
- Run focused and full backend tests:
  - `uv run python -m unittest backend.tests.test_admin_foundation`
  - `uv run python -m unittest backend.tests.test_openrouter_user_tracking`
  - `uv run python -m unittest backend.tests.test_admin_models_api`
  - `uv run python -m unittest backend.tests.test_conversation_model_modes`
  - `uv run python -m unittest discover -s backend/tests -p "test_*.py"`

### Frontend verification
- Unit tests:
  - `cd frontend && npm run test -- src/pages/admin/page.test.jsx`
  - `cd frontend && npm run test -- src/components/chat-interface/chat-interface.test.jsx`
- Lint:
  - `cd frontend && npm run lint`

### Manual verification checklist
1. Admin can search OpenRouter, add a model, edit fields, toggle active state, and remove model.
2. Chat selector shows `Council` + active managed models.
3. Council mode still runs 3-stage flow and stage details.
4. Single mode sends to only the selected model and shows direct chat response without deliberation UI.
5. Conversation model choice persists when switching conversations and on page reload.
6. Credits/quota behavior remains unchanged for free/pro plans.

## Assumptions and Decisions
- Existing plan-based quota logic (free/pro) remains unchanged.
- Council mode should preferentially use active admin-managed models; environment-configured council model list remains fallback for backward compatibility.
- Single mode keeps message persistence backward compatible by storing only `stage3` data with empty `stage1`/`stage2` arrays.
