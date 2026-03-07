# Technical Specification: LLM Council Marketing Website

## Difficulty Assessment
- Level: `medium`
- Rationale: this is a net-new frontend app in a new `website/` folder with custom visual direction, SEO metadata, and responsive layout requirements. There is no backend/API work, but there is moderate implementation scope across setup, UI structure, and brand execution.

## Technical Context
- Language/runtime: JavaScript, React 19, Vite 7.
- Styling: Tailwind CSS v4 via `@tailwindcss/vite`.
- Font requirement: `Inter` (loaded via Google Fonts in `index.html` and applied globally).
- Existing repo patterns to reuse:
  - The existing `frontend/` app already uses Vite + React + Tailwind v4 and ESLint; its config patterns can be mirrored.
  - Use existing project conventions for npm scripts: `dev`, `build`, `lint`, `preview`.
- Content/SEO direction source: `https://llmcouncil.ai/`
  - Core message themes: multi-model deliberation, anonymous peer review, chairman synthesis.
  - SEO shape: strong title/description, canonical URL, Open Graph/Twitter metadata, WebApplication structured data.
- Branding/visual direction source: `https://www.brex.com/`
  - Clean enterprise aesthetic, bold hero, strong spacing rhythm, card-based sections, high-contrast CTA emphasis.

## Implementation Approach
1. Scaffold a standalone Vite React app under `website/` (separate from existing `frontend/` product app).
2. Add and configure Tailwind CSS v4 with a global design token layer in `src/index.css` (colors, spacing, shadows, gradients, radii).
3. Implement a single-page landing layout in `src/App.jsx` with semantic sections:
   - Hero and top navigation
   - `How it works` (3-stage process cards)
   - `Why use LLM Council` (benefits + proof/stat blocks)
   - `Pricing` (Free vs Pro plan cards)
   - Final CTA and footer
4. Apply `Inter` globally and enforce responsive behavior for mobile/tablet/desktop breakpoints.
5. Implement SEO and discoverability metadata in `website/index.html`:
   - `<title>`, `meta description`, canonical, Open Graph, Twitter card
   - JSON-LD `WebApplication` with plan offers
6. Keep the website decoupled from backend and existing app routes; this is a static marketing surface only.

## Source Code Structure Changes
- New directory: `website/`
- Expected created/modified files (within `website/`):
  - `package.json`
  - `package-lock.json`
  - `vite.config.js`
  - `index.html`
  - `src/main.jsx`
  - `src/App.jsx`
  - `src/index.css`
  - `eslint.config.js`
  - Optional static assets in `public/` or `src/assets/`

No source files in `backend/` or existing `frontend/` need to change for this task.

## Data Model / API / Interface Changes
- Backend API: none.
- Persistence/data model: none.
- External integrations: none.
- Interface impact: adds a new standalone `website/` application folder only.

## Verification Approach
- Setup/install:
  - `cd website`
  - `npm install`
- Static checks:
  - `npm run lint`
  - `npm run build`
- Manual verification (`npm run dev`):
  - Confirm sections exist and are reachable in order: hero, how it works, why use, pricing.
  - Confirm `Inter` is applied globally.
  - Confirm responsive layout at mobile, tablet, desktop widths.
  - Confirm metadata is present in page source (`title`, `description`, Open Graph/Twitter, JSON-LD).
