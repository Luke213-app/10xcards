# Spaced-Repetition Review Session (S-05) Implementation Plan

## Overview

Add the spaced-repetition review session — the last core MVP feature. Users open `/review`, see their due cards one at a time, recall the answer (flip-then-grade), pick a grade (Again / Hard / Good / Easy), and the card is rescheduled by the FSRS algorithm via the [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs) library. This resolves roadmap **OQ-1** (which SR library) by adopting `ts-fsrs`, and delivers **FR-010** (interval preview on grade buttons) and **FR-011** (1–4 grade scale).

The work is **additive**: one DB migration adds per-card scheduling state, and a small set of new files (service functions, one API route, one page, one island) follow templates that already exist in the repo.

## Current State Analysis

The codebase has moved well past the roadmap's stale "S-05 blocked / Data absent" baseline. Both prerequisites are shipped:

- **F-01** — `public.flashcards` table + per-user RLS (`supabase/migrations/20260619185620_create_flashcards.sql`). Columns today: `id, user_id, front, back, source, created_at, updated_at`. **None of the 10 ts-fsrs scheduling fields exist.**
- **S-01..S-04** — generation (`/api/generate` + OpenRouter), single-card CRUD API, `/cards` browse page with the interactive `CardList` island.

Key constraints discovered:

- **`src/db/database.types.ts` is hand-maintained** (lines 23–52), not generated in CI — its `flashcards` `Row`/`Insert`/`Update` must be extended by hand or `toFlashcard` won't typecheck.
- **Edge runtime (Cloudflare workerd)** — research verified `ts-fsrs`'s scheduler core (`fsrs()`, `repeat()`, `next()`, `createEmptyCard()`, `TypeConvert.card()`) is pure ESM, zero deps, no Node-only APIs. The Rust/WASM optimizer is a separate package and **not used**. `engines.node>=20` is advisory tooling metadata, not a runtime gate.
- **Migration-to-remote gap (`lessons.md`)** — F-01's migration was only applied locally, so `public.flashcards` never existed on the remote project → 500s in production. **This plan MUST include an explicit `supabase db push` step.** DB "done" ≠ "works locally".
- **Service convention** — `src/lib/services/flashcards.ts` takes the RLS-scoped client (DI), maps snake_case→camelCase via `toFlashcard`, and uses `.maybeSingle()` / length-checks so RLS-hidden rows surface as 404 (not a thrown 500).
- **Route template** — `api/flashcards.ts` and `api/flashcards/[id].ts` follow a rigid shape: `prerender=false` → 401 unauth → 503 unconfigured → 404 missing id → 400 bad JSON / `safeParse` → service call → 500 catch; success returns `{ flashcard }`.
- **Island patterns** — `CardList.tsx` is SSR-seeded via a prop into `useState`; `GenerateView.tsx` does client `fetch` on user action with per-item `saving`/`error`. Both use `useState`, shadcn `Button`, lucide icons, `cn()`.
- **Nav reality** — the "My cards" / "Generate" / "Dashboard" cross-links live in **page headers** (e.g. `src/pages/cards/index.astro:30-34`), not in `Topbar.astro` (which carries only Dashboard + Sign out). Nav wiring for `/review` targets the page headers.

## Desired End State

A signed-in user with due cards can:

1. Click a **"Review"** link (from `/cards`, `/generate`, `/dashboard` headers) and land on `/review`.
2. See the count of due cards and the first card's **front**; click **Show answer** to reveal the back.
3. Pick one of four grades, each labelled with its next-due interval (e.g. "Good · 3d"); the card is rescheduled server-side and the next due card appears.
4. On finishing the queue, see a **"Session complete — N reviewed"** state with a link back to `/cards`.
5. When nothing is due, see a server-rendered **"You're all caught up"** state.

Existing cards are all immediately reviewable in `New` state on the first session (migration defaults).

Verify: `npm run build` + `npm run lint` pass; migration applies locally **and is pushed to remote**; manual walkthrough of the review loop against the deployed app.

### Key Discoveries:

