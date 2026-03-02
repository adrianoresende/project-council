# Investigation: Conversation Search Plugin Not Applied

## Bug Summary
- Reported behavior: a conversation created with search enabled still returns responses without web search/plugin usage.
- Expected behavior: when search is enabled for a conversation, Stage 1 and Stage 3 model calls should include the web search plugin.

## Root Cause Analysis
1. Conversation creation does not accept or persist plugin/search settings.
   - `CreateConversationRequest` is empty, so incoming settings are dropped (`backend/main.py:76`).
   - Conversation records only store `id`, `user_id`, `title`, `archived`, `created_at` (`backend/supabase_schema.sql:3`).
   - Storage read/write paths do not include any plugin/search setting (`backend/storage.py:350`, `backend/storage.py:369`).
2. Frontend never sends search/plugin configuration.
   - `createConversation()` posts `{}` (`frontend/src/api.js:242`).
   - App conversation bootstrap/manual creation both call `api.createConversation()` with no settings (`frontend/src/App.jsx:363`, `frontend/src/App.jsx:433`).
   - Message payload builder only sends `content` and `files`, not plugin preferences (`frontend/src/api.js:269`, `frontend/src/api.js:301`).
3. Backend plugin injection is currently tied only to PDF file parsing.
   - Stage 1 and Stage 3 receive `plugins=PDF_TEXT_PLUGIN if needs_pdf_parser else None` in both sync and streaming flows (`backend/main.py:1216`, `backend/main.py:1580`, `backend/main.py:1630`).
   - There is no merge with conversation-level web search plugin.

## Affected Components
- Backend API contract and models:
  - `backend/main.py` (`CreateConversationRequest`, `/api/conversations`, `/api/conversations/{id}/message`, `/message/stream`)
- Storage and persistence:
  - `backend/storage.py`
  - `backend/supabase_schema.sql`
- Frontend API + app orchestration:
  - `frontend/src/api.js`
  - `frontend/src/App.jsx`

## Proposed Solution
1. Add a conversation-level setting for web search.
   - Introduce `web_search_enabled: bool = False` in request/response models.
   - Persist it in `conversations` table (recommended: `web_search_enabled boolean not null default false`).
2. Wire frontend to send and keep this setting.
   - Update `api.createConversation()` to accept optional settings payload.
   - Update all conversation creation call sites to pass intended setting (including auto-bootstrap path if applicable).
3. Resolve plugins centrally in backend.
   - Add a helper that merges:
     - PDF parser plugin (when files require it)
     - Web search plugin (when conversation has `web_search_enabled=true`)
   - Deduplicate plugin IDs and preserve deterministic order.
4. Use merged plugins in all model-call paths.
   - Apply to Stage 1 and Stage 3 in both non-streaming and streaming endpoints.
5. Backward compatibility.
   - For existing rows without the new field, default to `false` in storage normalization.

## Edge Cases / Side Effects to Cover
- Search enabled + PDF upload: both plugins should be present.
- Search disabled + PDF upload: only PDF plugin should be present.
- Search enabled + no files: only web plugin should be present.
- Legacy conversations (pre-migration): should continue to work with `web_search_enabled=false`.
- Ensure quota/billing logic remains unchanged (plugin setting should not affect token accounting behavior).

## Test Plan (for Implementation Step)
- Add backend tests for plugin resolution helper (combinational cases above).
- Add API-level regression test:
  - create conversation with `web_search_enabled=true`
  - send message
  - assert downstream model query receives web plugin.
- Add compatibility test for conversation fetch/list when field is missing (or defaulted).
