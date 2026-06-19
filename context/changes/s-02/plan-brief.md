# Manually Create a Flashcard (S-02) — Plan Brief

> Full plan: `context/changes/s-02/plan.md`

## What & Why

Make manual flashcard creation a first-class action. PRD **FR-006** requires users to author a card by hand and save it to their collection — the fallback when AI generation returns nothing usable. The backend for this already exists; today the only way to reach it is an inline form buried in the generate flow's empty state. This slice gives manual creation its own front door.

## Starting Point

F-01 shipped the store (`public.flashcards` + RLS + `createFlashcard()` service) and S-01 shipped the full write path: `POST /api/flashcards` already accepts `source: "manual"`, validated by `createFlashcardSchema`. A working manual form already lives inside `GenerateView`'s `EmptyState` (`src/components/generate/GenerateView.tsx:213`) but is only reachable after a generation returns no candidates. No standalone manual-create surface exists.

## Desired End State

A signed-in user opens `/cards/new` (via a dashboard CTA or a link in the generate header), types a front and back, and saves — the card persists as `source: "manual"` in their own collection. The form clears, confirms with a running count, and refocuses Front so several cards can be added in a row. Signed-out visits redirect to sign-in. The generate empty-state form is unchanged, now rendered by the same shared component.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Surface | Dedicated gated page `/cards/new` | First-class & bookmarkable; mirrors the existing `/generate` page+island pattern; no dependency on the unbuilt browse list. | Plan |
| Post-save UX | Stay on form, clear, confirm + count, refocus Front | Optimized for adding several cards in a row; matches existing `EmptyState` behavior; no dependency on S-03. | Plan |
| Reuse | Extract one shared `ManualCardForm`; page + empty-state both consume it | Single source of truth — directly satisfies the roadmap's "keep the saved shape homogeneous" risk. | Plan |
| Navigation | Dashboard CTA + link in `/generate` header | Reaches users from both home and the generate page; matches the repo's per-page `<a>`/button nav style. | Plan |
| Backend | No changes — reuse `POST /api/flashcards` verbatim | F-01 + S-01 already shipped the validated `manual` write path. | F-01 / S-01 |

## Scope

**In scope:** extract `src/components/manual/ManualCardForm.tsx` from the inline empty-state form; refactor `EmptyState` to consume it; add gated `/cards/new` page; register `/cards` in `PROTECTED_ROUTES`; add dashboard CTA + generate-header link.

**Out of scope:** any backend/schema/API/validation change; browse list (S-03); edit/delete (S-04); bulk/CSV add; adopting `Topbar.astro` as global nav; new test runner.

## Architecture / Approach

Two small, contract-preserving phases. **Phase 1** lifts the working inline form into a reusable island parameterized with a `heading`/`intro` and an optional `footer` slot (so the generate flow keeps its "Start over" action), then rewrites `EmptyState` to render it — a pure refactor with regression-only verification. **Phase 2** adds the `/cards/new` page (same shell as `generate.astro`), one-line `PROTECTED_ROUTES` change, and the two nav entry points.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Extract `ManualCardForm` | Shared island; generate empty-state consumes it | Touching the shipped S-01 empty-state — mitigated by keeping its external behavior identical (regression-only checks) |
| 2. Page + navigation | Gated `/cards/new` + dashboard CTA + generate link | Trivial; main check is the middleware `startsWith` correctly gates the new route |

**Prerequisites:** F-01 + S-01 shipped (done); local Supabase running for manual verification.
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- Refactoring `EmptyState` is the only regression surface; the shared component must preserve its exact UX (copy, Save/Start-over, success/earlier-saved counts).
- Post-save "stay on form" is chosen because the browse list (S-03) doesn't exist yet; if S-03 lands first, a redirect-to-list option could be reconsidered (single-point change).
- Assumes the per-page nav style (not `Topbar.astro`) remains the convention at MVP.

## Success Criteria (Summary)

- A signed-in user can create a card at `/cards/new` that persists as `manual` in their own collection, and can add several in a row without re-clicking.
- Unauthenticated `/cards/new` redirects to sign-in; dashboard and generate entry points both reach it.
- The generate empty-state manual form still works; lint and build pass with no regressions.
