# Manually Create a Flashcard (S-02) Implementation Plan

## Overview

Promote manual flashcard creation from a post-failed-generation fallback to a first-class action. Today a user can only hand-author a card via the inline form buried in `GenerateView`'s `EmptyState` (reachable only after a generation returns nothing). This plan extracts that form into a reusable island and adds a dedicated, auth-gated `/cards/new` page with navigation entry points — satisfying PRD **FR-006** (roadmap slice **S-02**). No backend, schema, type, validation, or API changes are required: F-01 and S-01 already shipped the entire write path.

## Current State Analysis

The persistence and write path are fully built and reused as-is:

- **Store (F-01):** `public.flashcards` table with per-user RLS, `flashcard_source` enum including `manual`, and the `created_at desc` index. See `supabase/migrations/20260619185620_create_flashcards.sql`.
- **Service (F-01):** `createFlashcard(client, cmd)` in `src/lib/services/flashcards.ts:30` — omits `user_id` on purpose (DB default `auth.uid()` + RLS own ownership).
- **Validation (S-01):** `createFlashcardSchema` in `src/lib/schemas/flashcards.ts:20` validates `{ front, back, source }` with trimmed, non-empty, ≤1000-char fields and the `source` enum.
- **API (S-01):** `POST /api/flashcards` in `src/pages/api/flashcards.ts` — the single validated write path for both accept-save and manual-create. Returns `201 { flashcard }`, `400` on bad input, `401` unauthenticated, `503` if Supabase unconfigured, `500` on write failure.
- **Working manual form (S-01):** `EmptyState` inside `src/components/generate/GenerateView.tsx:213` — front/back textareas (`maxLength={1000}`), a `saveFlashcard(front, back, "manual")` call, clear-on-success, a running saved count, inline error, and a "Start over" action tied to the generate flow. The `saveFlashcard` helper lives at `GenerateView.tsx:13`.

Conventions to follow (already established in the repo):

- **Page + island pattern:** `src/pages/generate.astro` renders `<GenerateView client:load />` inside `Layout.astro`; auth is enforced by middleware, the island owns all state.
- **Route gating:** `src/middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard", "/generate"]`, matched via `startsWith`. Unauthenticated users are redirected to `/auth/signin`.
- **Nav style:** plain `<a>` / `<button>` links with Tailwind; the dashboard (`src/pages/dashboard.astro:17`) has a purple CTA button to `/generate`; the generate header (`src/pages/generate.astro:21`) has a text link to `/dashboard`. `Topbar.astro` exists but is **not mounted** on any page.
- **Styling tokens:** `bg-cosmic`, `rounded-2xl border border-white/10 bg-white/5`, purple primary buttons (`bg-purple-600 hover:bg-purple-500`), `lucide-react` icons, `Button` from `@/components/ui/button`, `cn()` from `@/lib/utils`.

## Desired End State

A signed-in user can navigate to `/cards/new` (from a dashboard CTA or a link in the generate header), type a card front and back, and save it — the card persists as `source: "manual"` in their own collection. After each save the form clears, shows a confirmation with a running count, and refocuses the Front field so several cards can be added in a row. Unauthenticated visits to `/cards/new` redirect to sign-in. The generate flow's empty-state manual form behaves exactly as before, now rendered by the same shared component. Lint, typecheck, and build pass.

**Verification:** visit `/cards/new` while signed in → add a card → confirm it persists (query Supabase or, once S-03 lands, the browse list) with `source = 'manual'`; visit `/cards/new` signed out → redirected to `/auth/signin`; trigger a generation that returns no candidates → the empty-state manual form still works.

### Key Discoveries:

- The manual write path is **already done** — `POST /api/flashcards` accepts `source: "manual"` (`src/pages/api/flashcards.ts:11`), validated by `createFlashcardSchema` (`src/lib/schemas/flashcards.ts:20`).
- A working manual form already exists inline at `GenerateView.tsx:213` — this plan extracts it rather than writing a new one, to satisfy the roadmap's homogeneity risk (the saved shape must match S-01's accept-save).
- `PROTECTED_ROUTES` uses `startsWith`, so registering `/cards` gates `/cards/new` and any future `/cards/*` (e.g. S-03 browse) in one entry.
- `Topbar.astro` is unused; nav today is per-page `<a>`/button links — S-02 follows that, not a global nav adoption.

## What We're NOT Doing

