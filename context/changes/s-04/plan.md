# Edit and Delete a Saved Flashcard (S-04) — Implementation Plan

## Overview

Add **edit** and **delete** to the existing `/cards` browse view so a user can act on a card selected from their collection. The F-01 data layer already provides everything below the HTTP boundary — `updateFlashcard()`, `deleteFlashcard()`, the `UpdateFlashcardCommand` type, and per-user UPDATE/DELETE RLS policies. The two missing pieces are (1) single-card API routes (`PATCH` / `DELETE` on `/api/flashcards/[id]`) and (2) turning S-03's static server-rendered list into an interactive island that owns list state for in-place edit and inline-confirmed delete.

## Current State Analysis

- **`/cards` is pure Astro SSR, no island** (`src/pages/cards/index.astro:1-94`). It calls `listFlashcards(supabase)` server-side and renders a `<ul>` of cards inline, with a `SOURCE_LABELS` map and a `formatDate` helper. Three branches: not-configured, empty (`No cards yet`), and the list.
- **Services exist and are RLS-aware** (`src/lib/services/flashcards.ts`): `updateFlashcard(client, id, {front?, back?})` (lines 54-67) and `deleteFlashcard(client, id)` (lines 69-72). Both currently assume the row exists:
  - `updateFlashcard` uses `.update(...).eq("id", id).select().single()` — on 0 rows (id not owned / missing) PostgREST returns error `PGRST116`, surfacing as a thrown error rather than a clean not-found.
  - `deleteFlashcard` returns `void` and never reports how many rows were affected — a delete of a missing/foreign id succeeds silently.
- **Only `POST /api/flashcards` exists** (`src/pages/api/flashcards.ts:14-42`). It is the canonical error/response template: `json(body, status)` helper, `401` when `!locals.user`, `503` when Supabase unconfigured, `400` on bad JSON, `400 + details` on zod failure, `201` on success, generic `500` on thrown error. There is **no dynamic `[id]` route**.
- **Validation lives in `src/lib/schemas/flashcards.ts`**: `trimmedText(max) = z.string().trim().min(1).max(max)`, `FIELD_MAX = 1000` (mirrors the DB CHECK), `createFlashcardSchema`. **No `updateFlashcardSchema`.**
- **RLS is already correct** (`supabase/migrations/20260619185620_create_flashcards.sql:42-53`): UPDATE and DELETE policies both gate on `auth.uid() = user_id`; the `flashcards_set_updated_at` trigger bumps `updated_at` on every UPDATE. **No migration is needed for this slice.**
- **UI conventions** (`src/components/manual/ManualCardForm.tsx`, `src/components/generate/CandidateCard.tsx`, `src/components/generate/GenerateView.tsx`): islands hydrate with `client:load`; the only shadcn component present is `Button` (`src/components/ui/button.tsx`) — **no Dialog/AlertDialog**. Editing is done with the project's `textarea` pattern (`maxLength={1000}`, `resize-y`, cosmic styling). Client fetch is `fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(...) })`; `GenerateView` is the precedent for a list-owning island with per-item `saving`/`error` state.

### Key Discoveries:

- `updateFlashcard`'s `.single()` (`flashcards.ts:64`) turns "not found" into a thrown error — to return an honest `404` the service must distinguish 0-rows from a real failure (switch to `.maybeSingle()` → `Flashcard | null`).
- `deleteFlashcard` (`flashcards.ts:69-72`) cannot currently report a `404` — it must report rows affected (e.g. `.delete(...).select()` and check length, or return a boolean).
- The card markup, `SOURCE_LABELS`, and `formatDate` currently live only in `index.astro:17-88`; moving the list into an island means re-implementing that card shell once in TSX.
- `Flashcard` (`src/types.ts:12-20`) already carries everything the island needs (`id, front, back, source, createdAt`), so SSR can serialize the full `cards` array straight into island props.

## Desired End State

On `/cards`, each card shows an **Edit** and a **Delete** control. Edit swaps the card's text for front/back textareas (Save / Cancel) in place; Save PATCHes the change and the card re-renders with the new text and no reload. Delete asks for inline confirmation (Confirm / Cancel) then DELETEs and the card disappears from the list without a reload. Each action shows a spinner while in flight and an inline error (reverting any optimistic change) on failure. A card the user doesn't own or that doesn't exist yields a `404` from the API. A card's `source` is never changed by an edit.

