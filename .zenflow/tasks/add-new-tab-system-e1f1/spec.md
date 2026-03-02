# Technical Specification: Add "System" Tab on Admin Page

## Difficulty Assessment
- **Complexity:** Medium
- **Why:** The UI change is straightforward, but the tab needs authoritative model lists per plan plus a chairman entry rendered at the bottom of each plan list. That requires a small backend admin API addition, frontend API client update, localization updates, and test coverage across backend + frontend.

## Technical Context
- **Frontend:** React 19 + Vite, Tailwind utility classes, Vitest + Testing Library.
- **Backend:** FastAPI + Pydantic (Python), existing admin role gate via `get_current_admin_user`.
- **Current admin page:** `frontend/src/pages/admin/page.jsx` has a single hardcoded `Users` tab.
- **Model source of truth:** Backend config runtime resolution via `get_council_models_for_plan(plan)` in `backend/config.py`.

## Implementation Approach
1. Add a backend admin endpoint that returns current configured model lists for `free` and `pro` plans.
2. Include chairman model information in that endpoint response so UI can render a labeled `chairman` row at the bottom of each plan list.
3. Add a frontend API client method to fetch this endpoint.
4. Extend the admin page to support two tabs:
- `Users` (existing behavior unchanged)
- `System` (new view)
5. Render the `System` tab content as two cards in one row (desktop) and stacked on mobile:
- Card 1: list of models for free plan
- Card 2: list of models for pro plan
- In each card, render the chairman model as the **last list item** with label text `chairman`.
6. Add translation keys for new tab and system-card labels/messages in all supported locales (`en`, `es`, `pt`), including a chairman label key.
7. Add/adjust tests for backend contract and new frontend tab behavior.

## Source Code Structure Changes
### Backend
- **Modify** `backend/main.py`
- Add a response model for system model lists (e.g. `AdminSystemModelsResponse`).
- Add new endpoint: `GET /api/admin/system/models` protected by `Depends(get_current_admin_user)`.
- Endpoint returns:
  - `free_models`: `get_council_models_for_plan("free")`
  - `pro_models`: `get_council_models_for_plan("pro")`
  - `chairman_model`: `CHAIRMAN_MODEL`

- **Modify** `backend/tests/test_admin_foundation.py`
- Add tests that validate new endpoint contract and values from mocked `get_council_models_for_plan`.
- Keep tests unit-level (async function tests) consistent with existing style.

### Frontend
- **Modify** `frontend/src/api.js`
- Add `getAdminSystemModels()` calling `GET /api/admin/system/models`.

- **Modify** `frontend/src/pages/admin/page.jsx`
- Add tab state (e.g. `activeTab: "users" | "system"`).
- Convert current single-tab markup into two-tab control using existing visual pattern.
- Keep users table + drawer logic rendered only for `users` tab.
- Add system-tab data state:
  - `systemModels` object (`free_models`, `pro_models`)
  - loading/error states
- Fetch system models when `System` tab is selected (lazy load) and cache in state.
- Render system tab cards in responsive grid:
  - container: `grid gap-4 md:grid-cols-2`
  - each card displays heading + bullet list of model IDs
  - append one final list row with chairman label (e.g., `chairman: <model-id>`)
  - include empty-state message if a plan has no configured models

- **Modify** `frontend/src/pages/admin/page.test.jsx`
- Extend API mock with `getAdminSystemModels`.
- Add test for switching to `System` tab and showing both cards and model rows.
- Ensure existing drawer-action tests remain valid.

- **Modify** `frontend/src/i18n/translations.js`
- Add new keys for all languages:
  - `admin.tabs.system`
  - `admin.system.freeTitle`
  - `admin.system.proTitle`
  - `admin.system.chairmanLabel`
  - `admin.system.loading`
  - `admin.system.failedLoad`
  - `admin.system.noModels`

## Data Model / API / Interface Changes
- **New API endpoint:** `GET /api/admin/system/models`
- **Auth:** Admin-only (same gate as existing admin endpoints).
- **Response contract:**
```json
{
  "free_models": ["openai/gpt-5.1", "..."],
  "pro_models": ["openai/gpt-5.1", "..."],
  "chairman_model": "google/gemini-3-pro-preview"
}
```
- **UI contract detail:** In each plan card, render all plan models first, then render the chairman row last with label `chairman`.
- **Persistence changes:** None.
- **Database schema changes:** None.

## Verification Approach
### Automated checks
1. Backend unit tests:
- `python -m unittest backend.tests.test_admin_foundation`
2. Frontend unit tests:
- `npm --prefix frontend run test -- src/pages/admin/page.test.jsx`
3. Frontend lint:
- `npm --prefix frontend run lint`

### Manual validation
1. Open admin page as admin user.
2. Confirm tabs show `Users` and `System`.
3. Click `System`; verify two cards appear (free/pro) with model lists.
4. Verify each card includes a bottom row labeled `chairman` with model value.
5. Verify cards render side-by-side on desktop width and stack on mobile width.
6. Return to `Users`; verify existing table + drawer behavior still works.

## Planning Note
- This feature is moderate but still cohesive enough to keep as a single Implementation step in `plan.md` (no further step decomposition required for this task size).
