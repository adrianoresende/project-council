# Spec and build

## Configuration
- **Artifacts Path**: {@artifacts_path} → `.zenflow/tasks/{task_id}`

---

## Agent Instructions

Ask the user questions when anything is unclear or needs their input. This includes:
- Ambiguous or incomplete requirements
- Technical decisions that affect architecture or user experience
- Trade-offs that require business context

Do not make assumptions on important decisions — get clarification first.

If you are blocked and need user clarification, mark the current step with `[!]` in plan.md before stopping.

---

## Workflow Steps

### [x] Step: Technical Specification
<!-- chat-id: a9f20383-633e-4b7a-9376-0052ae5be5fa -->

Assess the task's difficulty, as underestimating it leads to poor outcomes.
- easy: Straightforward implementation, trivial bug fix or feature
- medium: Moderate complexity, some edge cases or caveats to consider
- hard: Complex logic, many caveats, architectural considerations, or high-risk changes

Create a technical specification for the task that is appropriate for the complexity level:
- Review the existing codebase architecture and identify reusable components.
- Define the implementation approach based on established patterns in the project.
- Identify all source code files that will be created or modified.
- Define any necessary data model, API, or interface changes.
- Describe verification steps using the project's test and lint commands.

Save the output to `{@artifacts_path}/spec.md` with:
- Technical context (language, dependencies)
- Implementation approach
- Source code structure changes
- Data model / API / interface changes
- Verification approach

If the task is complex enough, create a detailed implementation plan based on `{@artifacts_path}/spec.md`:
- Break down the work into concrete tasks (incrementable, testable milestones)
- Each task should reference relevant contracts and include verification steps
- Replace the Implementation step below with the planned tasks

Rule of thumb for step size: each step should represent a coherent unit of work (e.g., implement a component, add an API endpoint, write tests for a module). Avoid steps that are too granular (single function).

Important: unit tests must be part of each implementation task, not separate tasks. Each task should implement the code and its tests together, if relevant.

Save to `{@artifacts_path}/plan.md`. If the feature is trivial and doesn't warrant this breakdown, keep the Implementation step below as is.

---

### [x] Step: Backend Data Model and Storage Foundation
<!-- chat-id: e5829b6e-c8ad-4297-bcc8-af6f1ef40363 -->

- Update `backend/supabase_schema.sql` to add `app_models` table and conversation model selection columns.
- Extend `backend/services/supabase/storage.py` to support:
  - model catalog CRUD and active model listing
  - reading/writing conversation model selection fields
- Add/adjust backend tests in the same step for storage-facing behavior and conversation serialization defaults.
- Verify with:
  - `uv run python -m unittest backend.tests.test_admin_models_api`
  - `uv run python -m unittest backend.tests.test_conversation_model_modes`

### [ ] Step: Backend APIs for OpenRouter Discovery, Admin Management, and Conversation Mode

- Extend `backend/services/openrouter/client.py` with OpenRouter model discovery support.
- Update `backend/main.py` with:
  - `GET /api/admin/openrouter/models`
  - admin model management endpoints (`GET/POST/PATCH/DELETE /api/admin/models`)
  - `GET /api/models` for active user-facing model options
  - `PATCH /api/conversations/{conversation_id}/model` for per-conversation selection
- Add/update backend API contract tests in the same step (`backend/tests/test_admin_foundation.py`, new model API tests).
- Verify with:
  - `uv run python -m unittest backend.tests.test_admin_foundation`
  - `uv run python -m unittest backend.tests.test_admin_models_api`

### [ ] Step: Mode-Aware Message Execution (Council vs Single Model)

- Update both message endpoints in `backend/main.py` to branch by conversation model mode:
  - `council`: keep current 3-stage flow
  - `single`: one-model response flow without stage1/stage2 computation
- Ensure streaming and non-streaming responses remain contract-compatible and usage/quota logic remains correct.
- Add/extend tests in the same step for single-mode and council-mode behavior, including error paths.
- Verify with:
  - `uv run python -m unittest backend.tests.test_conversation_model_modes`
  - `uv run python -m unittest backend.tests.test_openrouter_user_tracking`

### [ ] Step: Frontend Chat Model Selector and Mode-Specific Rendering

- Update frontend API client (`frontend/src/api.js`) for new model and conversation-model endpoints.
- Update chat orchestration (`frontend/src/App.jsx`) to load model options, persist selection per conversation, and handle mode-aware response rendering.
- Update chat UI (`frontend/src/components/chat-interface/chat-interface.jsx`) to include model select control using shadcn patterns.
- Update process details rendering (`frontend/src/components/sidebar/sidebar-right.jsx`) to hide stage-focused UX for single-mode turns.
- Add/update frontend tests in the same step (`chat-interface.test.jsx`, App-adjacent behavior where applicable).
- Verify with:
  - `cd frontend && npm run test -- src/components/chat-interface/chat-interface.test.jsx`

### [ ] Step: Frontend Admin Models Tab and Final Verification Report

- Extend admin page (`frontend/src/pages/admin/page.jsx`) with new `Models` tab:
  - OpenRouter search/add flow
  - managed model table with edit/remove/disable/activate actions
- Add i18n entries in `frontend/src/i18n/translations.js` and update admin tests (`frontend/src/pages/admin/page.test.jsx`) in the same step.
- Run full verification:
  - `uv run python -m unittest discover -s backend/tests -p "test_*.py"`
  - `cd frontend && npm run test`
  - `cd frontend && npm run lint`
- Write final implementation report to `{@artifacts_path}/report.md` with implemented changes, test evidence, and major challenges.