**Verify:** sign in, open `/cards` with ≥2 cards; edit one card's front and back, Save → text updates in place, `updatedAt` advances in the DB; Cancel mid-edit discards the draft; Delete → Confirm removes the card; `curl`/devtools a `PATCH`/`DELETE` to a random UUID returns `404`; an empty/over-1000 front disables Save client-side and is rejected `400` server-side.

## What We're NOT Doing

- **No `source` promotion on edit** — editing an `ai-full` card does not flip it to `ai-edited` (per decision; keeps S-04 scoped to FR-008 and the ≥75%-AI metric counts origin, not later edits).
- **No empty-after-delete island state** — if the user deletes their *last* card, the island shows an empty list; the `No cards yet` empty state reappears on the next page load (kept out of scope per questioning). The Astro empty/not-configured branches are unchanged for first render.
- **No modal/AlertDialog or Dialog component** — delete uses inline two-step confirm; edit is in-place.
- **No dedicated `/cards/[id]/edit` page.**
- **No soft-delete / suspend / archive** — hard-delete only (OQ-3, FR-009).
- **No DB migration** — RLS UPDATE/DELETE policies and the `updated_at` trigger already exist.
- **No pagination / sorting / search changes** — the flat list from S-03 is unchanged.

## Implementation Approach

Two phases, bottom-up. Phase 1 builds and verifies the HTTP boundary (schema + dynamic route) plus the minimal service tweaks needed to return honest `404`s, independently testable with `curl`. Phase 2 builds the interactive island and swaps it into `index.astro`, consuming the Phase-1 routes. Routes mirror the existing `POST` handler's auth/error shape exactly so the surface stays homogeneous.

## Critical Implementation Details

- **Not-found must be a distinct signal, not a thrown 500.** RLS makes another user's row invisible, so UPDATE/DELETE legitimately affect 0 rows for both "missing" and "not-owned" — both must map to `404` (no missing-vs-forbidden distinction, to avoid leaking ownership). `updateFlashcard` should switch from `.single()` to `.maybeSingle()` and return `Flashcard | null`; `deleteFlashcard` should report whether a row was removed. The route maps `null`/`false` → `404`, genuine thrown errors → `500`.
- **Astro dynamic API route file is `src/pages/api/flashcards/[id].ts`** with `export const prerender = false`. Adding it does **not** require moving the existing `src/pages/api/flashcards.ts` (Astro resolves `/api/flashcards` and `/api/flashcards/:id` from the file and the folder side by side).
- **`updateFlashcardSchema` must reject an empty patch.** `{ front?, back? }` with both omitted would be a no-op UPDATE; require at least one field present (zod `.refine`) so an empty body is a clean `400`.

---

## Phase 1: Single-card API layer (PATCH + DELETE)

### Overview

Add `updateFlashcardSchema`, make the two services return honest not-found signals, and create the dynamic `/api/flashcards/[id]` route exporting `PATCH` and `DELETE` that mirror the existing `POST` handler's auth/validation/error shape.

### Changes Required:

#### 1. Update-flashcard validation schema

**File**: `src/lib/schemas/flashcards.ts`

**Intent**: Add the body schema for `PATCH /api/flashcards/[id]` so partial edits validate against the same `FIELD_MAX`/non-empty bounds as create, and an empty patch is rejected.

**Contract**: Export `updateFlashcardSchema` — an object with optional `front` and `back`, each `trimmedText(FIELD_MAX)` when present, refined to require at least one of the two. Parsed output is assignable to `UpdateFlashcardCommand` (`{ front?: string; back?: string }`). Does not accept `source`.

#### 2. Service not-found signals

**File**: `src/lib/services/flashcards.ts`

**Intent**: Let the route return `404` instead of `500` when a card id is missing or not owned, without changing the happy-path return for callers that already exist.

