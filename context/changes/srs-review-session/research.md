---
change_id: srs-review-session
type: external-research + internal-codebase-research
topic: Spaced-repetition library selection (resolves roadmap OQ-1) + ts-fsrs codebase compatibility for S-05
created: 2026-06-20
source: exa.ai web search (web_search_exa)
last_updated: 2026-06-20
last_updated_by: lukaszblonski
last_updated_note: "Added internal codebase research — ts-fsrs compatibility verdict for S-05 (git eedda6b, branch master)"
---

# SR Library Research — S-05 (srs-review-session)

> External research to resolve roadmap **OQ-1: "Which ready-made spaced-repetition algorithm/library?"** — the single decision blocking S-05.
> Filtered for the project stack: TypeScript, Astro SSR + React islands, Supabase Postgres, **Cloudflare Workers edge runtime**, solo MVP, `main_goal: speed`.

## The decision: FSRS vs SM-2

Two algorithm families dominate the JS ecosystem; both are "ready-made" (satisfies the PRD non-goal of not building a custom scheduler):

- **FSRS** (Free Spaced Repetition Scheduler) — modern, open-weights, ~80% lower error than SM-2 on the 1.7B-review Anki benchmark. Current Anki default.
- **SM-2** — classic 1990 SuperMemo algorithm. Simpler, fully auditable, no training data, but a weaker forgetting model.

## Candidate libraries

| Library | Algo | License | Deps | Edge-ready? | Notes |
|---|---|---|---|---|---|
| **`ts-fsrs`** | FSRS v6 | MIT | **0** | ✅ (core is pure TS) | De-facto standard. ~63.5K weekly downloads, actively maintained, TS-native, strong docs. `repeat()`/`next()` maps cleanly to a review flow. |
| `@squeakyrobot/fsrs` | FSRS v4.5 (+v6) | — | 0 | ✅ explicitly "Cloudflare/Vercel Edge ready" | Pure functions, immutable, smaller surface than ts-fsrs. |
| `quanta-fsrs` | FSRS v4.5/5 | — | 0 | ✅ Workers/Vercel | Production-used, but weights tuned for STEM ("MINT") content — inherited bias. |
| `srs-everything` | FSRS | — | — | ESM | Adds queue mgmt, interleaving, postpone — more than MVP needs. |
| `@open-spaced-repetition/...spaced-repetition` | SM-2 | — | 0 | ✅ | ~95 lines, one pure function. Pick only if simplest/auditable is the explicit goal. |
| `fsrs.js` | FSRS | — | — | ✅ | **Deprecated** by its own authors → use ts-fsrs instead. |

## Recommendation: `ts-fsrs`

Best fit on every axis that matters here:

- **Zero deps + pure TS scheduler** → runs on the Cloudflare Workers edge runtime (the one hard stack constraint).
- **TypeScript-native, recommends Zod** for validating persisted parameters — matches the project "validate boundaries with zod" convention.
- **MIT, actively maintained, ~63.5K weekly downloads** — lowest-risk for a solo speed-focused build.
- **Best retention accuracy** — directly serves the product's core bet.

### ⚠️ Caveat to verify in planning (phase 1 edge smoke test)
- npm package states `requires Node >=20`, and the **`@open-spaced-repetition/binding` optimizer is Rust/WASM**. The optimizer is **not needed for MVP**. The *scheduler core* (`fsrs()`, `repeat`, `next`, `Rating`) is plain math used in browsers, so it should run on Workers — confirm with a quick edge smoke test before committing.

## What this resolves for the roadmap (OQ-1)

Picking `ts-fsrs` answers the two things OQ-1 flagged as blocking:

1. **Per-card scheduling state F-01 must store** — an FSRS `Card`: `due`, `stability`, `difficulty`, `elapsed_days`, `scheduled_days`, `reps`, `lapses`, `state` (New/Learning/Review/Relearning), `last_review`. → columns (or a JSONB blob) on the flashcard table.
2. **Grade-scale shape FR-011 exposes** — FSRS `Rating`: `Again(1) / Hard(2) / Good(3) / Easy(4)` — the four review buttons the UI needs.

## Simpler fallback

If shipping the absolute minimum matters more than scheduling quality, the SM-2 package needs only `{ interval, repetitions, easeFactor, due }` + a 0–5 grade — fewer F-01 columns, weaker scheduling.

