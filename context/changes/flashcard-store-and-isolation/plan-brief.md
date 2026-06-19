# Minimal Per-User Flashcard Store with RLS Data Isolation — Plan Brief

> Full plan: `context/changes/flashcard-store-and-isolation/plan.md`

## What & Why

Create the foundational persistence layer (roadmap **F-01**) that every flashcard slice depends on: a single flat per-user `flashcards` table with row-level-security isolation, plus the shared types and a thin data-access service downstream slices reuse. It unblocks the north star (S-01 AI generation) by giving accepted cards somewhere to live, and bakes the two launch guardrails — user-data isolation and no-data-loss — into the store at design time.

## Starting Point

The database has no app tables (only Supabase Auth's `auth.users`); there is no `supabase/migrations/` directory, no `src/types.ts`, and no `src/lib/services/`. Auth and the cookie-scoped Supabase SSR client (`src/lib/supabase.ts`) are present and verified in production, so requests already carry a JWT that makes `auth.uid()`-based RLS work.

## Desired End State

A `public.flashcards` table exists with RLS enabled, four granular policies, integrity constraints, and an `updated_at` trigger; a signed-in user can read/write only their own cards (proven with a two-user test). `src/types.ts` and `src/lib/services/flashcards.ts` give downstream slices a typed, RLS-aware CRUD boundary, and lint/build/typecheck pass.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Dependency sequencing | Plan/ship F-01 before S-01 | S-01's save step depends on this store's table + RLS contract. | Plan |
| Origin tracking | `source` enum: ai-full / ai-edited / manual | Makes both success metrics (% via AI, acceptance quality) measurable from data at zero extra cost. | Plan |
| Isolation | Granular per-op policies + `user_id DEFAULT auth.uid()` | Matches CLAUDE.md's granular-policy rule; default makes forging another user's id impossible. | Plan |
| Access boundary | Thin typed service wrapping the Supabase client | One consistent RLS-aware access point; matches the services convention. | Plan |
| Integrity | NOT NULL + length CHECKs + `updated_at` trigger | Bad rows can't be written; edit timestamps are reliable without app effort. | Plan |
| Testing | Manual RLS verification + lint/build/typecheck | No test runner configured; not adding one in a foundation under the speed goal. | Plan |

## Scope

**In scope:** one `flashcards` table + RLS + constraints + trigger; `src/types.ts` entity/DTOs; `src/lib/services/flashcards.ts` CRUD.

**Out of scope:** SR/scheduling columns (S-05/OQ-1), decks/tags (PRD non-goal), any UI or API routes (consuming slices), source-text storage (OQ-4 / S-01), soft-delete (OQ-3 → hard delete), a test runner.

## Architecture / Approach

Bottom-up in two phases: prove the database contract first (table + RLS, isolation verifiable before any app code relies on it), then add the TypeScript layer that mirrors it. The service wraps the existing `createClient(...)` so each call carries the user's request-scoped JWT and RLS is always enforced; `src/types.ts` is the single source of truth both the service and slices import.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Database layer | Migration: table, `source` enum, constraints, 4 RLS policies, `updated_at` trigger | A wrong RLS policy leaks data silently — mitigated by the two-user manual test |
| 2. TypeScript layer | `src/types.ts` + `src/lib/services/flashcards.ts` typed CRUD | Type/column drift between DTOs and the table |

**Prerequisites:** Local Supabase (`npx supabase start`, Docker) for migration apply; auth already in place.
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- Assumes `auth.uid()` resolves for the authenticated SSR client (true given the verified cookie-auth flow) — confirmed by the insert-without-user_id test.
- Length cap of 1000 chars/side is a default; a downstream slice may need it raised (single-point change).
- Schema deliberately omits SR fields; S-05 will add them once OQ-1 is resolved (forward migration, no rework of these columns).

## Success Criteria (Summary)

- A user can persist and retrieve only their own cards across devices; cross-user access returns nothing (two-user test passes).
- The migration applies cleanly and lint/build/typecheck pass with the new types + service.
- Downstream slices have a typed CRUD boundary to build on.
