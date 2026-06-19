# Minimal Per-User Flashcard Store with RLS Data Isolation — Implementation Plan

## Overview

Create the foundational persistence layer (roadmap **F-01**) that every flashcard slice depends on: a single flat per-user `flashcards` table in Supabase Postgres with row-level-security isolation, integrity constraints, and an `updated_at` trigger, plus the shared TypeScript types (`src/types.ts`) and a thin data-access service (`src/lib/services/flashcards.ts`) that downstream slices (S-01 AI generation, S-02 manual create, S-03 browse, S-04 edit/delete) use instead of touching the Supabase client directly.

This change unblocks the north star (S-01 `ai-card-generation`) by giving accepted cards somewhere to live, and it bakes the two launch guardrails — user-data isolation and no-data-loss — into the store at design time rather than bolting them on later.

## Current State Analysis

- **No app tables exist.** `supabase/` holds config only (`config.toml`, `.gitignore`); there is no `supabase/migrations/` directory and `schema_paths` is effectively empty. The only database schema in use is Supabase Auth's built-in `auth.users`.
- **No shared types.** `src/types.ts` does not exist; CLAUDE.md designates it as the home for shared entities/DTOs.
- **No services layer.** `src/lib/services/` does not exist; CLAUDE.md designates it as the home for extracted business logic.
- **Auth + Supabase SSR client are present and verified in production.** `src/lib/supabase.ts` exposes `createClient(requestHeaders, cookies)` returning a cookie-scoped `@supabase/ssr` server client (or `null` when secrets are unset). `src/middleware.ts` resolves `context.locals.user` every request and gates `PROTECTED_ROUTES`. The authenticated Supabase client carries the user's JWT, so `auth.uid()` resolves inside Postgres — this is what makes RLS-by-`auth.uid()` work.
- **No test runner is configured** (CLAUDE.md): there is no `test` script and no test files. Verification in this plan is limited to lint/build/typecheck and migration-apply for automation, with RLS isolation checked manually.
- **Runtime constraint:** the app runs on Cloudflare Workers (workerd). This phase is pure SQL + TypeScript types/service with no Node-specific APIs, so it carries none of the workerd-parity risk that the AI slice does.

### Key Discoveries:

- Authenticated data access already flows through `createClient(...)` in `src/lib/supabase.ts:5` — the service module wraps this same client so RLS applies automatically via the user's JWT.
- Migration naming convention is `YYYYMMDDHHmmss_short_description.sql` under `supabase/migrations/` (CLAUDE.md), and new tables must have RLS enabled with granular per-operation, per-role policies (CLAUDE.md).
- `auth.uid()` is available in Postgres for requests carrying a Supabase auth JWT; using it as the `user_id` column `DEFAULT` plus an RLS `WITH CHECK` makes it impossible for client code to write a row owned by another user.

## Desired End State

A developer can run the Supabase migration cleanly, and:

- A `public.flashcards` table exists with columns `id`, `user_id`, `front`, `back`, `source`, `created_at`, `updated_at`, RLS enabled, four granular policies, integrity constraints, and an `updated_at` trigger.
- A signed-in user (via the authenticated Supabase client) can insert, select, update, and delete **only their own** rows; attempts to read or write another user's rows return nothing / are rejected — verified manually with two users.
- `src/types.ts` exports a `Flashcard` entity type, a `FlashcardSource` union, and `CreateFlashcardCommand` / `UpdateFlashcardCommand` DTOs that match the table.
- `src/lib/services/flashcards.ts` exposes typed `createFlashcard`, `listFlashcards`, `getFlashcard`, `updateFlashcard`, `deleteFlashcard` functions that wrap the Supabase client and return typed results.
- `npm run lint`, `npm run build`, and the Astro type check pass with the new files in place.

## What We're NOT Doing

- **No spaced-repetition / scheduling columns** (e.g. due date, ease, interval). Deferred to S-05, which is blocked on OQ-1 (SR library choice); adding them now would guess the schema the library dictates.
- **No deck/folder/tag grouping** — PRD non-goal; the collection is a single flat per-user list.
- **No UI.** F-01 is a foundation; pages and React islands belong to S-01/S-02/S-03/S-04.
- **No source-text storage.** Pasted source text retention (OQ-4) is an S-01 concern and the default is not to persist it; this table stores cards only.
- **No API routes.** Endpoints that call the service belong to the consuming slices.
- **No test runner / automated test suite.** Not adding Vitest in this foundation; verification is manual + lint/build/typecheck.
- **No soft-delete / suspend** — OQ-3 commits MVP to hard delete; `deleteFlashcard` removes the row.

