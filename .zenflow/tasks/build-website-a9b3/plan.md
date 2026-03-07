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
<!-- chat-id: 9e03fd54-886c-4a6e-b97c-3a0a7fd63940 -->

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

### [x] Step: Scaffold Website App
<!-- chat-id: 475ae9f1-6941-4f63-8f84-00cc4650c998 -->
- Create a new standalone `website/` app using Vite + React.
- Install and configure Tailwind CSS v4 (`@tailwindcss/vite`) and baseline global styles.
- Configure `Inter` as the global font family.
- Ensure scripts cover `dev`, `build`, `lint`, and `preview`.
- Add lightweight test tooling for the new app if missing (Vitest + Testing Library) and wire a basic test script.
- Verification:
  - `cd website && npm run lint`
  - `cd website && npm run test` (if configured in this step)

### [ ] Step: Build Landing Page Sections
- Implement a single-page marketing layout with:
  - Hero/top navigation
  - `How it works`
  - `Why use LLM Council`
  - `Pricing`
  - Final CTA/footer
- Use `https://llmcouncil.ai/` as reference for content hierarchy and messaging direction.
- Use `https://www.brex.com/` as reference for visual tone (layout rhythm, card hierarchy, CTA emphasis).
- Ensure mobile-first responsive behavior and semantic heading structure.
- Add/update unit tests that assert required section headings and core pricing content render.
- Verification:
  - `cd website && npm run test`
  - `cd website && npm run lint`

### [ ] Step: SEO, Validation, and Report
- Add SEO metadata to `website/index.html` (title, description, canonical, Open Graph, Twitter cards).
- Add JSON-LD structured data for the web application and plan offers.
- Run final build and manual QA checks across desktop and mobile viewport sizes.
- Write `{@artifacts_path}/report.md` summarizing implementation, testing, and key challenges.
- Verification:
  - `cd website && npm run lint`
  - `cd website && npm run test`
  - `cd website && npm run build`
