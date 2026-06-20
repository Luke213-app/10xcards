# Spaced-Repetition Review Session (S-05) — Plan Brief

> Full plan: `context/changes/srs-review-session/plan.md`
> Research: `context/changes/srs-review-session/research.md`

## What & Why

Build the spaced-repetition review session — the last core MVP feature. Users review their due flashcards one at a time, recall the answer, and grade themselves; the FSRS algorithm (`ts-fsrs`) reschedules each card. This resolves roadmap **OQ-1** (SR library choice → `ts-fsrs`) and delivers FR-010 (interval previews) and FR-011 (Again/Hard/Good/Easy grade scale).

## Starting Point

F-01 (`flashcards` table + RLS) and S-01..S-04 (generation, CRUD API, `/cards` browse island) are all shipped — the roadmap's "S-05 blocked" baseline is stale. The flashcards table has **none** of the 10 ts-fsrs scheduling fields yet; there is no `/review` route. Research confirmed `ts-fsrs` is edge-safe (pure ESM, zero deps) and drops into every existing layer via templates already in the repo.

## Desired End State

A signed-in user opens `/review`, sees their due cards, flips each to reveal the answer, and grades it with one of four buttons (each labelled with its next-due interval). Cards reschedule server-side and the next due card appears; finishing shows a "Session complete — N reviewed" state. When nothing is due, the page shows "You're all caught up." Existing cards are all immediately reviewable as `New`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| SR library | `ts-fsrs` (FSRS v6) | MIT, zero-dep, edge-safe, best retention accuracy — resolves OQ-1. | Research |
| Storage shape | Dedicated columns (not JSONB) | Due-queue filters/orders on `due`, which needs a real indexed column. | Research |
| `state`/`learning_steps` | Numeric `smallint`/`int` (no PG enum) | Matches ts-fsrs's numeric enum exactly. | Research |
| Review flow | Flip then grade | Forces active recall — the core point of SR. | Plan |
| Session scope | All due now, flat queue | Matches roadmap's "due now" model; one indexed query. | Plan |
| Interval preview | Server-side `repeat()`, sent with each card | Keeps scheduler off the client; satisfies FR-010. | Plan |
| DTO shape | Narrow `ReviewCard` DTO | Smallest blast radius — existing `Flashcard` consumers untouched. | Plan |
| Empty/done UX | Friendly empty + completion states | Mirrors existing empty-state patterns; clear closure. | Plan |
| Backfill | Existing cards due-now as `New` | Zero backfill script; immediate first session. | Plan |

## Scope

**In scope:** migration (10 scheduling cols + `(user_id, due)` index), extended DB types + `ReviewCard`/`GradeCommand`, `listDueFlashcards` + `gradeFlashcard` service fns, `gradeSchema`, `POST /api/flashcards/[id]/review`, `/review` page + `ReviewSession` island, `/review` route gate, "Review" nav links.

**Out of scope:** custom scheduler, FSRS optimizer/tuning, client-side ts-fsrs, session caps, near-future review, type-the-answer checking, review-log persistence, changes to existing card flows, backfill script.

## Architecture / Approach

Bottom-up: **DB → service/API → page/island.** A migration adds scheduling state to `flashcards` (RLS extends for free). `listDueFlashcards` reads `due <= now()` (RLS-scoped, indexed) and attaches server-computed `repeat()` previews; `gradeFlashcard` runs `next()` and persists the rescheduled card (serializing ts-fsrs `Date` objects → ISO). The review endpoint copies the existing rigid route template. The `/review` page SSR-seeds the due queue into a `ReviewSession` island that runs the flip-then-grade loop, mirroring `CardList`/`GenerateView`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema + types | `ts-fsrs` installed, migration (10 cols + index), extended `database.types.ts`, `ReviewCard`/`GradeCommand` | **Migration must reach remote** (`db push`) or prod 500s (`lessons.md`); hand-maintained types |
| 2. Service + API | `listDueFlashcards` (+previews), `gradeFlashcard`, `gradeSchema`, review endpoint | Date↔ISO / numeric-state round-trip correctness |
| 3. Page + island + nav | `/review` page, `ReviewSession` island, route gate, nav links | Review-loop UX state (reveal/advance/complete) |

**Prerequisites:** F-01 + S-01 (done). Local Supabase + Docker; remote project access for `db push`.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- **Remote migration push is mandatory** — local-only application reproduces the F-01 production-500 bug. Phase 1's manual gate enforces `supabase db push`.
- `database.types.ts` is hand-edited (no CI generation) — easy to forget a column.
- Flat queue loads all due cards at once; fine at MVP volumes, a session cap is a clean later addition.
- Assumes the `ts-fsrs` scheduler core runs on workerd (research-verified; confirmed by Phase 1 edge smoke test).

## Success Criteria (Summary)

- A user can review due cards flip-then-grade, with interval previews, and cards reschedule correctly across sessions.
- Empty-queue and session-complete states render cleanly; `/review` is auth-gated.
- Migration is live on **remote** (no production 500s); `npm run build` + `npm run lint` pass.