## Implementation Approach

Two phases, bottom-up: the database contract first (so isolation is provable before any app code can rely on it), then the TypeScript layer that mirrors that contract. The service module wraps the existing `createClient(...)` rather than introducing a new Supabase client, so the user's JWT — and therefore RLS — is always in force. Types in `src/types.ts` are the single source of truth that both the service and downstream slices import.

## Critical Implementation Details

- **`user_id` default + RLS WITH CHECK is the isolation mechanism.** `user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE`, combined with an INSERT policy `WITH CHECK (auth.uid() = user_id)`, means callers never pass `user_id` and cannot forge one. The service's create path must therefore omit `user_id` from the insert payload and let the column default populate it.
- **Policies are per-operation for the `authenticated` role only.** Separate `SELECT`, `INSERT`, `UPDATE`, `DELETE` policies (not one `FOR ALL`); the `anon` role gets no policy, so unauthenticated access returns nothing even though middleware already blocks protected routes — defense in depth.
- **`updated_at` is trigger-maintained**, not app-maintained, so S-04 edits get a correct timestamp regardless of which caller performs the update.

## Phase 1: Database layer (migration)

### Overview

Author the first Supabase migration: the `flashcards` table, its `source` enum, integrity constraints, RLS with four granular policies, and an `updated_at` trigger. Verify isolation manually with two users.

### Changes Required:

#### 1. Flashcards migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_flashcards.sql` (new; timestamp generated at authoring time)

**Intent**: Create the per-user flashcard store with isolation and integrity baked in, as the first app table in the database.

