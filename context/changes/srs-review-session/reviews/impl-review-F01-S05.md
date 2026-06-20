<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: F-01, S-01, S-02, S-03, S-04, S-05 (stream review)

- **Plans**: context/changes/{flashcard-store-and-isolation, ai-card-generation, s-02, s-03, s-04, srs-review-session}/plan.md
- **Scope**: 6 changes, full plans (the F-01 → S-05 vertical stream)
- **Date**: 2026-06-20
- **Verdict**: NEEDS ATTENTION (tips to REJECTED if F1's remote migration cannot be confirmed)
- **Findings**: 1 critical, 2 warnings, 5 observations
- **Triage outcome**: Fixed 1 (F4) · Dismissed 1 (F3, false positive) · Skipped 6 (F1, F2, F5, F6, F7, F8)

## Per-change completion

| ID | Change | Progress | Status |
|----|--------|----------|--------|
| F-01 | flashcard-store-and-isolation | 12/12 | implemented |
| S-01 | ai-card-generation | 24/24 | implemented |
| S-02 | s-02 (manual-card-creation) | 12/14 | implemented (was `implementing` — fixed via F4) |
| S-03 | s-03 (browse-saved-cards) | 13/13 | implemented |
| S-04 | s-04 (edit-delete-cards) | 22/22 | implemented |
| S-05 | srs-review-session | 22/22 | implemented |

## Automated success criteria (run during review)

- `eslint .` — ✅ PASS (warnings only: astro-eslint-parser `projectService` notice)
- `astro build` — ✅ PASS

## Aggregate dimension verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | FAIL (F1) |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING (remote-push self-attested) |

## What was verified solid (no action)

- **RLS isolation**: every read/write/mutation path uses the request-scoped per-user Supabase client (no service-role bypass). F-01 has 4 granular policies scoped to `auth.uid()`; S-04 PATCH/DELETE and S-05 review endpoint are IDOR-safe (foreign id → 404, never mutates).
- **Secrets**: `OPENROUTER_API_KEY` only via `astro:env/server`; zero leakage into client bundles. `.env`/`.dev.vars` gitignored.
- **S-02 homogeneity**: manual-create payload identical to S-01's accept-save path (shared zod validator) — collection stays homogeneous.
- **S-05 FSRS**: grade 1-4 → Rating Again/Hard/Good/Easy; all 10 scheduling cols persisted; additive migration with safe defaults makes pre-existing cards reviewable; scheduler-core-only import is edge-safe.
- **Scope discipline**: every change respected its "What We're NOT Doing".

## Findings

### F1 — S-05 FSRS migration: remote push is checkbox-only, unverified

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; the lessons.md prod-500 class
- **Dimension**: Safety & Quality (PROJECT PRIOR: lessons.md migration rule)
- **Location**: context/changes/srs-review-session/plan.md:315 + supabase/migrations/20260620082044_add_fsrs_scheduling.sql
- **Detail**: The new FSRS migration (10 scheduling cols + `flashcards_user_id_due_idx`) is only evidenced by a checked box at commit 7d24fd1. Nothing in the repo confirms it reached the remote project, and CI (lint+build) never touches the DB. If the push was skipped/failed, every `/review` load and grade write 500s in prod — the exact F-01 incident captured in lessons.md.
- **Fix**: Confirm the schema is live on remote before treating S-05 as shipped — `npx supabase migration list` against the linked project (or `\d flashcards` in remote Studio). Attach the output to the change as durable evidence.
- **Decision**: SKIPPED — not fixed. User chose not to verify during triage. ⚠️ Still the single highest-impact open item; recommend an out-of-band remote check before trusting `/review` in production.

### F2 — F-01 plan has no remote migration-push step

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence / Process
- **Location**: context/changes/flashcard-store-and-isolation/plan.md (Progress)
- **Detail**: F-01's DB verification is local-only (`supabase db reset`); no remote-push step is encoded in the plan. Documented root cause of the past prod-500 incident now in lessons.md. The `flashcards` table is presumably live on remote today (later DB features work), so it's mostly a closed historical gap — but the plan artifact still doesn't reflect the rule.
- **Fix**: Confirm `create_flashcards` is on remote and add the explicit "push to remote" step so the plan matches the lessons.md rule (lesson already exists; no new one needed).
- **Decision**: SKIPPED — not fixed. Historical gap, already captured as a lesson.

### F3 — S-05 ts-fsrs version claim

- **Severity**: ⚠️ WARNING (as originally reported)
- **Impact**: 🔎 MEDIUM
- **Dimension**: Plan Adherence / Dependency hygiene
- **Location**: package.json:37 (`"ts-fsrs": "^5.4.1"`)
- **Detail (original claim)**: plan/research/change.md describe "ts-fsrs (FSRS v6)" while the installed package is 5.4.1 — alleged version mismatch.
- **Decision**: DISMISSED — **false positive, no edit made**. Verified that ts-fsrs **5.4.1** (the npm *package* version) implements the **FSRS v6 *algorithm*** — separate numbering schemes. Proof: installed default weights have **21 parameters** (FSRS-6; v4=17, v5=19, v6=21) and the package's own README badges it `FSRS-v6`. The docs saying "FSRS v6" are correct as written; applying the proposed "change docs to v5" fix would have introduced an error.

### F4 — S-02 change.md status is stale

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/s-02/change.md:5
- **Detail**: `status: implementing` but both phases are committed (fa93404, cf7148c, 1f0e422), all automated criteria pass, only two human-only manual checks remain (12/14).
- **Fix**: Advance status to `implemented` and bump `updated:`.
- **Decision**: ✅ FIXED — set `status: implemented` and `updated: 2026-06-20` in context/changes/s-02/change.md.

### F5 — S-01 OpenRouter fetch has no timeout/AbortController

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/openrouter.ts:35
- **Detail**: A hung provider connection rides the platform timeout instead of failing clean. Plan listed this as an accepted risk.
- **Fix**: Add `AbortSignal.timeout(...)` to the fetch so a stalled provider maps to a clean 502.
- **Decision**: SKIPPED — not fixed. Plan already accepted this risk.

### F6 — F-01 set_updated_at() has a mutable search_path

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260619185620_create_flashcards.sql:56
- **Detail**: Trigger function doesn't pin `search_path`; Supabase linter flags `function_search_path_mutable`. Low risk (body only calls `now()`). A fix means a NEW migration that recreates the function (the original is already applied).
- **Fix**: Add `set search_path = ''` to the function definition via a new migration.
- **Decision**: SKIPPED — not fixed. Negligible risk; not worth a new migration now.

### F7 — S-04 client collapses 404 into a generic retry message

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: src/components/cards/CardList.tsx:44
- **Detail**: PATCH/DELETE 404 (e.g. card deleted in another tab) shows "Try again" and keeps a stale row. Rare concurrent-edit UX nit; not a data-safety issue.
- **Fix**: Branch on `res.status === 404` to drop/refresh the row with a clearer message.
- **Decision**: SKIPPED — not fixed. Rare single-user path at MVP scale.

### F8 — S-01 OPENROUTER_MODEL declared access: "secret"

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Adherence
- **Location**: astro.config.mjs:22
- **Detail**: The model id isn't sensitive; plan specified `access: "secret"` so the code followed the plan. Stays server-only either way via `context: "server"`; never reaches the client bundle. **Zero end-user impact, zero security impact** — purely a config-semantics nit.
- **Fix**: Change `OPENROUTER_MODEL` to `access: "public"`. No behavior change.
- **Decision**: SKIPPED — not fixed. No consequence for the end-user.

## Open items carried forward

1. **F1 (CRITICAL)** — verify the FSRS migration is on the remote/production Supabase project before relying on `/review`. This is the only finding that can take down a user-facing feature.
2. **F2 (WARNING)** — confirm `create_flashcards` is on remote and encode the remote-push step in F-01's plan.
