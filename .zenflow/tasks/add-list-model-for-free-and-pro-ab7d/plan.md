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
<!-- chat-id: bc440dfc-686e-4f47-8e9f-4f88da1e7091 -->

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

### [x] Step: Add plan-aware production model configuration
<!-- chat-id: f379727f-d9a9-4174-b53b-449853e8d957 -->

Implement model list resolution for FREE and PRO plans in production via environment variables.
- Update `backend/config.py` with parsed env-backed lists:
  - `PRODUCTION_FREE_COUNCIL_MODELS`
  - `PRODUCTION_PRO_COUNCIL_MODELS`
- Add/adjust helper(s) to normalize comma-separated model lists (trim quotes/spaces, remove empty values, de-duplicate preserving order).
- Preserve development behavior (`COUNCIL_ENV` in `development|dev|local`) and add safe production fallbacks.
- Add/extend unit tests for config resolution logic.
- Verification:
  - Run config-focused unit tests.
  - Confirm fallback behavior when env vars are missing/empty.

### [x] Step: Wire plan-specific model routing into council execution
<!-- chat-id: 4f4a6d52-49a3-422b-8a1f-769aef8821d1 -->

Apply resolved model lists based on authenticated user plan in message flows.
- Update `backend/stages/stage1.py` and `backend/stages/stage2.py` to accept optional `council_models` parameters while keeping backward-compatible defaults.
- Update `backend/main.py` (`send_message` and `send_message_stream`) to resolve plan-specific model lists once per request and pass to Stage 1 and Stage 2.
- Keep API contracts unchanged and ensure FREE/PRO quota behavior remains intact.
- Add/extend endpoint tests to validate routing for FREE vs PRO requests.
- Verification:
  - Run affected backend tests (`test_free_plan_quota.py` plus any new routing tests).

### [x] Step: Update docs and perform end-to-end verification

Document and validate new configuration paths.
- Update `README.md` model configuration section with new production env variables and examples.
- Include fallback and environment behavior notes (development vs production).
- Run full relevant backend unit tests.
- Perform manual verification using distinct FREE/PRO env model lists and confirm Stage 1/2 model sets differ by plan in production mode.
