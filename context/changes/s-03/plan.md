# Browse Saved Flashcards (S-03) Implementation Plan

## Overview

Give a signed-in user a place to see their saved flashcard collection: a server-rendered `/cards` page that lists every card they own (front + back, with a source badge and created date), newest-first, plus a guiding empty state for users who have no cards yet. This satisfies PRD **FR-007** (roadmap slice **S-03**). It is a read-only slice over the F-01 store — no schema, no new types, no new service function, and no new API route. The page calls the existing `listFlashcards()` service directly server-side, and nav links from the dashboard, the generate page, and `/cards/new` make the collection reachable from anywhere.

## Current State Analysis

The read path and route gating are already built; this slice consumes them:

- **Store (F-01):** `public.flashcards` with per-user RLS and a `(user_id, created_at DESC)` index. See `supabase/migrations/20260619185620_create_flashcards.sql`.
- **Service (F-01):** `listFlashcards(client)` in `src/lib/services/flashcards.ts:42` — selects all rows visible to the request-scoped client, ordered `created_at` descending, and maps DB snake_case rows to the camelCase `Flashcard` shape. RLS restricts the result to the caller's own cards automatically.
- **Type (F-01):** `Flashcard` in `src/types.ts` — `{ id, userId, front, back, source, createdAt, updatedAt }`; `source` is `FlashcardSource = "ai-full" | "ai-edited" | "manual"`.
- **Supabase client:** `createClient(requestHeaders, cookies)` in `src/lib/supabase.ts:5` returns the request-scoped authenticated client (or `null` if secrets are unset). The same value the API routes pass to services.
- **Route gating (S-02):** `PROTECTED_ROUTES = ["/dashboard", "/generate", "/cards"]` in `src/middleware.ts:4`, matched with `startsWith` — so `/cards` (the browse index) is **already** gated; unauthenticated visits redirect to `/auth/signin`. No middleware change is needed.

Conventions to follow (already established in the repo):

- **Page + island pattern:** `src/pages/generate.astro` and `src/pages/cards/new.astro` render inside `Layout.astro` with a cosmic background, a centered `max-w-3xl` container, a gradient `<h1>` + sub-text header that greets `Astro.locals.user`, and text nav links in the header's right side. Auth is enforced by middleware; the page reads `Astro.locals.user` only for the greeting.
- **Pages are SSR by default** (CLAUDE.md / `output: "server"`), so an Astro page can create the Supabase client and call a service in its frontmatter and render the result as static HTML — no client JS required for a read-only view.
- **Styling tokens:** `bg-cosmic`, card containers `rounded-2xl border border-white/10 bg-white/5 p-6`, gradient heading `bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-transparent`, muted sub-text `text-blue-100/60`, purple primary CTA `bg-purple-600 hover:bg-purple-500`, secondary CTA `border border-white/20 bg-white/10 hover:bg-white/20`, header nav links `text-sm text-purple-300 hover:underline`.
- **Nav today is per-page links** (no global nav; `Topbar.astro` is unused). Dashboard has Generate + Add-manually CTAs (`dashboard.astro:18-29`); `generate.astro` header has "Add manually" + "Dashboard" links (`generate.astro:22-23`); `cards/new.astro` header has a "Dashboard" link (`cards/new.astro:21`).

## Desired End State

A signed-in user can navigate to `/cards` and see their saved flashcards as a flat list, newest first. Each card shows its front (question) and back (answer) together, a small badge for its origin (`ai-full` / `ai-edited` / `manual`), and the date it was created. A user with no cards instead sees a friendly "No cards yet" empty state with two CTAs — "Generate flashcards" (`/generate`) and "Add card manually" (`/cards/new`). RLS guarantees a user only ever sees their own cards. A "My cards" link appears on the dashboard, in the generate header, and in the `/cards/new` header, so the collection is reachable from every existing surface. Unauthenticated visits to `/cards` redirect to `/auth/signin`. Lint and build pass.

**Verification:** sign in as a user with saved cards → visit `/cards` → the cards render newest-first with the correct front/back, source badge, and date; sign in as a second user with no cards → `/cards` shows the empty state with both CTAs; create/generate a card, return to `/cards` → it appears; visit `/cards` signed out → redirected to `/auth/signin`; two-user check → user B never sees user A's cards.

### Key Discoveries:

- The list path is **already done** — `listFlashcards(client)` (`src/lib/services/flashcards.ts:42`) returns the user's own cards ordered `created_at DESC`; the page just calls it server-side. No GET API route is needed for a read-only view.
- `/cards` is **already gated** — S-02 added `/cards` to `PROTECTED_ROUTES` with `startsWith` matching, so the browse index inherits protection with no middleware edit (`src/middleware.ts:4`).
- The `Flashcard` type already carries `source` and `createdAt`, so the source badge and date need no new data — only presentation (an enum→label map and a date format).
- `cards/new.astro` and `generate.astro` give an exact page-shell template to mirror; the only new visual element is the card-list rendering and the empty state.

