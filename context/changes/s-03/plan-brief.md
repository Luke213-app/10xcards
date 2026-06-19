# Browse Saved Flashcards (S-03) — Plan Brief

> Full plan: `context/changes/s-03/plan.md`

## What & Why

Give a signed-in user a place to see the flashcards they've saved. Today cards persist in the F-01 store and can be created (S-01 generate, S-02 manual) but there is no view to browse them — PRD **FR-007** closes that gap with a flat, per-user collection list.

## Starting Point

F-01 shipped the `flashcards` table with per-user RLS, the `Flashcard` type, and a `listFlashcards(client)` service that returns the caller's own cards newest-first. S-02 already added `/cards` to `PROTECTED_ROUTES`, so the browse index is pre-gated. No browse page exists yet, and `/api/flashcards` only has a `POST`.

## Desired End State

A signed-in user visits `/cards` and sees their saved cards as a flat list, newest first — each showing front, back, an origin badge (AI / AI-edited / Manual), and a created date. A user with no cards sees a "No cards yet" empty state with Generate and Add-manually CTAs. RLS keeps each user to their own cards, and a "My cards" link reaches the page from the dashboard, the generate page, and `/cards/new`.

## Key Decisions Made

| Decision            | Choice                                            | Why (1 sentence)                                                                 | Source |
| ------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- | ------ |
| Render strategy     | Server-rendered Astro page, no island/API         | Read-only view; SSR via existing `listFlashcards()` needs no new API or client JS. | Plan   |
| Card display        | Front + back both visible                          | Browse is for verifying the collection at a glance; reveal/flip is S-05's job.    | Plan   |
| Card metadata       | Source badge + created date                        | Surfaces the AI-vs-manual mix (core metric) using data already on the row.        | Plan   |
| Empty state         | Message + both create CTAs (Generate, Add manually)| Turns a dead end into the next action, mirroring the dashboard's two-CTA pattern. | Plan   |
| Route & nav         | `/cards` index; "My cards" links from 3 surfaces   | Idiomatic REST shape (already gated); reachable from every existing page.         | Plan   |

## Scope

**In scope:**
- A server-rendered `/cards` page listing the user's cards (front/back + source badge + created date), newest-first.
- A "No cards yet" empty state with Generate + Add-manually CTAs.
- "My cards" nav links on the dashboard, generate header, and `/cards/new` header.

**Out of scope:**
- Edit / delete (S-04); recall/flip/self-test (S-05).
- GET API route, client island, client fetch.
- Deck/tag grouping, search, filter, sort, pagination.
- Schema, type, service, or middleware changes.

## Architecture / Approach

The `/cards` Astro page creates the request-scoped Supabase client in frontmatter, calls `listFlashcards()` (RLS scopes it to the user), and renders either the card list or the empty state as static HTML inside the established `Layout` + cosmic shell. No React, no client JS. Phase 2 adds three plain `<a>` nav links. The view deliberately stays server-only; S-04 can later wrap the list in an interactive island fed by this same SSR data.

## Phases at a Glance

| Phase                        | What it delivers                                          | Key risk                                                       |
| ---------------------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| 1. Browse page (`/cards`)    | SSR list (front/back + badge + date) + empty state        | Source-enum→label mapping and date formatting are presentation-only; verify two-user isolation holds via RLS. |
| 2. Navigation entry points   | "My cards" links from dashboard, generate, `/cards/new`   | Trivial; just avoid regressing existing headers.              |

**Prerequisites:** F-01 (shipped) and S-02's `/cards` route gating (shipped). Existing saved cards help verify the non-empty state.
**Estimated effort:** ~1 short session across 2 phases (one new page + three one-line nav links).

## Open Risks & Assumptions

- Assumes MVP-scale data volume, so an unpaginated flat list is acceptable (roadmap-confirmed).
- Assumes `createClient(...)` returning `null` (secrets unset) is handled with a notice rather than a crash, matching the API's `503` guard.
- Newly created cards appear on `/cards` only after navigation/reload — expected for an SSR view, not a live feed.

## Success Criteria (Summary)

- A signed-in user with cards sees their full collection newest-first at `/cards`, with origin badge and date; a user with none sees a helpful empty state.
- Each user sees only their own cards (RLS isolation holds).
- `/cards` is reachable via "My cards" from the dashboard, generate, and `/cards/new`, and redirects to sign-in when logged out.
