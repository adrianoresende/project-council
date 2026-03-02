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
<!-- chat-id: 082585cc-8dc3-4093-ac62-fef6c15d081a -->

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

### [x] Step: Backend feedback persistence and API contracts
<!-- chat-id: 4261f9a3-b369-441d-a00f-45afd43d559a -->

Implement database and backend support for feedback submission and admin listing.
- Update `backend/supabase_schema.sql` with `feedback_messages` table, indexes, and RLS policies.
- Add storage-layer functions in `backend/storage.py` for creating feedback and listing feedback rows.
- Add API models and routes in `backend/main.py`:
  - `POST /api/feedback` for authenticated users.
  - `GET /api/admin/feedback` for admins.
- Add/extend backend tests in `backend/tests/test_admin_foundation.py` to cover:
  - feedback submission validation and contract,
  - admin feedback listing contract and authorization.
- Verification:
  - `uv run python -m unittest backend.tests.test_admin_foundation`

### [x] Step: User feedback modal flow in sidebar menu
<!-- chat-id: c466d24a-7cd5-489e-b9f8-fe61aac6c33f -->

Implement the end-user feedback UX from the sidebar dropdown through API submission.
- Add `Send feedback` action to `frontend/src/components/sidebar/sidebar.jsx`.
- Create modal component for feedback form/success/error states (including top-right `X`) and wire it into app/page shell.
- Add API client method in `frontend/src/api.js` for feedback submission.
- Add i18n keys in `frontend/src/i18n/translations.js` for new sidebar/modal copy.
- Add frontend tests for modal behavior (submit success, submit error, close actions) in a new test file.
- Verification:
  - `cd frontend && npm run test -- src/components/feedback/feedback-modal.test.jsx`
  - `cd frontend && npm run lint`

### [ ] Step: Admin Feedback tab and table rendering

Implement admin feedback visibility with required columns and states.
- Extend `frontend/src/pages/admin/page.jsx` with a `Feedback` tab and tab-specific data loading.
- Add API client method in `frontend/src/api.js` for admin feedback retrieval.
- Render feedback table with columns: user (email), message, date sent.
- Add loading, empty, and error states aligned with existing admin tab patterns.
- Extend `frontend/src/pages/admin/page.test.jsx` to cover feedback tab fetch/render behavior.
- Verification:
  - `cd frontend && npm run test -- src/pages/admin/page.test.jsx`
  - `cd frontend && npm run lint`

### [ ] Step: End-to-end validation and implementation report

Run targeted checks and produce the task report artifact.
- Run backend and frontend targeted tests together after all changes.
- Perform manual smoke checks:
  - user modal open/close, success, error,
  - admin feedback tab shows expected columns/data.
- Document implementation details, executed tests, and main challenges in `{@artifacts_path}/report.md`.
