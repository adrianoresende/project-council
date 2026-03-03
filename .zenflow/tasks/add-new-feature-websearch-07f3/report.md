# Implementation Report: Web Search Plugin Toggle

## What was implemented

### Backend
- Added request header support for `X-Web-Search` in both endpoints:
  - `POST /api/conversations/{conversation_id}/message`
  - `POST /api/conversations/{conversation_id}/message/stream`
- Added helper `_is_truthy_header(...)` to parse toggle values safely.
- Added helper `_build_model_plugins(...)` to compose OpenRouter plugins in one place.
- Preserved existing PDF parsing behavior and merged it with web search when both are enabled.
- Enforced plan-based `web` plugin limits:
  - FREE: `max_results = 2`
  - PRO: `max_results = 5`
- Applied merged plugins to Stage 1 and Stage 3 in both sync and streaming message flows.

### Frontend
- Added `useWebSearch` message option flow from UI to API layer.
- Updated `App` send handler to accept options and forward `useWebSearch` to stream API calls.
- Updated API client to send `X-Web-Search` for both:
  - `sendMessage(...)`
  - `sendMessageStream(...)`
- Passed `userPlan` down to `ChatInterface` through `ChatPage`.
- Added new composer menu action (in the same list as upload):
  - Toggle web search ON/OFF
  - Active visual state when enabled
  - Plan-aware description showing max results (`2` free / `5` pro)
  - Disabled during in-flight requests via existing composer disabled behavior
- Added i18n keys for EN/ES/PT:
  - `chat.webSearchAction`
  - `chat.webSearchDescription`
  - `chat.webSearchEnabled`

### Tests
- Backend: expanded `backend/tests/test_openrouter_user_tracking.py`
  - Added plugin builder unit tests
  - Added endpoint propagation tests for web search plugin limits in FREE/PRO
- Frontend: added `frontend/src/components/chat-interface/chat-interface.test.jsx`
  - Validates free-plan description text (`max 2`)
  - Validates toggle sends `{ useWebSearch: true }`

## How the solution was tested

### Passing
- `./.venv/bin/python -m unittest backend.tests.test_openrouter_user_tracking`
- `./.venv/bin/python -m unittest discover -s backend/tests`
- `cd frontend && npm run test -- src/components/chat-interface/chat-interface.test.jsx`

### Not fully passing (pre-existing issues)
- `cd frontend && npm run test`
  - Existing unrelated failure in `src/auth/supabase-auth.test.js` (redirect target assertion mismatch).
- `cd frontend && npm run lint`
  - Existing unrelated lint errors/warnings already present in repo (e.g., unused vars and hook rules in files outside this task scope, plus existing issues in `chat-interface.jsx`).

## Biggest issues / challenges
- Frontend lint/test baseline in this repository is currently not clean, so full-suite frontend verification includes pre-existing failures unrelated to this feature.
- Ensured new feature changes were validated with targeted tests while keeping behavior consistent across both sync and stream backend paths.
