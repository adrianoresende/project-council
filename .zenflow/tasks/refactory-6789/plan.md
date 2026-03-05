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
<!-- chat-id: 354a0fe2-3d79-4d43-9416-59677534f385 -->

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

### [x] Step: Extract Shared Utilities and Service Scaffolding
<!-- chat-id: c4faf8be-7a0d-47ca-84eb-08deb6284d21 -->
- Create `backend/services/` package with initial domains:
  - `services/supabase`
  - `services/stripe`
  - `services/openrouter`
- Create `backend/utils.py` and move shared formatting/normalization helpers there (token/cost coercion, session-id normalization, plan normalization, datetime conversion helpers used in multiple modules).
- Keep behavior unchanged while introducing structure.
- Verification:
  - `uv run python -m unittest backend.tests.test_model_config -v`
  - `uv run python -m unittest backend.tests.test_cors_config -v`

### [x] Step: Migrate OpenRouter and Supabase Logic into Services
<!-- chat-id: e098102e-fbc9-443c-b2a3-55330ac09d59 -->
- Move OpenRouter client/query logic to `services/openrouter/client.py` and update stage modules to consume it.
- Move Supabase auth and data-access logic into `services/supabase/*`, consolidating duplicated REST/header/config code.
- Update `backend/main.py` imports to use new services, preserving endpoint contracts.
- Add or adjust unit tests for moved modules/import paths.
- Verification:
  - `uv run python -m unittest backend.tests.test_openrouter_user_tracking -v`
  - `uv run python -m unittest backend.tests.test_free_plan_quota -v`

### [x] Step: Migrate Stripe Logic and Thin Down API Layer
<!-- chat-id: aed584cc-203f-4f5f-a994-645253b6b2b2 -->
- Move Stripe request/signature/checkout reconciliation logic from `backend/main.py` into `services/stripe/*`.
- Keep webhook + billing endpoint payloads/status codes unchanged.
- Ensure service boundaries are explicit: API layer orchestrates, services implement provider logic.
- Add or adjust unit tests for Stripe-related flows affected by import/function movement.
- Verification:
  - `uv run python -m unittest backend.tests.test_admin_foundation -v`
  - `uv run python -m unittest backend.tests.test_free_plan_quota -v`

### [x] Step: Remove Runtime-Unused Code and Finalize Backend Verification
<!-- chat-id: 8c2d626b-1a15-4776-b07a-d720bec3b603 -->
- Remove or deprecate runtime-unused code identified in the spec (`run_full_council`, disabled credit RPC helpers, redundant parsing helpers), while preserving any required public compatibility.
- Clean up compatibility wrappers only after all imports/tests are updated.
- Run full backend regression tests and capture implementation details in report.
- Verification:
  - `uv run python -m unittest discover -s backend/tests -v`
- After completion, write `{@artifacts_path}/report.md` with:
  - Implemented changes
  - Test/verification evidence
  - Key issues/trade-offs encountered