**Contract**:
- Enum/type for card origin: values `ai-full`, `ai-edited`, `manual` (a Postgres `enum` type, e.g. `flashcard_source`, or a `text` column with a `CHECK (source IN (...))` — implementer's choice, but the three values are the contract).
- Table `public.flashcards`:
  - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
  - `user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE`
  - `front text NOT NULL CHECK (char_length(trim(front)) > 0 AND char_length(front) <= 1000)`
  - `back text NOT NULL CHECK (char_length(trim(back)) > 0 AND char_length(back) <= 1000)`
  - `source <enum/text> NOT NULL`
  - `created_at timestamptz NOT NULL DEFAULT now()`
  - `updated_at timestamptz NOT NULL DEFAULT now()`
  - (length caps of 1000 are a sane default for Q/A cards; adjust if a downstream slice needs more — name the value in one place.)
- Index: `CREATE INDEX ON public.flashcards (user_id, created_at DESC)` to support per-user browse ordering (S-03).
- `ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;`
- Four policies for the `authenticated` role:
  - `SELECT` `USING (auth.uid() = user_id)`
  - `INSERT` `WITH CHECK (auth.uid() = user_id)`
  - `UPDATE` `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`
  - `DELETE` `USING (auth.uid() = user_id)`
- `updated_at` trigger: a `BEFORE UPDATE` trigger calling a function that sets `NEW.updated_at = now()`.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly against a local Supabase instance: `npx supabase db reset` (or `npx supabase migration up`) completes without error.
- The migration file exists under `supabase/migrations/` and matches the naming convention.

#### Manual Verification:

- With two distinct signed-in users, user A can insert and then select their own card; user B's select returns zero of user A's rows.
- User B cannot update or delete user A's card (operation affects 0 rows / is rejected).
- Inserting without supplying `user_id` populates it from `auth.uid()`.
- Empty or whitespace-only `front`/`back` is rejected by the CHECK constraint; updating a row bumps `updated_at`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the two-user isolation test succeeded before proceeding to Phase 2.

---

## Phase 2: TypeScript layer (types + service)

### Overview

Create the shared types that mirror the table and the thin data-access service that downstream slices use, wrapping the existing authenticated Supabase client so RLS is always in force.

### Changes Required:

#### 1. Shared types

**File**: `src/types.ts` (new)

**Intent**: Establish the single source of truth for the flashcard entity and the command DTOs that the service and all slices import.

**Contract**:
- `FlashcardSource` — union type `"ai-full" | "ai-edited" | "manual"`, matching the DB enum values exactly.
- `Flashcard` — entity matching table columns: `id: string`, `userId: string`, `front: string`, `back: string`, `source: FlashcardSource`, `createdAt: string`, `updatedAt: string`.
- `CreateFlashcardCommand` — `{ front: string; back: string; source: FlashcardSource }` (no `user_id` — populated by the DB default).
- `UpdateFlashcardCommand` — `{ front?: string; back?: string }` (origin and ownership are immutable post-create).

#### 2. Flashcards service

**File**: `src/lib/services/flashcards.ts` (new)

**Intent**: Provide the typed, RLS-aware data-access boundary every slice calls, so query and DTO-mapping logic lives in one place and the Supabase client is never used raw for cards.

**Contract**:
- Each function takes the authenticated Supabase client (the value returned by `createClient(...)` in `src/lib/supabase.ts`) as its first argument — the service does not construct its own client, so the caller's request-scoped JWT (and thus RLS) is preserved.
- Functions:
  - `createFlashcard(client, cmd: CreateFlashcardCommand): Promise<Flashcard>`
  - `listFlashcards(client): Promise<Flashcard[]>` (ordered by `created_at DESC`)
  - `getFlashcard(client, id: string): Promise<Flashcard | null>`
  - `updateFlashcard(client, id: string, cmd: UpdateFlashcardCommand): Promise<Flashcard>`
  - `deleteFlashcard(client, id: string): Promise<void>`
- Maps snake_case DB columns to the camelCase `Flashcard` shape; surfaces Supabase errors as thrown errors (callers/slices decide HTTP handling).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build` (Astro build runs `astro check`-level type checking) and/or `npx astro check`.
- Linting passes: `npm run lint`.
- Formatting passes: `npm run format` leaves no changes (or pre-commit lint-staged passes).

#### Manual Verification:

- A throwaway call to `createFlashcard` + `listFlashcards` from a temporary protected page/endpoint returns the created card with correct camelCase fields and the `source` value round-trips.
- Type errors surface if a `Flashcard` field is accessed that the DTO doesn't define (sanity that types mirror the table).

**Implementation Note**: After automated verification passes, pause for manual confirmation of the round-trip check before considering F-01 complete.

---

## Testing Strategy

No test runner is configured and none is added here. Verification relies on:

### Manual Testing Steps:

1. Apply the migration locally (`npx supabase db reset`) and confirm it succeeds.
2. Sign in as user A; insert a card via the service (temporary protected endpoint or Supabase Studio with A's session); confirm it appears in `listFlashcards`.
3. Sign in as user B; confirm B cannot see, update, or delete A's card.
4. Confirm `user_id` auto-populates from `auth.uid()` when omitted.
5. Confirm CHECK constraints reject empty/over-length `front`/`back`.
6. Update a card; confirm `updated_at` advances.

## Migration Notes

- This is the first migration in the project; it creates `supabase/migrations/`. There is no existing data to migrate.
- Rollback caveat (from `infrastructure.md`): Cloudflare `wrangler rollback` reverts code only, not Supabase schema. Forward-fix DB changes; do not rely on code rollback to undo a migration.

## References

- Roadmap item F-01: `context/foundation/roadmap.md`
- PRD (Access Control, Guardrails, NFR): `context/foundation/prd.md`
- Infrastructure constraints (workerd, secrets, rollback): `context/foundation/infrastructure.md`
- Existing Supabase client: `src/lib/supabase.ts:5`
- Auth/middleware pattern (where `auth.uid()` originates): `src/middleware.ts`
- Downstream consumer: `context/changes/ai-card-generation/change.md` (S-01)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database layer (migration)

#### Automated

- [x] 1.1 Migration applies cleanly against local Supabase (`supabase db reset` / `migration up`)
- [x] 1.2 Migration file exists under `supabase/migrations/` matching the naming convention

#### Manual

- [x] 1.3 Two-user isolation: A sees only A's rows; B's select returns zero of A's rows
- [x] 1.4 B cannot update or delete A's card (0 rows affected / rejected)
- [x] 1.5 Insert without `user_id` populates it from `auth.uid()`
- [x] 1.6 Empty/whitespace front/back rejected by CHECK; update bumps `updated_at`

### Phase 2: TypeScript layer (types + service)

#### Automated

- [ ] 2.1 Type checking passes (`npm run build` / `npx astro check`)
- [ ] 2.2 Linting passes (`npm run lint`)
- [ ] 2.3 Formatting passes (`npm run format` / lint-staged)

#### Manual

- [ ] 2.4 `createFlashcard` + `listFlashcards` round-trip returns correct camelCase fields and `source`
- [ ] 2.5 Type errors surface for fields not defined on the DTOs (types mirror the table)
