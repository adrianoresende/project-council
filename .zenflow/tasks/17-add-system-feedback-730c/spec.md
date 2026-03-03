# Technical Specification - Task #17: Add system feedback

## Difficulty assessment

Medium complexity.

This feature touches multiple layers (database schema, backend API/storage, user modal flow, admin tab, i18n, and tests) but follows existing architecture patterns and does not require new infrastructure.

## Technical context

- Backend stack: FastAPI + Pydantic + `httpx` + Supabase PostgREST via service-role key (`backend/main.py`, `backend/storage.py`).
- Database: Supabase Postgres schema managed in `backend/supabase_schema.sql`.
- Frontend stack: React 19 + Vite + Tailwind CSS + tabler icons + i18n translations object (`frontend/src/i18n/translations.js`).
- Existing reusable patterns:
  - Admin tab loading and tab-specific data fetch in `frontend/src/pages/admin/page.jsx`.
  - Sidebar user dropdown actions in `frontend/src/components/sidebar/sidebar.jsx`.
  - API wrapper and error normalization in `frontend/src/api.js`.
  - Backend admin authorization via `get_current_admin_user` dependency.
  - Storage REST helpers via `_rest_request` in `backend/storage.py`.

## Implementation approach

### 1) Persist feedback in database

Add a dedicated feedback table in Supabase schema:

- Table: `public.feedback_messages`
- Columns:
  - `id bigint generated always as identity primary key`
  - `user_id uuid not null references auth.users (id) on delete cascade`
  - `user_email text not null`
  - `message text not null`
  - `created_at timestamptz not null default now()`
- Constraints/indexes:
  - `check (char_length(trim(message)) between 1 and 4000)`
  - index on `created_at desc`
  - optional index on `(user_id, created_at desc)` for future filtering
- RLS:
  - enable RLS
  - owner insert/select policies (`auth.uid() = user_id`)

Notes:
- Storing `user_email` snapshot avoids expensive joins with auth-admin APIs for every feedback row.
- Service-role backend access remains the primary read path for admin listing.

### 2) Add backend feedback APIs

Add feedback contracts and endpoints in `backend/main.py`:

- `POST /api/feedback` (authenticated user)
  - Request model: `{ message: string }`
  - Validation: trim; reject empty; enforce max length (same bound as DB check)
  - Calls storage insert with `user["id"]`, `user["email"]`, normalized message
  - Returns inserted row payload (or minimal success payload) for UI confirmation

- `GET /api/admin/feedback` (admin only)
  - Uses `Depends(get_current_admin_user)`
  - Returns list sorted by newest first
  - Response fields mapped for admin table:
    - `user_email`
    - `message`
    - `date_sent` (mapped from `created_at`)

Add storage functions in `backend/storage.py`:

- `create_feedback_message(user_id, user_email, message)`
- `list_feedback_messages(limit=200)`
- Both implemented with existing `_rest_request` helper and normalized output.

### 3) Add user feedback modal flow

Frontend behavior:

- Add `Send feedback` action in sidebar user dropdown.
- Clicking opens a modal with:
  - Friendly copy emphasizing feedback importance.
  - `textarea` labeled `Your message`.
  - Top-right `X` close action.
- Submit:
  - Calls new API method `api.sendFeedback(message)`.
  - On success, show success state with check icon + thank-you message + close button.
  - On failure, show red inline error label below textarea: ask user to try again now or later.

Implementation shape:

- New reusable component: `frontend/src/components/feedback/feedback-modal.jsx`.
- Modal state managed at app/shell level so it can open from sidebar regardless of main view.
- Wire open handler from sidebar through page shell props.

### 4) Add admin feedback tab

Extend admin page with third tab: `Feedback`.

- Load via `api.getAdminFeedback()` (lazy-load when tab opens, with refresh support).
- Render table columns exactly:
  - user (email)
  - message
  - date sent
- Include loading, empty, and error states consistent with existing Users/System tabs.

## Source code structure changes

Planned file updates:

- `backend/supabase_schema.sql`
- `backend/storage.py`
- `backend/main.py`
- `backend/tests/test_admin_foundation.py`
- `frontend/src/api.js`
- `frontend/src/App.jsx`
- `frontend/src/pages/home/page.jsx`
- `frontend/src/components/sidebar/sidebar.jsx`
- `frontend/src/pages/admin/page.jsx`
- `frontend/src/pages/admin/page.test.jsx`
- `frontend/src/i18n/translations.js`

Planned new files:

- `frontend/src/components/feedback/feedback-modal.jsx`
- `frontend/src/components/feedback/feedback-modal.test.jsx`

## Data model / API / interface changes

### Database

New table: `public.feedback_messages` with message text, sender identity (user id + email snapshot), and submission timestamp.

### Backend API

- `POST /api/feedback`
  - Auth required
  - Body: `{ "message": "..." }`
  - Validation failure -> `400`
- `GET /api/admin/feedback`
  - Admin auth required
  - Returns list rows:
    - `{ "user_email": "user@example.com", "message": "...", "date_sent": "2026-03-02T..." }`

### Frontend interfaces

- `api.sendFeedback(message)`
- `api.getAdminFeedback()`
- Sidebar prop contract extended with feedback-open handler.
- New i18n keys for:
  - sidebar action label
  - feedback modal title/copy/labels/errors/success
  - admin feedback tab + table labels + loading/empty/error messages

## Verification approach

Backend verification:

- Add/extend unit tests in `backend/tests/test_admin_foundation.py`:
  - user feedback submission contract and validation
  - admin feedback list route contract + admin gating behavior
- Run:
  - `uv run python -m unittest backend.tests.test_admin_foundation`

Frontend verification:

- Add/extend tests:
  - `frontend/src/components/feedback/feedback-modal.test.jsx`
  - `frontend/src/pages/admin/page.test.jsx` (feedback tab rendering/data fetch)
- Run:
  - `cd frontend && npm run test -- src/components/feedback/feedback-modal.test.jsx src/pages/admin/page.test.jsx`
  - `cd frontend && npm run lint`

Manual smoke verification:

- User opens dropdown -> `Send feedback` -> modal opens/closes via `X`.
- Submit valid feedback -> success state appears with check icon and close button.
- Simulated API failure -> red error label under textarea.
- Admin -> Feedback tab shows rows with user email, message, and date sent.
