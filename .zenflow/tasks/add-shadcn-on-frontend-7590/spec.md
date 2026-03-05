# Technical Specification: Add shadcn on frontend

## Difficulty Assessment
- **Level**: medium
- **Why**: This is mostly frontend integration work (configuration + component migration), but it touches build configuration, global styling, dependency management, and shared UI used by multiple screens.

## Technical Context
- Frontend stack: React 19 + Vite 7 + Tailwind CSS v4 (`@tailwindcss/vite`) in JavaScript (`frontend/package.json`).
- Existing global styles live in `frontend/src/index.css` and include markdown/layout rules that must be preserved.
- Current select UI is a custom component at `frontend/src/components/ui/select.jsx` used by:
  - `frontend/src/components/stages/stage-1.jsx`
  - `frontend/src/components/stages/stage-2.jsx`
  - `frontend/src/components/tab/tab.jsx`
- There is currently no shadcn setup (`components.json` missing), no `@` path alias, and no shared `cn()` utility file.

## Implementation Approach
1. Prepare shadcn prerequisites for Vite + React
- Ensure frontend dependency baseline is installed and `.gitignore` already covers generated artifacts (`node_modules`, `dist`, logs).
- Add alias support for shadcn-style imports:
  - `frontend/vite.config.js`: add `resolve.alias` for `@ -> ./src`
  - `frontend/jsconfig.json`: add matching `paths` mapping for editor/tooling.

2. Initialize shadcn
- Run `npx shadcn@latest init` in `frontend/` with Vite + Tailwind setup.
- Commit generated config artifacts (notably `frontend/components.json`).
- Add required runtime dependencies introduced by shadcn (including `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, and Radix deps as needed).

3. Introduce shadcn Select and migrate current select usage
- Generate shadcn select primitives with `npx shadcn@latest add select`.
- Keep app-level behavior stable by introducing a small adapter component (e.g. `model-select`) that accepts the current `options`, `value`, and callback contract while rendering shadcn primitives.
- Update callers in Stage 1, Stage 2, and Tabs to use the adapter (or directly use shadcn primitives if refactor is cleaner).

4. Integrate shadcn design tokens safely
- Update `frontend/src/index.css` with shadcn base token variables/layers required by generated components.
- Preserve existing markdown formatting and root layout rules to avoid visual regressions.

## Source Code Structure Changes
Planned file updates:
- **Create** `frontend/components.json`
- **Create** `frontend/jsconfig.json`
- **Create** `frontend/src/lib/utils.js`
- **Create/Update** shadcn component files under `frontend/src/components/ui/` (at minimum `select.jsx`)
- **Create** adapter component under `frontend/src/components/ui/` (name finalized during implementation)
- **Modify** `frontend/vite.config.js`
- **Modify** `frontend/src/components/stages/stage-1.jsx`
- **Modify** `frontend/src/components/stages/stage-2.jsx`
- **Modify** `frontend/src/components/tab/tab.jsx`
- **Modify** `frontend/src/index.css`
- **Modify (auto-generated)** `frontend/package.json`, `frontend/package-lock.json`

## Data Model / API / Interface Changes
- Backend data model/API: **no changes**.
- Frontend app behavior: no product-level feature changes expected; this is a UI component implementation migration.
- Component interface:
  - Preferred path is to keep the existing call-site contract through an adapter so parent components do not need behavior changes.
  - If direct shadcn usage is chosen, only local callback signatures in the three select consumers change.

## Verification Approach
From `frontend/` run:
1. `npm run lint`
2. `npm run test`
3. `npm run build`

Manual checks in `npm run dev`:
1. Stage 1 model selector changes tab correctly.
2. Stage 2 model selector changes tab correctly.
3. Mobile tab selector in `Tabs` still switches the active tab.
4. No regressions in markdown spacing and general page layout.

## Planning Decision
- This task is medium complexity but still bounded to a single integration slice.
- The existing `Implementation` step in `plan.md` is sufficient and does not need to be replaced with additional root-level steps.