## What We're NOT Doing

- **No GET API route / no client island / no client fetch.** The page server-renders the list via `listFlashcards()`. (S-04, which adds edit/delete interactivity, can introduce an island fed by this same SSR data when it lands.)
- **No edit or delete** of cards — that's S-04.
- **No deck / folder / tag grouping, no search, no filter, no sort controls** — PRD Non-Goal; the collection is a single flat newest-first list.
- **No pagination / infinite scroll / virtualization** — MVP `target_scale` is small data volume; a flat list is acceptable.
- **No middleware change** — `/cards` is already gated by S-02.
- **No schema, type, or service change** — F-01 shipped everything the read path needs.
- **No global nav adoption** (`Topbar.astro` stays unused); per-page "My cards" links only, matching the existing pattern.
- **No new test runner or tests** (none configured in the repo; out of scope per project conventions).
- **No click-to-reveal / flip / self-test interaction** — browse shows front and back together; recall/review is S-05.

## Implementation Approach

Two small phases, capability-then-reach (mirroring S-02). **Phase 1** adds the read-only `/cards` index page: it creates the Supabase client in frontmatter, calls `listFlashcards()`, and renders either the card list (front + back + source badge + created date, newest-first) or the empty state with both create CTAs. Because the view is read-only and pages are SSR by default, this is pure Astro markup — no React island, no client JS, no loading state. **Phase 2** wires the three "My cards" navigation links so the page is discoverable. Phase 1 delivers the capability behind a directly-typed URL; Phase 2 makes it reachable.

## Critical Implementation Details

**Supabase-unconfigured guard** — `createClient(...)` returns `null` when secrets are unset (same as the API routes handle). The page must treat a `null` client as "cannot load" rather than crashing: render a brief error/notice state instead of calling the service on `null`. This mirrors the `503` guard in `src/pages/api/flashcards.ts:20`.

## Phase 1: Browse page (`/cards` index)

### Overview

Add the server-rendered `/cards` page that lists the signed-in user's cards (or shows the empty state). Read-only; no new API, type, service, or middleware.

### Changes Required:

#### 1. Browse page

**File**: `src/pages/cards/index.astro` (new)

**Intent**: Render the user's flashcard collection. In frontmatter, create the request-scoped Supabase client and call `listFlashcards()` to fetch the user's cards server-side; in the template, render the cosmic page shell (mirroring `cards/new.astro`) with either the card list or the empty state. The page reads `Astro.locals.user` only for the header greeting; auth is already enforced by middleware.

