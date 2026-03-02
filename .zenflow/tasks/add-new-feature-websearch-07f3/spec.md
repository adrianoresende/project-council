# Technical Specification: Web Search Plugin Toggle

## Difficulty Assessment
- **Medium**: This change spans backend request handling, plugin composition, frontend UI controls, API client wiring, and test coverage updates. Logic is straightforward, but consistency across both non-stream and stream paths is required.

## Technical Context
- Backend stack: Python 3.10+, FastAPI, OpenRouter Chat Completions API (`/api/v1/chat/completions`).
- Frontend stack: React 19 + Vite, Tailwind utility classes, Tabler icons, i18n translation dictionary.
- Existing reusable capability:
  - OpenRouter `plugins` is already supported by `backend/openrouter.py` and stage calls.
  - PDF parsing plugin already exists (`PDF_TEXT_PLUGIN` in `backend/files.py`) and is injected for Stage 1 and Stage 3.
- Requirement to add:
  - User-controlled web search plugin activation from chat composer UI.
  - `max_results` must be plan-based:
    - FREE: `2`
    - PRO: `5`

## Implementation Approach
1. Add a per-message web search signal from frontend to backend.
- Use request header `X-Web-Search` (`"true"`/`"false"`) for both endpoints:
  - `POST /api/conversations/{conversation_id}/message`
  - `POST /api/conversations/{conversation_id}/message/stream`
- Keep request body schema unchanged (content/files remain as-is).

2. Build backend plugin composition once and reuse it for both Stage 1 and Stage 3.
- In `backend/main.py`, introduce small helpers:
  - Parse truthy header values.
  - Build plugin list from:
    - existing PDF plugin requirement (`needs_pdf_parser`)
    - web search toggle (`web_search_enabled`)
    - account plan (`free` vs `pro`) for `max_results`.
- Web search plugin payload shape:
  - `{"id": "web", "max_results": 2}` for FREE
  - `{"id": "web", "max_results": 5}` for PRO
- Merge plugins safely with PDF plugin when both are active.
- Pass the merged plugin list to `stage1_collect_responses(...)` and `stage3_synthesize_final(...)` in both sync and stream paths.
- Stage 2 remains unchanged (ranking should evaluate Stage 1 outputs, not perform new search).

3. Add chat UI control near existing file upload menu.
- In composer popover (same menu that contains “Upload file”), add a second action row for web search toggle.
- Behavior:
  - Default OFF.
  - Click toggles ON/OFF.
  - Include clear visual state (active styling/check indicator).
  - Disable while request is in-flight (same as other composer actions).
- Keep this state in `ChatInterface` and pass it through `onSendMessage(...)`.

4. Propagate plan to UI and request options through existing component hierarchy.
- `App.jsx` already has `userPlan`; pass it to `ChatPage` and then to `ChatInterface`.
- Extend send handler signature to include message options, e.g. `{ useWebSearch: boolean }`.
- In `frontend/src/api.js`, include `X-Web-Search` on both `sendMessage(...)` and `sendMessageStream(...)` requests.

5. Update i18n entries.
- Add localized labels/descriptions for:
  - Web search action
  - Enabled state text
  - Optional short description including plan limits (2 for FREE, 5 for PRO)
- Update all currently supported languages in `translations.js` (en/es/pt).

## Source Code Structure Changes
Files expected to be modified:
- `backend/main.py`
  - Parse `X-Web-Search` header.
  - Add helper(s) to compose plugin list with plan-based `max_results`.
  - Apply plugin list consistently to non-stream and stream message flows.
- `backend/tests/test_openrouter_user_tracking.py` (or new dedicated backend test file)
  - Add tests for plugin propagation and plan-specific `max_results`.
- `frontend/src/components/chat-interface/chat-interface.jsx`
  - Add web search toggle action in upload/file menu.
  - Send toggle value through `onSendMessage`.
- `frontend/src/pages/home/page.jsx`
  - Pass `userPlan` to `ChatInterface`.
- `frontend/src/App.jsx`
  - Extend `handleSendMessage` signature and forward web-search option to API.
- `frontend/src/api.js`
  - Add request header `X-Web-Search` for `sendMessage` and `sendMessageStream`.
- `frontend/src/i18n/translations.js`
  - Add new translation keys for web search UI copy.

Optional new test file (frontend):
- `frontend/src/components/chat-interface/chat-interface.test.jsx`
  - Validate toggle interaction and callback payload.

## Data Model / API / Interface Changes
- Data model/storage:
  - No schema/database changes.
  - No changes required in conversation persistence format.
- Backend API contract changes:
  - New optional request header: `X-Web-Search`.
  - Accepted values: truthy/falsey string; default OFF when absent/invalid.
- OpenRouter outbound payload changes:
  - `plugins` may now include web plugin in addition to existing file parser plugin.
- Response contract:
  - No required response shape changes.

## Verification Approach
Backend verification:
1. Run targeted backend tests:
- `python -m unittest backend.tests.test_openrouter_user_tracking`
- Plus any new/updated web-search-specific backend tests.
2. Run full backend suite:
- `python -m unittest discover -s backend/tests`

Frontend verification:
1. Run lint:
- `cd frontend && npm run lint`
2. Run tests:
- `cd frontend && npm run test`

Manual verification:
1. FREE user flow:
- Enable web search toggle in composer menu.
- Send message; confirm backend forwards plugin with `max_results: 2`.
2. PRO user flow:
- Enable web search toggle and send message; confirm `max_results: 5`.
3. Combined plugins flow:
- Upload PDF + enable web search; confirm both plugins are included together.
4. Stream parity:
- Repeat steps above via streaming path and confirm same plugin behavior.
5. UI behavior:
- Toggle is visible in upload menu, reflects active state, and is disabled while sending.

## Notes / Risks
- Reference doc is under Responses API Beta, while current backend uses Chat Completions endpoint; this implementation relies on existing plugin pass-through behavior already used by PDF parsing in this codebase.
- Some models may not support web search plugin uniformly; existing graceful degradation behavior (per-model failures tolerated) remains in place.