- ts-fsrs review loop is 4 calls: `createEmptyCard()`, `repeat(card, now)` (preview, no commit), `next(card, now, grade)` → `{ card, log }` (commit), `TypeConvert.card(row)` (normalize a DB row). (`ts-fsrs-api-docs.md`)
- `next()` returns a card with **native `Date`** objects and **numeric** `state` — must serialize `due`/`last_review` to ISO on write. (`research.md` Risk 3)
- Due-queue query: `where user_id = auth.uid() and due <= now() order by due` — needs the new `(user_id, due)` index. (`ts-fsrs-api-docs.md`, `research.md` Risk 1)
- `state` and `learning_steps` are **numeric** enums in ts-fsrs → store as `smallint`/`int`, not a Postgres enum. (`research.md` Risk 1)
- RLS extends to new columns for free — no policy changes. (`research.md` Risk 1)

## What We're NOT Doing

- **No custom scheduler** — `ts-fsrs` owns all scheduling math (PRD non-goal).
- **No FSRS optimizer / parameter tuning** — the Rust/WASM optimizer package is not installed; we use default FSRS parameters.
- **No client-side ts-fsrs** — the scheduler stays server-side; previews are computed at queue-load and sent down.
- **No session cap / pagination** — flat "due now" queue (matches roadmap).
- **No near-future / early review** — strictly `due <= now()`.
- **No type-the-answer checking** — flip-then-grade only.
- **No edits to existing card flows** — `Flashcard`, `CardList`, generate/manual paths stay untouched (narrow `ReviewCard` DTO isolates scheduling fields).
- **No review-log persistence** — the `next().log` history entry is discarded for MVP (only the updated card is written). A `review_logs` table is out of scope.
- **No backfill script** — migration defaults make existing cards due-as-New.

## Implementation Approach

Bottom-up in three phases: (1) get scheduling state into the schema and the type layer, (2) build the service + API layer that reads the due queue and commits grades, (3) build the page + island and wire navigation. Each layer copies an existing in-repo template, so the risk is in the data round-trip (Date↔ISO, numeric state) and the remote migration push — both called out explicitly below.

## Critical Implementation Details

- **Date / numeric round-trip (the one real gotcha).** ts-fsrs `next().card` returns `due`/`last_review` as `Date` and `state`/`learning_steps` as numbers. On write, serialize Dates to ISO strings (timestamptz). On read, the DB row already has ISO strings and numeric state, which `repeat()`/`next()` accept directly as `CardInput`; pass the row through `TypeConvert.card()` before calling the scheduler to be safe. DTOs to the client keep dates as **`string`** (the existing `Flashcard` convention — `CardList` does `new Date(iso)` at render).
- **Migration must reach remote.** Per `lessons.md`, the phase is not "done" until `supabase db push` has applied it to the remote project. Local `supabase db reset` alone reproduces the F-01 production-500 bug.
- **Grade is not an update of front/back.** Only scheduling columns change on grade; `source`/`front`/`back` are immutable post-create. Use a dedicated `gradeSchema` (not `updateFlashcardSchema`) and a dedicated `gradeFlashcard` service function.

## Phase 1: Schema + Type Foundation

### Overview

Install `ts-fsrs`, add the 10 scheduling columns + due-queue index via migration, and extend the hand-maintained type layer so the rest of the plan typechecks. Confirm the library imports/runs on the dev (workerd) runtime, then push the migration to remote.

### Changes Required:

#### 1. Install the library

**File**: `package.json` (+ lockfile)

**Intent**: Add `ts-fsrs` as a runtime dependency.

**Contract**: `npm install ts-fsrs`. Fallback only if the SSR build externalizes it and fails on the edge: add `"ts-fsrs"` to `vite.ssr.noExternal` in `astro.config.mjs`.

#### 2. Scheduling-state migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_add_fsrs_scheduling.sql`

**Intent**: Add the 10 ts-fsrs scheduling fields to `public.flashcards` with defaults that make every existing row immediately reviewable in `New` state, plus the index the due-queue query needs.

**Contract**: `ALTER TABLE public.flashcards ADD COLUMN` for:
- `due timestamptz not null default now()`
- `stability double precision not null default 0`
- `difficulty double precision not null default 0`
- `elapsed_days integer not null default 0`
- `scheduled_days integer not null default 0`
- `learning_steps integer not null default 0`
- `reps integer not null default 0`
- `lapses integer not null default 0`
- `state smallint not null default 0` (New=0, Learning=1, Review=2, Relearning=3)
- `last_review timestamptz` (nullable; null = never reviewed)