**Contract**: New route `/cards`. Page shell mirrors `src/pages/cards/new.astro` (Layout, `bg-cosmic`, `max-w-3xl` container, gradient `<h1>` "My cards" + sub-text, header nav links — at minimum a "Dashboard" link, plus "Add manually"/"Generate" links consistent with the other headers). Frontmatter:
- `const supabase = createClient(Astro.request.headers, Astro.cookies)` — if `null`, skip the fetch and render a "collection unavailable" notice (parallels the API's `503` guard).
- `const cards = supabase ? await listFlashcards(supabase) : []` (and a separate flag to distinguish "unconfigured" from "genuinely empty").

Rendering:
- **Non-empty:** a list of cards, each in a `rounded-2xl border border-white/10 bg-white/5 p-6` container, showing the front (emphasized) and the back (muted/secondary), a small **source badge** (map `ai-full`→"AI", `ai-edited`→"AI (edited)", `manual`→"Manual"; the exact labels are the implementer's call, but all three enum values must map to a human label), and the **created date** (a readable short/relative format derived from `card.createdAt`). Order is the service's `created_at DESC` — do not re-sort.
- **Empty (`cards.length === 0` and client configured):** a "No cards yet" message with two CTAs — a primary "Generate flashcards" link to `/generate` (`bg-purple-600`) and a secondary "Add card manually" link to `/cards/new` (`border border-white/20 bg-white/10`), mirroring the dashboard's two-CTA block.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build (typecheck + SSR build) passes: `npm run build`

#### Manual Verification:

- Signed in as a user with saved cards, `/cards` lists them newest-first with correct front/back, a source badge per card, and a created date.
- Signed in as a user with no cards, `/cards` shows the "No cards yet" empty state with working "Generate flashcards" and "Add card manually" CTAs.
- A card created via `/cards/new` or `/generate` appears on `/cards` after navigating to it (reload).
- Two-user isolation: user B never sees user A's cards on `/cards`.
- Signed-out visit to `/cards` redirects to `/auth/signin`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the list, empty state, and isolation all behave correctly before proceeding to Phase 2.

---

## Phase 2: Navigation entry points

### Overview

Make `/cards` reachable: add a "My cards" link to the dashboard and to the generate and `/cards/new` headers.

### Changes Required:

#### 1. Dashboard entry point

**File**: `src/pages/dashboard.astro`

**Intent**: Add a "My cards" link alongside the existing "Generate flashcards" / "Add card manually" CTAs so the dashboard offers a path into the collection.

**Contract**: A third link/button to `/cards` in the CTA block (`dashboard.astro:17-30`), styled consistently with the existing secondary CTA (`border border-white/20 bg-white/10 hover:bg-white/20`) so the AI generate path stays the primary action.

#### 2. Generate-header entry point

**File**: `src/pages/generate.astro`

**Intent**: Add a "My cards" link in the generate header so a user can jump to their collection mid-flow.

**Contract**: A text link "My cards" → `/cards` in the header link group (`generate.astro:21-24`), matching the existing `text-sm text-purple-300 hover:underline` link style.

#### 3. Manual-create-header entry point

**File**: `src/pages/cards/new.astro`

**Intent**: Add a "My cards" link in the `/cards/new` header so a user who just added a card can view the collection.

**Contract**: A text link "My cards" → `/cards` next to the existing "Dashboard" link (`cards/new.astro:21`), same link style.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build (typecheck + SSR build) passes: `npm run build`

#### Manual Verification:

- The dashboard "My cards" link navigates to `/cards`.
- The generate-header "My cards" link navigates to `/cards`.
- The `/cards/new`-header "My cards" link navigates to `/cards`.
- No regression to `/dashboard`, `/generate`, `/cards/new`, or auth.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that all three entry points reach `/cards` before considering S-03 complete.

---

## Testing Strategy

No automated test runner is configured in the repo (per project conventions), so verification is lint + build + manual.

### Manual Testing Steps:

1. Sign in as a user who has saved cards (from S-01/S-02). Visit `/cards` → confirm cards render newest-first, each with front, back, a source badge, and a created date.
2. Create a new card via `/cards/new`, then navigate to `/cards` → confirm the new card appears at the top with the `Manual` badge.
3. Sign out and sign in as a second user with no cards. Visit `/cards` → confirm the "No cards yet" empty state with both CTAs; click each CTA → lands on `/generate` and `/cards/new`.
4. As the empty user, confirm none of user 1's cards are visible (isolation).
5. Sign out, visit `/cards` directly → redirected to `/auth/signin`.
6. From the dashboard, the generate header, and the `/cards/new` header, click "My cards" → each lands on `/cards`.

## Performance Considerations

None beyond existing patterns. One indexed `SELECT` per page load (the `(user_id, created_at DESC)` index from F-01 already covers the ordering); no client JS, no new dependencies. MVP data volume is small, so the unpaginated flat list is acceptable.

## Migration Notes

None — no schema or data changes.

## References

- Roadmap slice S-03: `context/foundation/roadmap.md` (lines 106–116)
- List service reused: `src/lib/services/flashcards.ts:42` (`listFlashcards`)
- Entity type: `src/types.ts` (`Flashcard`, `FlashcardSource`)
- Supabase client: `src/lib/supabase.ts:5`
- Route gating (already covers `/cards`): `src/middleware.ts:4`
- Page + island shell to mirror: `src/pages/cards/new.astro`, `src/pages/generate.astro`
- Empty-state two-CTA pattern: `src/pages/dashboard.astro:17-30`
- Upstream F-01 plan: `context/changes/flashcard-store-and-isolation/plan.md`
- Sibling S-02 plan (nav + page pattern): `context/changes/s-02/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Browse page (`/cards` index)

#### Automated

- [x] 1.1 Linting passes: `npm run lint`
- [x] 1.2 Build (typecheck + SSR build) passes: `npm run build`

#### Manual

- [x] 1.3 Signed-in user with cards sees them newest-first with front/back, source badge, and created date
- [x] 1.4 User with no cards sees the "No cards yet" empty state with working Generate + Add-manually CTAs
- [x] 1.5 A newly created/generated card appears on `/cards` after navigation
- [x] 1.6 Two-user isolation: user B never sees user A's cards on `/cards`
- [x] 1.7 Signed-out visit to `/cards` redirects to `/auth/signin`

### Phase 2: Navigation entry points

#### Automated

- [ ] 2.1 Linting passes: `npm run lint`
- [ ] 2.2 Build (typecheck + SSR build) passes: `npm run build`

#### Manual

- [ ] 2.3 Dashboard "My cards" link navigates to `/cards`
- [ ] 2.4 Generate-header "My cards" link navigates to `/cards`
- [ ] 2.5 `/cards/new`-header "My cards" link navigates to `/cards`
- [ ] 2.6 No regression to `/dashboard`, `/generate`, `/cards/new`, or auth