**Contract**:
- `updateFlashcard(...)` returns `Promise<Flashcard | null>` — switch `.single()` to `.maybeSingle()`; `null` data → return `null`; real `error` still throws. (No current caller other than the new route consumes the return value.)
- `deleteFlashcard(...)` returns `Promise<boolean>` — use `.delete().eq("id", id).select()` (or equivalent) and return whether ≥1 row came back; real `error` still throws.

#### 3. Dynamic single-card route

**File**: `src/pages/api/flashcards/[id].ts` (new)

**Intent**: Expose `PATCH` (edit front/back) and `DELETE` (hard-delete) for one card, reusing the `POST` route's auth and error conventions; ownership is enforced entirely by RLS via the request-scoped client.

**Contract**: `export const prerender = false`. Same `json(body, status)` helper and guard order as `src/pages/api/flashcards.ts`:
- Both methods: `401` if `!context.locals.user`; `503` if `createClient(...)` is null; `id` read from `context.params.id`.
- `PATCH`: parse JSON (`400` on bad JSON) → `updateFlashcardSchema.safeParse` (`400 + details` on failure) → `updateFlashcard(supabase, id, parsed.data)`; `null` → `404 { error: "Flashcard not found" }`; success → `200 { flashcard }`; thrown → `500`.
- `DELETE`: `deleteFlashcard(supabase, id)`; `false` → `404`; `true` → `200 { success: true }` (or `204`); thrown → `500`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit` (or `npm run build`)
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- `PATCH /api/flashcards/<own-id>` with `{ "front": "x", "back": "y" }` returns `200` with the updated flashcard; the row's `updatedAt` advances.
- `PATCH` / `DELETE` to a random UUID returns `404` (not `500`).
- `PATCH` with an empty body, or `front: ""`, or a >1000-char field returns `400`.
- `DELETE /api/flashcards/<own-id>` returns success and the row is gone; a second `DELETE` of the same id returns `404`.
- Unauthenticated `PATCH`/`DELETE` returns `401`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing (the `curl`/devtools checks above) was successful before proceeding to Phase 2.

---

## Phase 2: Interactive CardList island

### Overview

Replace the inline Astro `<ul>` with a single `client:load` React island seeded from SSR data. The island owns the card list and renders each card with view/edit modes, inline delete confirmation, and per-action loading/error state, calling the Phase-1 routes.

### Changes Required:

#### 1. Card list island

**File**: `src/components/cards/CardList.tsx` (new)

**Intent**: Own the user's card collection in client state and render each card with edit-in-place and inline-confirm delete, mirroring the per-item `saving`/`error` pattern from `GenerateView`/`CandidateCard`.

**Contract**: Default export `CardList({ cards }: { cards: Flashcard[] })`. Holds the list in state plus per-card UI state (`mode: "view" | "editing" | "confirmingDelete"`, draft `front`/`back`, `saving`, `error`). Reuses the `SOURCE_LABELS` map and a `formatDate` helper (moved/duplicated from `index.astro`) and the project's textarea styling (`maxLength={1000}`, `resize-y`).
- **Edit**: Edit → textareas seeded from current values + Save/Cancel. Save disabled when either draft is empty-after-trim or >1000 chars (client-side mirror of `updateFlashcardSchema`). Save → `PATCH /api/flashcards/${id}` with the changed fields; on `200` replace the card in state with the response and return to view mode; on failure set inline `error` and keep edit mode (no optimistic text swap, or revert it). Cancel → drop draft, return to view mode (saved values intact).
- **Delete**: Delete → Confirm/Cancel pair. Confirm → `DELETE /api/flashcards/${id}`; on success remove the card from state; on failure show inline `error` and restore the row. Cancel → back to view mode.
- Spinner (`Loader2`) on the active button while a request is in flight; buttons disabled during the request.

#### 2. Wire the island into the browse page

**File**: `src/pages/cards/index.astro`

**Intent**: Render the interactive island in place of the inline list while leaving the not-configured and empty-state branches as server-rendered Astro.

**Contract**: Import `CardList`; in the `cards.length > 0` branch render `<CardList cards={cards} client:load />` instead of the inline `<ul>`. The `!configured` and `cards.length === 0` branches are unchanged. `SOURCE_LABELS`/`formatDate` move into (or are duplicated in) the island; remove the now-unused inline list markup. Header links unchanged.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit` (or `npm run build`)
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- `/cards` lists existing cards as before; source label and date still render.
- Edit a card: change front and back, Save → text updates in place, no full-page reload; reload confirms persistence.
- Cancel mid-edit restores the saved text; an empty or >1000-char field disables Save.
- Delete a card: Confirm removes it from the list without reload; Cancel aborts; reload confirms it's gone.
- A failed request (e.g. offline) shows an inline error and does not silently drop/duplicate the card.
- A user only ever sees and mutates their own cards (RLS unchanged); no regression to the empty / not-configured states.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation from the human that the manual UI testing was successful before considering the change complete.