Plus: `create index flashcards_user_id_due_idx on public.flashcards (user_id, due);`

No RLS policy changes (new columns inherit existing per-operation `authenticated` policies). Do **not** create a Postgres enum for `state`/`learning_steps` — keep them numeric to match ts-fsrs.

#### 3. Extend the hand-maintained DB types

**File**: `src/db/database.types.ts`

**Intent**: Add the 10 columns to `flashcards` `Row` / `Insert` / `Update` so the typed client and `toFlashcard` see them.

**Contract**: In `Row`, all 10 fields non-optional (`last_review: string | null`, `state: number`, the floats/ints as `number`, `due: string`). In `Insert`/`Update`, all 10 optional (they have defaults). Mirror the snake_case column names exactly.

#### 4. Review DTOs and command types

**File**: `src/types.ts`

**Intent**: Add the review-path types without touching the existing `Flashcard` interface (narrow-DTO decision).

**Contract**:
- `ReviewCard` — `{ id: string; front: string; back: string }` + the scheduling fields the client needs as DTO (`due: string`, `state: number`, plus whatever the island renders) + `previews: GradePreviews` (the four next-interval previews, see Phase 2).
- `GradeCommand` — `{ rating: 1 | 2 | 3 | 4 }`.
- `GradePreviews` — a map from each rating (1–4) to its preview interval label/`due` (e.g. `{ 1: { due: string; label: string }, ... }`). Keep dates as `string`.

### Success Criteria:

#### Automated Verification:

- [ ] Migration applies cleanly locally: `npx supabase db reset` (or `supabase migration up`)
- [ ] Type checking / build passes: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- [ ] `npm run dev` boots and a trivial server-side `import { fsrs, createEmptyCard } from "ts-fsrs"` (e.g. in a scratch API route or the service) runs without a workerd/runtime error — confirms the edge smoke test
- [ ] Migration pushed to the remote project: `npx supabase db push` (NOT optional — see `lessons.md`)
- [ ] Remote `flashcards` table shows the 10 new columns (Supabase Studio / `\d flashcards`)

**Implementation Note**: After automated verification passes, pause for manual confirmation — especially that `supabase db push` reached remote — before proceeding to Phase 2.

---

## Phase 2: Service + API Layer

### Overview

Add the data-access functions that read the due queue (with server-computed interval previews) and commit a grade (running `next()` and persisting the rescheduled card), the validation schema, and the review endpoint — all following existing conventions.

### Changes Required:

#### 1. Due-queue + grade service functions

**File**: `src/lib/services/flashcards.ts`

**Intent**: Add `listDueFlashcards` (read due cards, compute `repeat()` previews, return `ReviewCard[]`) and `gradeFlashcard` (load card, run `next()`, persist scheduling fields, return updated state or `null` for 404). Add a scheduling-aware row→DTO mapper and an inverse card→row serializer.

**Contract**:
- `listDueFlashcards(client): Promise<ReviewCard[]>` — query `.from("flashcards").select().lte("due", <nowISO>).order("due")` (RLS scopes to the user). For each row, compute `repeat(TypeConvert.card(row), now)` to derive the four-grade previews, and map to `ReviewCard` (dates as ISO strings).
- `gradeFlashcard(client, id, rating): Promise<ReviewCard | null>` — load the row with `.eq("id", id).maybeSingle()` (→ `null` → 404 if missing/not-owned); compute `next(TypeConvert.card(row), now, rating).card`; serialize its `Date` fields to ISO; `.update(schedulingPatch).eq("id", id).select().maybeSingle()`; return the mapped `ReviewCard` or `null`.
- A `toReviewCard(row)` mapper (scheduling-aware) and a `toSchedulingRow(card)` inverse serializer (Date→ISO, numeric state). The existing `toFlashcard` is **unchanged**.
- `now` is `new Date()` at call time; format due/last_review with `.toISOString()`.

#### 2. Grade validation schema

**File**: `src/lib/schemas/flashcards.ts`

**Intent**: Validate the review request body — exactly a rating of 1–4.

**Contract**: `gradeSchema = z.object({ rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]) })` (or `z.number().int().min(1).max(4)`). Separate from `updateFlashcardSchema`. Maps to ts-fsrs `Rating` Again(1)/Hard(2)/Good(3)/Easy(4); `Manual=0` is never accepted.

#### 3. Review API route