## Open dependencies (not resolved by this research)

- S-05 also requires **S-01** (its other prerequisite) to exist before it can ship.

## Reference

- `ts-fsrs`: https://github.com/open-spaced-repetition/ts-fsrs — https://www.npmjs.com/package/ts-fsrs
- Docs: https://open-spaced-repetition.github.io/ts-fsrs/
- FSRS vs SM-2 benchmark (fsrs-benchmark, 1.7B reviews): FSRS v4.5 ~81% improvement over SM-2 (RMSE), v6 ~84%.

---

## Follow-up Research: ts-fsrs ↔ codebase compatibility (2026-06-20, internal)

> **Question:** Is [`ts-fsrs-api-docs.md`](./ts-fsrs-api-docs.md) compatible with our codebase, so we can implement **S-05** (review session)?
> **Method:** fresh parallel codebase research at git `eedda6b` (branch `master`) across 4 dimensions: schema/data, runtime/edge, service+API, UI/islands.
> **Researcher:** lukaszblonski · **Repo:** 10xcards (`Luke213-app/10xcards`)

### Verdict — ✅ COMPATIBLE

ts-fsrs drops into the existing architecture with **no architectural mismatch**. Every layer S-05 needs has a directly reusable template already in the repo. The work is additive: **one DB migration + a small set of new files following existing patterns**. There is no blocker — only a known, well-scoped set of friction points (below).

**Prerequisites are met (roadmap baseline is stale).** The roadmap lists S-05 as `blocked` and "Data: absent", but the codebase has moved well past that: F-01 (`flashcards` table + RLS), S-01 (`/api/generate` + OpenRouter), S-02, S-03, S-04 are all implemented. So S-05's prerequisites **F-01 + S-01 are satisfied**, and picking ts-fsrs resolves **OQ-1**. S-05 is effectively unblocked.

### Risk 1 — Schema / data migration: **needs a migration, but clean**

