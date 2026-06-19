# Edit and Delete a Saved Flashcard (S-04) — Plan Brief

> Full plan: `context/changes/s-04/plan.md`

## What & Why

Give a user edit + delete over the cards in their `/cards` collection (FR-008, FR-009). S-03 shipped a read-only browse view; S-04 is the slice that makes it interactive — the first client island fed by that SSR data — so users can fix and prune cards, not just view them.

## Starting Point

`/cards` is a pure Astro SSR page that lists cards inline with no client JS (`src/pages/cards/index.astro`). The F-01 data layer is already complete: `updateFlashcard()` / `deleteFlashcard()` services, `UpdateFlashcardCommand`, and per-user UPDATE/DELETE RLS policies all exist. The only HTTP route today is `POST /api/flashcards` — there is no single-card route.

## Desired End State

Each card on `/cards` has Edit and Delete controls. Edit swaps the card text for textareas (Save/Cancel) in place; Delete asks for inline confirmation. Both mutate without a full-page reload, show a spinner while in flight, and show an inline error on failure. A card a user doesn't own or that's missing returns `404`; editing never changes a card's `source`.

## Key Decisions Made

| Decision                         | Choice                                   | Why (1 sentence)                                                        | Source |
| -------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------- | ------ |
| Delete semantics                 | Hard-delete                              | OQ-3 / FR-009 commit MVP to hard-delete; suspend is a later refinement. | Change |
| Browse-view architecture         | One SSR-seeded `CardList` island         | Single source of truth for list mutations; no reloads, no orphaned DOM. | Plan   |
| Edit UX                          | Inline edit-in-place (textareas)         | Reuses existing textarea pattern; no Dialog component exists to build.  | Plan   |
| Delete confirmation              | Inline two-step Confirm/Cancel           | No new dependency; styled and accessible, fits the cosmic theme.        | Plan   |
| `source` on edit                 | Left unchanged                           | Keeps S-04 scoped to FR-008; the ≥75%-AI metric counts origin.          | Plan   |
| Not-found handling               | `404` on 0 rows affected (no leak)       | Honest status codes; missing vs not-owned both `404` to avoid leaking.  | Plan   |
| In-scope refinements             | Per-action loading/error + client validation | Trustworthy management UX; stops bad PATCHes before the round-trip. | Plan   |

## Scope

**In scope:** `updateFlashcardSchema`; `PATCH`/`DELETE` on `/api/flashcards/[id]`; minimal service tweaks for honest `404`; a `CardList` island with inline edit, inline-confirm delete, per-action loading/error state, client-side validation; wiring it into `index.astro`.

**Out of scope:** `source` promotion on edit; empty-after-delete island state (empty state reappears on next load); modal/AlertDialog; dedicated edit page; soft-delete; any DB migration; pagination/sort/search changes.

## Architecture / Approach

Bottom-up in two phases. **Phase 1** builds the HTTP boundary — a new `updateFlashcardSchema`, the dynamic `src/pages/api/flashcards/[id].ts` route (`PATCH` + `DELETE`) mirroring the existing `POST` handler's auth/error shape, and two small service changes so not-found surfaces as `404` (not `500`): `updateFlashcard` returns `Flashcard | null` via `.maybeSingle()`, `deleteFlashcard` returns a `boolean`. **Phase 2** replaces the inline Astro `<ul>` with a `client:load` `CardList` island seeded from the SSR `cards` array; the island owns list state so edits re-render in place and deletes drop the row without a reload.

## Phases at a Glance

| Phase                          | What it delivers                                          | Key risk                                                              |
| ------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------------- |
| 1. Single-card API layer       | `PATCH`/`DELETE` `/api/flashcards/[id]` + schema + 404s  | Mapping RLS's silent 0-rows to an honest `404` without leaking ownership. |
| 2. Interactive CardList island | In-place edit + inline-confirm delete, no reloads        | Re-implementing S-03's card markup in TSX and keeping list state consistent on failure. |

**Prerequisites:** S-03 shipped (`/cards` exists); F-01 services + RLS in place (both true). Local Supabase + a signed-in user with ≥2 cards for manual testing.
**Estimated effort:** ~1–2 sessions across 2 phases.

## Open Risks & Assumptions

- Deleting the last card leaves an empty island list until reload (empty-state-in-island is intentionally out of scope).
- Hard-delete discards a card's future SR history (irrelevant until S-05 lands).
- No test runner exists, so correctness rests on manual `curl`/UI checks plus DB CHECK + RLS as defense in depth.

## Success Criteria (Summary)

- A user can edit a card's front/back and see it persist, and delete a card from their collection, both without a full-page reload.
- Mutations on a missing/foreign card return `404`; invalid input returns `400`; unauthenticated returns `401`.
- No regression to S-03's browse, empty, or not-configured states, and no cross-user data access.