---

## Testing Strategy

### Unit Tests:

- No test runner is configured in this project (per `CLAUDE.md`); no unit tests are added. Validation correctness is covered by the manual `curl` checks against the route + the existing DB CHECK/RLS as defense in depth.

### Integration Tests:

- Manual end-to-end against a local Supabase + dev server (see Manual Testing Steps).

### Manual Testing Steps:

1. Sign in; ensure ≥2 saved cards exist (generate or add manually).
2. Open `/cards`; edit a card's front+back, Save; confirm in-place update and DB `updated_at` change.
3. Start an edit, change text, Cancel; confirm original text restored.
4. Try to Save an empty front; confirm Save is disabled.
5. Delete a card → Confirm; confirm it disappears without reload; reload to confirm persistence.
6. Delete → Cancel; confirm the card stays.
7. `curl`/devtools: `PATCH` and `DELETE` a random UUID → `404`; unauthenticated → `401`; oversized field → `400`.

## Performance Considerations

Negligible — small per-user collections (roadmap `target_scale: small`), one round-trip per edit/delete, single island hydrated on a page that previously shipped no JS.

## Migration Notes

None — no schema or data migration. RLS UPDATE/DELETE policies and the `updated_at` trigger already exist from F-01.

## References

- Change identity: `context/changes/s-04/change.md`
- Roadmap slice: `context/foundation/roadmap.md` (S-04, FR-008/FR-009)
- Services: `src/lib/services/flashcards.ts:54-72`
- Existing route template: `src/pages/api/flashcards.ts:14-42`
- Schemas: `src/lib/schemas/flashcards.ts:20-24`
- Browse page (S-03): `src/pages/cards/index.astro:1-94`
- RLS + trigger: `supabase/migrations/20260619185620_create_flashcards.sql:42-69`
- Island precedents: `src/components/generate/GenerateView.tsx`, `src/components/generate/CandidateCard.tsx`, `src/components/manual/ManualCardForm.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Single-card API layer (PATCH + DELETE)

#### Automated

- [x] 1.1 Type checking passes (`npx tsc --noEmit` / `npm run build`) — 6f487dd
- [x] 1.2 Linting passes (`npm run lint`) — 6f487dd
- [x] 1.3 Production build succeeds (`npm run build`) — 6f487dd

#### Manual

- [x] 1.4 PATCH own card returns 200 + updated flashcard; `updatedAt` advances — 6f487dd
- [x] 1.5 PATCH/DELETE to a random UUID returns 404 (not 500) — 6f487dd
- [x] 1.6 PATCH with empty body / empty field / >1000-char field returns 400 — 6f487dd
- [x] 1.7 DELETE own card succeeds and the row is gone; repeat DELETE returns 404 — 6f487dd
- [x] 1.8 Unauthenticated PATCH/DELETE returns 401 — 6f487dd

### Phase 2: Interactive CardList island

#### Automated

- [x] 2.1 Type checking passes (`npx tsc --noEmit` / `npm run build`)
- [x] 2.2 Linting passes (`npm run lint`)
- [x] 2.3 Production build succeeds (`npm run build`)

#### Manual

- [x] 2.4 List renders as before (source label + date intact)
- [x] 2.5 Edit front+back, Save → in-place update, no reload; persists on reload
- [x] 2.6 Cancel mid-edit restores saved text; empty/>1000-char field disables Save
- [x] 2.7 Delete → Confirm removes card without reload; Cancel aborts; persists on reload
- [x] 2.8 Failed request shows inline error without dropping/duplicating the card
- [x] 2.9 No regression to empty / not-configured states; user sees only own cards
