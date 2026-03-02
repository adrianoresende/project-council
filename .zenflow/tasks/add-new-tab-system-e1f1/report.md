# Implementation Report: Add new tab "system"

## What was implemented

### Backend
- Added `AdminSystemModelsResponse` in `backend/main.py`.
- Added new admin-only endpoint:
  - `GET /api/admin/system/models`
  - Returns:
    - `free_models`: `get_council_models_for_plan("free")`
    - `pro_models`: `get_council_models_for_plan("pro")`
- Added backend contract test in `backend/tests/test_admin_foundation.py`:
  - `test_get_admin_system_models_returns_plan_specific_model_lists`

### Frontend API
- Added `api.getAdminSystemModels()` in `frontend/src/api.js`.

### Admin page UI
- Extended `frontend/src/pages/admin/page.jsx` with two tabs:
  - `Users` (existing behavior preserved)
  - `System` (new)
- Added lazy loading for system models when `System` tab is opened.
- Added refresh behavior per active tab:
  - refresh users list on `Users`
  - refresh system model lists on `System`
- Added `System` tab content with two cards in one responsive row (`md:grid-cols-2`):
  - Free plan models card
  - Pro plan models card
- Added loading/error/empty states for system models.

### Localization
- Added translation keys (EN/ES/PT) in `frontend/src/i18n/translations.js`:
  - `admin.tabs.system`
  - `admin.system.freeTitle`
  - `admin.system.proTitle`
  - `admin.system.loading`
  - `admin.system.failedLoad`
  - `admin.system.noModels`

### Frontend tests
- Extended admin page test mocks with `getAdminSystemModels`.
- Added test in `frontend/src/pages/admin/page.test.jsx`:
  - `shows system models in two plan cards when switching tabs`

## How the solution was tested
- Backend unit tests:
  - `.venv/bin/python -m unittest backend.tests.test_admin_foundation`
  - Result: **passed** (`12 tests`)
- Frontend unit tests:
  - `npm --prefix frontend run test -- src/pages/admin/page.test.jsx`
  - Result: **passed** (`1 file, 4 tests`)
- Frontend lint:
  - `npm --prefix frontend run lint`
  - Result: **failed**, but due to **pre-existing unrelated lint errors** in other files (not in this task’s changed files).

## Biggest issues or challenges encountered
- The default `python` binary was unavailable; tests were run with `.venv/bin/python`.
- `frontend` lint currently fails because of existing unrelated issues in:
  - `frontend/src/App.jsx`
  - `frontend/src/components/chat-interface/chat-interface.jsx`
  - `frontend/src/components/sidebar/sidebar.jsx`
  - `frontend/vite.config.js`
