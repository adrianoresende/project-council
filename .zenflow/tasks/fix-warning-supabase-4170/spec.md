# Technical Specification: Fix Supabase RLS Function Re-Evaluation Warning

## Difficulty Assessment

- Level: Easy
- Rationale: The issue is a focused SQL policy optimization. It requires a small, low-risk edit to one existing RLS policy expression without changing table structure, API contracts, or application logic.

## Technical Context (language, dependencies)

- Database: Supabase Postgres with Row Level Security policies defined in SQL.
- Schema source of truth in this repo: `backend/supabase_schema.sql` (executed via Supabase SQL Editor per `README.md`).
- Current policy definition:
  - `conversations_owner_select` on `public.conversations` currently uses `auth.uid() = user_id`.
- Supabase recommendation for performance in RLS policy expressions:
  - Replace direct function calls like `auth.uid()` with `(select auth.uid())` so the value can be initialized once per statement rather than re-evaluated per row.

## Implementation Approach

1. Update the `conversations_owner_select` policy expression in `backend/supabase_schema.sql`.
- Change:
  - `using (auth.uid() = user_id);`
- To:
  - `using ((select auth.uid()) = user_id);`

2. Keep scope intentionally narrow to match the reported issue.
- Do not change policy names, policy roles, table grants, or non-targeted tables.
- Do not modify application code paths, only schema SQL used to create policies.

3. Apply the updated SQL to Supabase.
- Run the relevant SQL change in the Supabase SQL Editor (or deployment workflow used by the project) so the live policy matches repository state.

## Source Code Structure Changes

### Files to modify

- `backend/supabase_schema.sql`
  - Update `create policy conversations_owner_select` `using` clause.

### Files to create

- None.

## Data Model / API / Interface Changes

- Data model: No table/column/index changes.
- Backend API: No endpoint contract changes.
- Frontend interface: No changes.
- Security model: Authorization semantics remain the same; only function-call placement in the policy expression is optimized.

## Verification Approach

1. Repository-level validation
- Confirm the policy expression changed in `backend/supabase_schema.sql`:
  - `using ((select auth.uid()) = user_id);`

2. Database policy verification (Supabase SQL)
- After applying SQL, verify policy text from Postgres catalog:
  - `select policyname, qual from pg_policies where schemaname = 'public' and tablename = 'conversations' and policyname = 'conversations_owner_select';`
- Confirm `qual` reflects `(select auth.uid()) = user_id`.

3. Supabase advisor regression check
- Re-run the Supabase advisor/linter check that reported the warning.
- Expected result: warning for `public.conversations` / `conversations_owner_select` is cleared.

4. Project regression sanity checks
- Run backend tests to ensure no accidental regressions from schema change workflow:
  - `uv run python -m unittest`
- No frontend-specific verification is required for this task.