**File**: `src/pages/api/flashcards/[id]/review.ts`

**Intent**: Commit a grade for one card, copying the rigid route template exactly.

**Contract**: `export const prerender = false`. `POST` handler: 401 if no `context.locals.user` → 503 if `createClient` null → 404 if no `id` → 400 on bad JSON → `gradeSchema.safeParse` (400 on failure) → `gradeFlashcard(supabase, id, parsed.data.rating)` → `null` ⇒ 404 → success returns `{ flashcard }` (the updated `ReviewCard`) at 200 → `catch` ⇒ 500. Reuse the same `json()` helper shape.

### Success Criteria:

#### Automated Verification:

- [ ] Build passes: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- [ ] `POST /api/flashcards/<id>/review` with `{ "rating": 3 }` (authenticated) returns 200 with the updated card whose `due` has advanced
- [ ] Same request unauthenticated returns 401; a non-existent / other-user id returns 404; `{ "rating": 0 }` or `{ "rating": 5 }` returns 400
- [ ] The graded card's `due`/`reps`/`state` are persisted (re-querying shows the new schedule)

**Implementation Note**: After automated verification passes, pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Review Page, Island & Navigation

### Overview

Build the `/review` page (SSR-seeds the due queue, handles the empty state), the `ReviewSession` island (flip-then-grade loop with interval previews and a completion state), gate the route, and add nav links.

### Changes Required:

#### 1. Review page

**File**: `src/pages/review/index.astro`

**Intent**: Server-render the due queue and mount the island; show a "caught up" state when nothing is due. Mirrors `cards/index.astro`.

**Contract**: Read `Astro.locals.user`; `createClient(...)`; `configured = supabase !== null`; `dueCards = supabase ? await listDueFlashcards(supabase) : []`. Branch: not configured → error panel; `dueCards.length === 0` → "You're all caught up" empty state (mirror the `cards/index.astro` empty-state markup); else `<ReviewSession cards={dueCards} client:load />`. Page header carries the same nav anchors plus the title, matching the cosmic layout.

#### 2. Review session island

**File**: `src/components/review/ReviewSession.tsx`

**Intent**: Drive the one-card-at-a-time review loop: show front → reveal back → grade (with interval previews) → advance; show completion summary at the end. Mirrors `CardList`/`GenerateView` state patterns.

**Contract**: Props `{ cards: ReviewCard[] }`. State: current index, `revealed: boolean`, per-card `grading`/`error`. Render the current card's front; a **Show answer** button toggles `revealed`; once revealed, four grade buttons (Again/Hard/Good/Easy) each labelled with `card.previews[rating]` interval. On grade: `fetch("/api/flashcards/<id>/review", { method: "POST", body: { rating } })`; on success advance index + reset `revealed`; on failure show inline error + allow retry (mirror `CardList`'s per-item error). Show a progress indicator ("N of M"). When the last card is graded, render a **"Session complete — N reviewed"** card with a link to `/cards`. Use `useState`, shadcn `Button`, lucide icons, `cn()`. No client-side ts-fsrs import.

#### 3. Gate the route

**File**: `src/middleware.ts`

**Intent**: Protect `/review` like the other authed pages.

**Contract**: Add `"/review"` to `PROTECTED_ROUTES` (line 4). The API route self-checks `context.locals.user` independently.

#### 4. Navigation links

**Files**: page headers — `src/pages/cards/index.astro`, `src/pages/generate/index.astro`, `src/pages/dashboard/*` (wherever the cross-links live)

**Intent**: Add a "Review" anchor alongside the existing "My cards" / "Generate" / "Dashboard" links so users can reach the session. (Header anchors, not `Topbar.astro`.)

**Contract**: `<a href="/review" class="text-sm text-purple-300 hover:underline">Review</a>` mirroring the existing anchor styling in each header.

### Success Criteria:

#### Automated Verification:

- [ ] Build passes: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- [ ] Visiting `/review` while signed out redirects to `/auth/signin`
- [ ] With due cards: front shows first, "Show answer" reveals the back, grade buttons show interval previews, grading advances to the next card
- [ ] Grading the last card shows the "Session complete — N reviewed" state with a working link to `/cards`
- [ ] With no due cards, `/review` shows the "You're all caught up" state
- [ ] A graded card's new `due` is respected on a fresh `/review` load (it no longer appears if not yet due)
- [ ] "Review" nav link appears and works from `/cards`, `/generate`, and the dashboard