- Current table `supabase/migrations/20260619185620_create_flashcards.sql` has only: `id, user_id, front, back, source, created_at, updated_at`. **All 10 ts-fsrs scheduling fields are MISSING** (confirmed by grep — no `due`/`stability`/`difficulty`/etc. anywhere).
- **Action:** new timestamped migration adding the 10 columns. Give defaults so existing rows become immediately reviewable — `state` default `0` (New), `due` default `now()`, `last_review` nullable, counters default `0`, `stability/difficulty` default `0`. `state` and `learning_steps` are **numeric** in ts-fsrs (store as `smallint`/`int`, not a Postgres enum, to match the library's numeric enum).
- **RLS extends for free.** Ownership is enforced by `user_id` (default `auth.uid()`) + per-operation `authenticated`-role policies (`migrations/...sql:27-53`). New columns inherit it — **no policy changes needed**.
- **Index gap.** Existing index is `(user_id, created_at DESC)` (browse). The due-queue query `where user_id = auth.uid() and due <= now() order by due` wants a new `flashcards_user_id_due_idx (user_id, due)`.
- **`src/db/database.types.ts` is hand-maintained** (lines 23-52), not auto-generated in CI — its `Row/Insert/Update` for `flashcards` must be extended by hand (or via `supabase gen types`) or `toFlashcard` won't typecheck.
- ⚠️ **Lessons.md rule applies:** the F-01 migration was only run locally → `public.flashcards` never existed on the remote project → **500s in production**. The S-05 plan MUST include an explicit "`supabase db push` to the remote project" deploy step. DB "done" ≠ "works locally".

### Risk 2 — Edge runtime (workerd): **resolved, no blocker**

- ts-fsrs is **not yet installed** (`npm install ts-fsrs` needed).
- Verified against the published `dist` bundle: `"type": "module"` (pure ESM), **zero runtime dependencies**, and **no Node-only APIs** (`node:fs`/`crypto`/`Buffer`/`process`/`__dirname` — none present). Scheduler core (`fsrs()`, `repeat()`, `next()`, `createEmptyCard()`, `TypeConvert.card()`) is pure arithmetic over `Date`/numbers.
- This **resolves the external-research caveat** above: the Rust/WASM optimizer is a *separate* package not needed for MVP; the scheduler core is workerd-safe. The `engines.node>=20` field is advisory tooling metadata, not a runtime gate.
- Mirrors the existing edge pattern: `src/lib/services/openrouter.ts` (framework-agnostic, Web-standard `fetch` only) called from `src/pages/api/generate.ts` (`prerender = false`, `context.locals.user` gate, zod). One-line fallback if the SSR build ever externalizes it: add `"ts-fsrs"` to `vite.ssr.noExternal` in `astro.config.mjs`. Scheduling math is trivial — no long-task/edge-timeout concern (unlike AI generation).

### Risk 3 — Service / API + type mapping: **fits conventions; one net-new mapper**

- `src/lib/services/flashcards.ts`: DI of the RLS-scoped Supabase client; **single `toFlashcard()` snake_case→camelCase mapper** (lines 18-28); `.maybeSingle()`/length-check to turn RLS-hidden rows into 404 (not 500). Add `gradeFlashcard(client, id, rating)` and `listDueFlashcards(client)` following `updateFlashcard`/`listFlashcards`.
- API routes (`api/flashcards.ts`, `api/flashcards/[id].ts`) are a rigid copy-paste template: `prerender=false` → 401 unauth → 503 unconfigured → 404 missing id → 400 bad JSON / `safeParse` → service call → 500 catch; success returns `{ flashcard }`. New route `src/pages/api/flashcards/[id]/review.ts` copies this; body = `{ rating: 1|2|3|4 }` validated by a dedicated `gradeSchema`.
- **Friction (small, expected):**
  - `toFlashcard` grows from ~7 to ~17 fields.
  - **A second, net-new inverse mapper** is needed: ts-fsrs `next().card` returns snake_case + **`Date` objects** → serialize `due`/`last_review` to ISO/timestamptz on write. Keep DTOs as **`string`**, not `Date`, to match the existing `Flashcard` convention (`CardList` already does `new Date(iso)` at render).
  - Only scheduling columns may change on grade — `source`/`front`/`back` are immutable post-create; use a dedicated `gradeSchema`, not `updateFlashcardSchema`.
  - New types in `src/types.ts`: `GradeCommand` + either extend `Flashcard` with the 10 fields or add a narrower `ReviewCard` DTO (smaller blast radius).

### Risk 4 — UI / islands / routing: **fits cleanly, two existing precedents**

- **SSR-seed the due queue** into the island via a prop (the `CardList.tsx` model: page fetches RLS-scoped, passes `cards` → `useState`), and **fetch-on-grade** per card (the `GenerateView.tsx` model: client `fetch` on user action). Plain `useState`, shadcn `Button` + lucide, `cn()`.
- New `src/pages/review/index.astro` copies `cards/index.astro` (read `Astro.locals.user`, `createClient`, `configured` branch, mount island `client:load`). New island `src/components/review/ReviewSession.tsx`.
- Gate it: add `"/review"` to `PROTECTED_ROUTES` in `src/middleware.ts:4` (page gate; API route self-checks `context.locals.user`).
- Add nav link in `src/components/Topbar.astro` and the page headers (mirror existing "My cards"/"Generate" anchors).

### Files a plan will touch
- **New:** `supabase/migrations/<ts>_add_fsrs_scheduling.sql`, `src/pages/api/flashcards/[id]/review.ts`, `src/pages/review/index.astro`, `src/components/review/ReviewSession.tsx`
- **Edit:** `src/lib/services/flashcards.ts` (mappers + `gradeFlashcard` + `listDueFlashcards`), `src/lib/schemas/flashcards.ts` (`gradeSchema`), `src/types.ts` (`GradeCommand`/scheduling fields), `src/db/database.types.ts` (extend `flashcards` Row/Insert/Update), `src/middleware.ts` (`/review`), `src/components/Topbar.astro` + page headers (nav)
- **Install:** `ts-fsrs`

### Open questions for planning
1. **Store as columns or JSONB?** External research floated a JSONB blob. Columns win here — the due-queue query filters/orders on `due`, which needs a real indexed column (JSONB would need an expression index). Recommend dedicated columns.
2. **`repeat()` preview in the UI?** FR-010 button labels ("next due in X") can show ts-fsrs `repeat()` previews; decide whether to compute server-side and send with the due card, or skip for MVP (grade-only).
3. **Session scope** — surface all due cards in one session, or cap per session? Roadmap implies a flat "due now" queue; confirm during planning.
4. **Backfill existing cards** — defaults make all current cards immediately due in `New` state; confirm that's the desired first-session behavior.