- No backend changes: no migration, no new/changed service function, no new schema, no new API route. The existing `POST /api/flashcards` is reused verbatim.
- No browse/list view (that's S-03) — the post-save flow deliberately stays on the form instead of redirecting to a collection that doesn't exist yet.
- No edit/delete of saved cards (S-04).
- No bulk add / CSV import / multi-card paste.
- No adoption of `Topbar.astro` as a global nav, and no restyle of existing dashboard/generate pages beyond adding one CTA/link each.
- No new test runner or tests (none configured in the repo; out of scope per project conventions).
- No change to the `manual` source semantics or field caps (≤1000 chars, non-empty — already enforced client+server+DB).

## Implementation Approach

Two small phases, contract-preserving. **Phase 1** is a pure refactor: lift the inline `EmptyState` form into `src/components/manual/ManualCardForm.tsx` as a standalone island, parameterized just enough to serve both contexts (a configurable heading/intro and an optional secondary action slot for the generate flow's "Start over"). `GenerateView`'s `EmptyState` is rewritten to render the shared component, so its behavior is unchanged and the two manual surfaces can never drift. **Phase 2** adds the `/cards/new` gated page that renders the same island in a standalone layout, registers `/cards` in `PROTECTED_ROUTES`, and adds the two navigation entry points. Phase 1 ships behind no user-visible change (regression-only verification); Phase 2 delivers the new capability.

## Critical Implementation Details

**User experience spec** — after a successful save the form must clear both fields, show a confirmation with the running saved count, and return focus to the Front field, so a user adding several cards in a row never has to click back into the input. This matches and formalizes the existing `EmptyState` clear-on-success behavior (which clears but does not currently manage focus); the focus-return is the one small behavioral addition, applied in both contexts via the shared component.

## Phase 1: Extract the shared `ManualCardForm` island

### Overview

Move the manual-create form out of `GenerateView` into a reusable, self-contained React island and have the generate empty-state consume it. No user-visible change; this is the regression-safe foundation Phase 2 builds on.

### Changes Required:

#### 1. New shared manual-create island

**File**: `src/components/manual/ManualCardForm.tsx` (new)

**Intent**: Own the entire manual-create interaction — front/back inputs, client-side validation, the `POST /api/flashcards` save with `source: "manual"`, clear-and-refocus on success, running saved count, and inline error — in one place both the dedicated page and the generate empty-state render. Lift the existing logic from `GenerateView.tsx:213-291` (`EmptyState`) and its `saveFlashcard` helper (`GenerateView.tsx:13`) rather than re-authoring it.

**Contract**: Default-exported React component. Props let it fit both hosts without behavioral divergence:
- `heading?: string` / `intro?: string` — section title and sub-text (page passes its own; empty-state passes the "No usable cards…" copy).
- `footer?: React.ReactNode` — optional slot for a secondary action (the generate flow passes its "Start over" button + the "saved earlier this session" hint; the page passes nothing).
- The save path posts `{ front: front.trim(), back: back.trim(), source: "manual" }` to `/api/flashcards` and treats any non-`ok` response as an error. Field caps stay `maxLength={1000}`; the Save button stays disabled unless both trimmed fields are non-empty and no save is in flight. On success: clear both fields, increment the saved count, render the confirmation line, and move focus to the Front textarea (via a ref). Keep the existing Tailwind tokens so the visual result is identical inside the empty-state.

#### 2. Refactor `EmptyState` to consume the shared island

**File**: `src/components/generate/GenerateView.tsx`

**Intent**: Replace the inline `EmptyState` form body with a render of `<ManualCardForm … />`, passing the generate-specific heading/intro and a `footer` containing the existing "Start over" (`onReset`) button and the "{savedCount} card(s) saved earlier this session" hint. Remove the now-duplicated form state, `saveFlashcard` helper, and field markup from this file. The `status === "empty"` branch (`GenerateView.tsx:196`) keeps rendering the empty section; only its inner form is now the shared component.

**Contract**: `EmptyState`'s external signature (`{ onReset, savedCount }`) and the generate flow's empty-state UX (copy, Save card, Start over, success/earlier-saved counts) are unchanged from the user's perspective. If `saveFlashcard` is no longer referenced elsewhere in the file, remove it; otherwise leave it for the candidate-accept path (note: the candidate-accept path at `GenerateView.tsx:13-22` uses the same helper — keep `saveFlashcard` for that path and have `ManualCardForm` own its own copy of the POST logic, so the two are independent).

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build (typecheck + SSR build) passes: `npm run build`

#### Manual Verification:

- On `/generate`, force an empty generation result (or temporarily stub) → the empty-state manual form renders identically, saves a card as `manual`, clears, and shows the saved count.
- "Start over" in the empty state still resets the generate flow.
- No visual or behavioral regression in the candidate review/accept path.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the generate empty-state still works before proceeding to Phase 2.

---

## Phase 2: Dedicated `/cards/new` page and navigation

### Overview

Expose manual creation as a first-class, bookmarkable surface: a gated page rendering the shared island, plus the two entry points users will reach it from.

### Changes Required:

#### 1. Gated manual-create page

**File**: `src/pages/cards/new.astro` (new)

**Intent**: Render `<ManualCardForm client:load />` inside `Layout.astro` using the same page shell as `generate.astro` (cosmic background, centered max-width container, gradient header with the user's email, a back-link to `/dashboard`). Auth is enforced by middleware, so the page itself only reads `Astro.locals.user` for the greeting.

**Contract**: New route `/cards/new`. Mirrors `src/pages/generate.astro` structure (header + island). Header copy reflects manual authoring (e.g. "Add a flashcard" / "Write a card by hand and save it to your collection"). Passes page-appropriate `heading`/`intro` to the island and no `footer`.

#### 2. Gate the new route

**File**: `src/middleware.ts`

**Intent**: Add `/cards` to `PROTECTED_ROUTES` so `/cards/new` (and future `/cards/*` like the S-03 browse list) redirect unauthenticated users to `/auth/signin`.

**Contract**: `PROTECTED_ROUTES = ["/dashboard", "/generate", "/cards"]`. Matching is the existing `startsWith`, so one entry covers the whole `/cards` subtree.

#### 3. Dashboard entry point

**File**: `src/pages/dashboard.astro`

**Intent**: Add an "Add card manually" CTA next to the existing "Generate flashcards" button so the dashboard offers both creation paths.

**Contract**: A second link/button to `/cards/new` adjacent to the `/generate` CTA (`dashboard.astro:17`), styled consistently (e.g. an outline/secondary variant of the existing purple button so the AI path stays primary).

#### 4. Generate-header entry point

**File**: `src/pages/generate.astro`

**Intent**: Add a link to `/cards/new` in the generate header so a user who realizes they'd rather hand-author can switch without detouring through the dashboard.

**Contract**: A text link "Add manually" (matching the existing `/dashboard` link style at `generate.astro:21`) in the header's link area.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build (typecheck + SSR build) passes: `npm run build`

#### Manual Verification:

- Signed-in visit to `/cards/new` renders the form; saving creates a card that persists with `source = 'manual'` and the user's `user_id` (verify in Supabase Studio, or via the S-03 list once it exists).
- After save, fields clear, the confirmation + running count show, and focus returns to Front; a second card can be added without clicking.
- Signed-out visit to `/cards/new` redirects to `/auth/signin`.
- The dashboard "Add card manually" CTA and the generate-header "Add manually" link both navigate to `/cards/new`.
- No regression to `/dashboard`, `/generate`, or auth.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that the end-to-end manual-create flow works before considering S-02 complete.

---

## Testing Strategy

No automated test runner is configured in the repo (per project conventions), so verification is lint + build + manual.

### Manual Testing Steps:

1. Sign in. From the dashboard, click "Add card manually" → land on `/cards/new`.
2. Type a front and back, Save → confirm the form clears, shows "1 card(s) saved", and focus is on Front.
3. Add a second card without clicking into the field → confirm count increments to 2.
4. Try to save with an empty front or back → Save button stays disabled.
5. In Supabase Studio, confirm both rows exist with `source = 'manual'` and the correct `user_id`.
6. Sign out, visit `/cards/new` directly → redirected to `/auth/signin`.
7. On `/generate`, trigger an empty generation result → confirm the empty-state manual form (now the shared component) still saves and resets correctly.

## Performance Considerations

None beyond existing patterns — a single small island and one POST per save. No new dependencies, no data-volume concerns at MVP scale.

## Migration Notes

None — no schema or data changes.

## References

- Roadmap slice S-02: `context/foundation/roadmap.md` (lines 94–104)
- Reused write path: `src/pages/api/flashcards.ts`, `src/lib/schemas/flashcards.ts:20`, `src/lib/services/flashcards.ts:30`
- Form being extracted: `src/components/generate/GenerateView.tsx:213` (`EmptyState`)
- Page + island pattern to mirror: `src/pages/generate.astro`
- Route gating: `src/middleware.ts:4`
- Upstream S-01 brief: `context/changes/ai-card-generation/plan-brief.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Extract the shared `ManualCardForm` island

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — fa93404
- [x] 1.2 Build (typecheck + SSR build) passes: `npm run build` — fa93404

#### Manual

- [x] 1.3 Generate empty-state manual form renders identically, saves as `manual`, clears, shows saved count — fa93404
- [x] 1.4 "Start over" in the empty state still resets the generate flow — fa93404
- [x] 1.5 No regression in the candidate review/accept path — fa93404

### Phase 2: Dedicated `/cards/new` page and navigation

#### Automated

- [x] 2.1 Linting passes: `npm run lint`
- [x] 2.2 Build (typecheck + SSR build) passes: `npm run build`

#### Manual

- [ ] 2.3 Signed-in `/cards/new` saves a card persisting with `source = 'manual'` and correct `user_id`
- [ ] 2.4 After save, fields clear, confirmation + count show, focus returns to Front; second card addable without clicking
- [x] 2.5 Signed-out `/cards/new` redirects to `/auth/signin`
- [x] 2.6 Dashboard "Add card manually" CTA and generate-header "Add manually" link both reach `/cards/new`
- [x] 2.7 No regression to `/dashboard`, `/generate`, or auth