**Implementation Note**: After automated verification passes, pause for final manual confirmation. This completes S-05.

---

## Testing Strategy

No test runner is configured in this repo (per `CLAUDE.md`), so verification is build + lint + manual. If a runner is added later, prioritize:

### Unit Tests:

- `toReviewCard` / `toSchedulingRow` round-trip: ISO↔Date and numeric `state` survive a write→read cycle.
- `gradeSchema` accepts 1–4, rejects 0/5/non-int.

### Integration Tests:

- `gradeFlashcard` advances `due`/`reps`/`state` for the four ratings; returns `null` for a missing/not-owned id.
- `listDueFlashcards` returns only `due <= now()` rows, ordered by `due`, with previews attached.

### Manual Testing Steps:

1. Create/generate several cards; visit `/review` — all appear due (New).
2. Reveal + grade a card "Again" → it should reappear soon; grade another "Easy" → longer interval.
3. Exhaust the queue → completion state; reload → "caught up".
4. Sign out → `/review` redirects to sign-in.
5. Repeat against the **deployed** app to confirm the remote migration is live (no 500s).

## Performance Considerations

Scheduling math is trivial (pure arithmetic), so no edge-timeout concern (unlike AI generation). The due-queue query is indexed by `(user_id, due)`. Previews are computed once at queue load (one `repeat()` per due card) — negligible. Flat queue means a very large backlog loads all rows at once; acceptable at MVP volumes, and a session cap is a clean future addition if needed.

## Migration Notes

- The migration is **additive with defaults**, so existing rows become immediately reviewable (`New`, `due=now()`) — no data backfill needed.
- **Remote push is mandatory** (`lessons.md`): apply via `npx supabase db push` as part of Phase 1's deploy, not just `supabase db reset` locally.
- Rollback: drop the 10 columns + the `flashcards_user_id_due_idx` index; no data loss to existing card content.

## References

- Library + edge + codebase research: `context/changes/srs-review-session/research.md`
- ts-fsrs API surface: `context/changes/srs-review-session/ts-fsrs-api-docs.md`
- Recurring rule (remote migration push): `context/foundation/lessons.md`
- Route template: `src/pages/api/flashcards/[id].ts`, `src/pages/api/flashcards.ts`
- Service template: `src/lib/services/flashcards.ts:18-79`
- Island templates: `src/components/cards/CardList.tsx`, `src/components/generate/GenerateView.tsx`
- Page template: `src/pages/cards/index.astro`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema + Type Foundation

#### Automated

- [x] 1.1 Migration applies cleanly locally: `npx supabase db reset`
- [x] 1.2 Type checking / build passes: `npm run build`
- [x] 1.3 Linting passes: `npm run lint`

#### Manual

- [x] 1.4 Edge smoke test: server-side `import` of ts-fsrs runs on `npm run dev` without runtime error
- [x] 1.5 Migration pushed to remote: `npx supabase db push`
- [x] 1.6 Remote `flashcards` table shows the 10 new columns

### Phase 2: Service + API Layer

#### Automated

- [ ] 2.1 Build passes: `npm run build`
- [ ] 2.2 Linting passes: `npm run lint`

#### Manual

- [ ] 2.3 `POST /api/flashcards/<id>/review` with `{ "rating": 3 }` returns 200 and an advanced `due`
- [ ] 2.4 Auth/validation edges: 401 unauth, 404 bad id, 400 for rating 0/5
- [ ] 2.5 Graded card's `due`/`reps`/`state` persist on re-query

### Phase 3: Review Page, Island & Navigation

#### Automated

- [ ] 3.1 Build passes: `npm run build`
- [ ] 3.2 Linting passes: `npm run lint`

#### Manual

- [ ] 3.3 Signed-out `/review` redirects to `/auth/signin`
- [ ] 3.4 Flip-then-grade loop works: front → show answer → grade w/ previews → advance
- [ ] 3.5 Completion state shows "N reviewed" + link to `/cards`
- [ ] 3.6 Empty queue shows "You're all caught up"
- [ ] 3.7 Graded card's new `due` is respected on fresh `/review` load
- [ ] 3.8 "Review" nav link works from `/cards`, `/generate`, dashboard
