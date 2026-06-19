# AI Card Generation (S-01) Implementation Plan

## Overview

Build the north-star vertical slice (roadmap **S-01**): a logged-in user pastes source text, requests AI generation, reviews each candidate card (accept / edit-then-accept / reject), and saves accepted cards into the F-01 store. This is the product wedge — the ≥75% acceptance metric lives here — and it introduces the first LLM integration (OpenRouter) inside the slice rather than as a standalone foundation.

The persistence half is already shipped by F-01 (`public.flashcards` table + RLS, `src/types.ts`, `src/lib/services/flashcards.ts`). This plan adds the two missing halves: a backend that turns text into candidates and persists accepted cards, and a React island that drives paste → generate → review → save.

## Current State Analysis

What exists and is reused as-is:

- **Store (F-01, shipped):** `public.flashcards` with RLS, the `flashcard_source` enum (`ai-full` / `ai-edited` / `manual`), and `src/lib/services/flashcards.ts` exposing `createFlashcard(client, cmd)` where `cmd: CreateFlashcardCommand = { front, back, source }`. `user_id` defaults to `auth.uid()` server-side, so the service never needs the user id. Both `front` and `back` carry a DB CHECK: non-empty after trim, ≤ 1000 chars.
- **Types (F-01, shipped):** `src/types.ts` has `Flashcard`, `FlashcardSource`, `CreateFlashcardCommand`, `UpdateFlashcardCommand`. Generated DB types live in `src/db/database.types.ts`.
- **Auth & client:** `src/lib/supabase.ts` `createClient(headers, cookies)` returns the request-scoped SSR client (or `null` if secrets are unset). `src/middleware.ts` resolves `context.locals.user` every request and redirects unauthenticated hits to any `PROTECTED_ROUTES` prefix (currently only `/dashboard`). `App.Locals.user` is typed in `src/env.d.ts`.
- **API route pattern:** existing routes (`src/pages/api/auth/*.ts`) export `const POST: APIRoute`, build the client with `createClient(context.request.headers, context.cookies)`, and `null`-guard it. They are form-redirect endpoints; the new endpoints will instead be JSON request/response.
- **Island pattern:** an `.astro` page imports a React component and renders it with `client:load` (`src/pages/auth/signin.astro` → `SignInForm`). Form sub-components (`FormField`, `SubmitButton`, `ServerError`) live in `src/components/auth/` and use `lucide-react` icons and Tailwind.
- **Env pattern:** secrets are declared in `astro.config.mjs` `env.schema` (`access: "secret"`, `optional: true`) and read via `astro:env/server`.

What is missing (this plan adds it):

- `zod` is **not** in `package.json`, despite CLAUDE.md mandating it for API input validation. This slice adds it and uses it for both request validation and parsing the LLM's structured output.
- No OpenRouter wiring (no env vars, no service).
- No generation or card-create API routes, no generate page, no review UI.

### Key Discoveries

- `createFlashcard` already does exactly the save step S-01 needs — no service changes required (`src/lib/services/flashcards.ts:30`).
- `user_id DEFAULT auth.uid()` + RLS means endpoints never accept or trust a client-supplied user id (`supabase/migrations/20260619185620_create_flashcards.sql:15`).
- DB CHECK constraints (`≤ 1000` chars, non-empty) are the backstop; zod should mirror them so the user gets a clean 400 instead of a raw Postgres error (`...create_flashcards.sql:16-17`).
- Workers bills CPU, not wall-clock, so a single `await` of the full OpenRouter call is acceptable for the >2s NFR — the island carries the "continuous progress" requirement, not the server (decision in `change.md`).
- API routes are server-rendered under `output: "server"`; this plan still sets `export const prerender = false` explicitly per CLAUDE.md.

## Desired End State

A signed-in user visits `/generate`, pastes up to 10,000 characters, and clicks Generate. They get an instant acknowledgement and visible progress; within a few seconds they see up to 10 candidate cards in an inline list. They can edit any card's front/back in place, accept a card (it persists immediately to their collection, tagged `ai-full` or `ai-edited`), or reject it (it disappears). If generation yields nothing usable they see an explanatory empty state with an inline manual-create option; if it errors they see a friendly message with Retry and their pasted text intact. Unauthenticated users are redirected to sign-in. Lint, typecheck, and build pass.

Verify by: signing in, generating from a paragraph, editing+accepting one card and accepting another unedited, confirming both appear in the DB with correct `source` values and `user_id`, rejecting a card, and exercising the empty/error/manual-fallback paths.

## What We're NOT Doing

- No browse/list view of saved cards (that's S-03) — this slice only confirms saves via the DB/Studio, not a collection UI.
- No edit/delete of *already-saved* cards (S-04). Inline editing here is pre-save only.
- No SR/scheduling fields or review session (S-05 / OQ-1).
- No source-text persistence anywhere — server or browser (OQ-4: ephemeral).
- No streaming/chunked generation, no per-card regeneration, no user-controlled card count.
- No bulk "save all accepted" — saves are per-card on accept.
- No new test runner (none configured; speed goal).
- No deck/tag grouping (PRD non-goal).

## Implementation Approach

Bottom-up, contract-first, in two phases. Phase 1 builds and proves the backend (env, zod schemas, OpenRouter service, two JSON endpoints) so it is curl-testable before any UI depends on it. Phase 2 builds the React island and page that consume those endpoints.

A single `POST /api/flashcards` endpoint serves **both** the accept-save action and the manual-create fallback (the only difference is the `source` value in the body), keeping one validated write path. `POST /api/generate` is read-only with respect to the DB — it never persists, honoring the ephemeral-source decision.

## Critical Implementation Details

- **`ai-full` vs `ai-edited` detection** is decided client-side: the island keeps each candidate's original generated `front`/`back`; on accept, if either field differs from the original the card is saved as `ai-edited`, otherwise `ai-full`. The endpoint trusts the `source` in the body (it's already constrained to the enum by zod) — it does not try to re-derive edit state.
- **Progress past 2s is a client responsibility.** The server awaits the full OpenRouter call and returns once. The island must show an instant pending state on submit and an animated/indeterminate progress indicator that persists for the whole await — never a frozen button.
- **zod must mirror DB CHECKs** (front/back: trimmed non-empty, ≤ 1000) so invalid candidates fail as a clean 400 before hitting Postgres.
- **LLM output is untrusted.** Parse the model response through a zod schema and clamp the array to 10; drop any item failing the front/back constraints rather than 500-ing the whole request. If zero valid items remain, return an empty candidate list (the empty state), not an error.

## Phase 1: Backend — config, schemas & endpoints

### Overview

Add the dependency and env wiring, the zod schemas and DTO types, the OpenRouter generation service, and the two JSON API routes. End state: both endpoints work via curl against the local dev server with a valid session cookie.

### Changes Required

#### 1. Dependency

**File**: `package.json`

**Intent**: Add `zod` as a runtime dependency for request and LLM-output validation.

**Contract**: `zod` appears in `dependencies`; `npm install` run so the lockfile updates. No version pin beyond the latest 3.x.

#### 2. Environment schema

**File**: `astro.config.mjs`, `.env`, `.dev.vars`

**Intent**: Declare the OpenRouter secret and model id so they're readable via `astro:env/server`, mirroring the existing `SUPABASE_*` pattern.

**Contract**: Add to `env.schema`: `OPENROUTER_API_KEY` (`context: "server", access: "secret", optional: true`) and `OPENROUTER_MODEL` (`context: "server", access: "secret", optional: true`). Add both keys to `.env` and `.dev.vars` (gitignored) with a real key locally and a sensible default model id. Document that production needs `wrangler secret put OPENROUTER_API_KEY` (and `OPENROUTER_MODEL`).

#### 3. DTO types

**File**: `src/types.ts`

**Intent**: Add the request/response shapes the generate flow exchanges, alongside the existing flashcard types.

**Contract**: `GenerateRequest { sourceText: string }`; `FlashcardCandidate { front: string; back: string }`; `GenerateResponse { candidates: FlashcardCandidate[] }`. Reuse the existing `CreateFlashcardCommand` for the save endpoint body. No code, routine additions.

#### 4. Zod schemas

**File**: `src/lib/schemas/flashcards.ts` (new)

**Intent**: Centralize validation for the generate request, the LLM output, and the card-create body so both endpoints share one source of truth that mirrors the DB constraints.

**Contract**: Export `generateRequestSchema` (`sourceText`: trimmed, non-empty, max 10000), `createFlashcardSchema` (`front`/`back`: trimmed non-empty, ≤ 1000; `source`: enum `ai-full | ai-edited | manual`), and `llmCandidatesSchema` (array of `{ front, back }` with the same front/back rules; `.catch`/filter semantics so malformed items are dropped and the array is clamped to 10). The 10000 and 1000 bounds must match the input cap decision and the DB CHECK respectively.

#### 5. OpenRouter generation service

**File**: `src/lib/services/openrouter.ts` (new)

**Intent**: Encapsulate the OpenRouter call: build the prompt that extracts testable Q/A cards from source text, request structured JSON output, and return validated candidates. Keep it framework-agnostic (takes text + config, returns `FlashcardCandidate[]`), so the endpoint stays thin.

**Contract**: `generateCandidates(sourceText: string, opts: { apiKey: string; model: string }): Promise<FlashcardCandidate[]>`. Calls `https://openrouter.ai/api/v1/chat/completions` via `fetch` with `Authorization: Bearer <apiKey>`, the configured model, a system prompt instructing "extract up to 10 testable flashcards, return JSON", and `response_format` JSON. Parses the assistant message through `llmCandidatesSchema`. Throws a typed error on non-2xx / network failure / unparseable output (the endpoint maps this to a 502). Snippet warranted only for the `response_format` / JSON-extraction shape if the model wraps output in prose — handle by extracting the JSON payload before zod.

#### 6. Generate endpoint

**File**: `src/pages/api/generate.ts` (new)

**Intent**: Auth-gate, validate the paste, call the generation service, and return candidates as JSON. Never touches the DB (ephemeral source).

**Contract**: `export const prerender = false`; `export const POST: APIRoute`. Returns 401 if `context.locals.user` is null; 400 with zod error detail on bad input; reads `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` from `astro:env/server` and returns 503 if the key is missing; calls `generateCandidates`; returns `200 { candidates }` (possibly empty); maps a service throw to `502 { error }`. JSON in, JSON out (not formData).

#### 7. Card-create endpoint

**File**: `src/pages/api/flashcards.ts` (new)

**Intent**: One validated write path used by both accept-save and manual-create. Persists a single card via the existing service under the caller's RLS.

**Contract**: `export const prerender = false`; `export const POST: APIRoute`. 401 if no user; builds the client via `createClient(...)` and 503 if null; validates body with `createFlashcardSchema`; calls `createFlashcard(client, cmd)`; returns `201 { flashcard }` or `400`/`500` on validation/DB error. The endpoint does not set or accept `user_id`.

### Success Criteria

#### Automated Verification

- Dependency installs: `npm install` succeeds and `zod` is in `package.json`
- Type checking passes: `npx astro check` (or `npm run build`)
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification

- With a valid local session cookie, `POST /api/generate` with a paragraph returns a JSON `candidates` array (≤ 10, each with non-empty front/back)
- `POST /api/generate` with no/short text returns 400; with >10000 chars returns 400
- `POST /api/generate` unauthenticated returns 401
- `POST /api/flashcards` with a valid body creates a row in `public.flashcards` with the correct `user_id` (via Studio) and returns 201; invalid body returns 400
- With `OPENROUTER_API_KEY` unset, `/api/generate` returns 503 (not a crash)

**Implementation Note**: After automated verification passes, pause for manual confirmation (curl/Studio checks above) before starting Phase 2.

---

## Phase 2: Frontend — generate page & review island

### Overview

Add the gated `/generate` page and the React island that drives the whole flow: paste with a live cap, generate with progress, inline-editable candidate review with per-card accept/reject, and distinct empty/error states with a manual-create fallback.

### Changes Required

#### 1. Route gating

**File**: `src/middleware.ts`

**Intent**: Require auth for the generate page.

**Contract**: Add `"/generate"` to `PROTECTED_ROUTES`. Routine, no snippet.

#### 2. Generate page

**File**: `src/pages/generate.astro` (new)

**Intent**: Server-rendered shell that mounts the review island, matching the `signin.astro` layout pattern.

**Contract**: Imports `Layout` and the island, renders the island with `client:load`. May read `Astro.locals.user` for a greeting but gating is handled by middleware. No props needed (the island owns all state). Optionally add a nav link from `/dashboard`.

#### 3. Review island

**File**: `src/components/generate/GenerateView.tsx` (new), plus small sibling components as needed (e.g. `CandidateCard.tsx`)

**Intent**: The single interactive surface. Owns state machine: `idle → generating → review | empty | error`. Drives generation and per-card saves against the Phase 1 endpoints.

**Contract**: Behavior, not signatures —
- **Paste**: a textarea with a live character counter; warn as it nears 10,000, disable Generate past it (hard cap mirrors server zod). Source text held only in component state (ephemeral).
- **Generate**: on submit, set `generating` immediately (instant ack) and show an animated/indeterminate progress indicator for the full `POST /api/generate` await. On success with candidates → `review`; success with empty array → `empty`; throw/non-2xx → `error` (preserve the pasted text).
- **Review (inline edit-in-place)**: render candidates as a vertical list; each card has editable `front`/`back` fields, an Accept and a Reject button. Track each candidate's original generated values. Reject removes it from the list (no request). Accept derives `source` (`ai-edited` if front or back changed from original, else `ai-full`) and `POST`s `CreateFlashcardCommand` to `/api/flashcards`; on success mark the card saved/remove it; on failure show a per-card error and allow retry. Saving is per-card and immediate.
- **Empty state**: explanatory message ("no usable cards from this text") plus an inline manual-create form (front/back) that `POST`s to `/api/flashcards` with `source: "manual"` — satisfies US-01's manual fallback.
- **Error state**: friendly message + Retry button that re-submits with the still-present pasted text.
- Reuse existing primitives where natural (`Button` from `src/components/ui/button.tsx`, `lucide-react` icons, `cn()` for classes). No new shadcn components required by the inline-edit choice.

### Success Criteria

#### Automated Verification

- Type checking passes: `npx astro check` (or `npm run build`)
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification

- Visiting `/generate` while signed out redirects to `/auth/signin`
- Pasting text and generating shows an instant pending state and continuous progress until candidates render
- The character counter warns near 10,000 and Generate is disabled past the cap
- Accepting an unedited card saves it as `ai-full`; editing then accepting saves as `ai-edited` (verify `source` in Studio)
- Rejecting a card removes it with no DB write
- Forcing zero candidates shows the empty state and the manual-create form successfully saves a `manual` card
- Forcing an API error (e.g. unset key) shows the error state with Retry and the pasted text preserved
- No regression to existing auth/dashboard flows

**Implementation Note**: After automated verification passes, pause for manual confirmation of the flows above before considering the slice done.

---

## Testing Strategy

### Manual Testing Steps

1. Sign in; navigate to `/generate`.
2. Paste a ~2 paragraph technical note; click Generate; observe instant ack + progress; candidates render (≤10).
3. Accept one card unedited → confirm `ai-full` row in Studio with your `user_id`.
4. Edit another card's back, then accept → confirm `ai-edited` row.
5. Reject a card → confirm no new row.
6. Paste gibberish / force empty → confirm empty state; use manual-create form → confirm `manual` row.
7. Unset `OPENROUTER_API_KEY`, generate → confirm error state + Retry preserves text.
8. Sign out; hit `/generate` → confirm redirect to sign-in.
9. As a second user, confirm only your own cards are visible in Studio (RLS already proven in F-01, spot-check only).

There is no test runner configured; verification is manual plus lint/typecheck/build, consistent with F-01.

## Performance Considerations

- Single `await` of the OpenRouter call is acceptable on Workers (CPU-billed, not wall-clock). The 10,000-char cap bounds prompt size, cost, and latency.
- Candidate array clamped to 10 server-side keeps the response and the rendered list small (target_scale: small data volume).
- Per-card saves are small individual writes; at MVP scale no batching needed.

## Migration Notes

No schema changes — F-01's table and `flashcard_source` enum already cover every `source` value this slice writes. No data migration.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-01)
- Change identity & carried decisions: `context/changes/ai-card-generation/change.md`
- Store this builds on: `context/changes/flashcard-store-and-isolation/plan.md`, `src/lib/services/flashcards.ts:30`, `supabase/migrations/20260619185620_create_flashcards.sql`
- Patterns to mirror: `src/pages/api/auth/signin.ts` (API route), `src/pages/auth/signin.astro` + `src/components/auth/SignInForm.tsx` (island), `astro.config.mjs` (env schema)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend — config, schemas & endpoints

#### Automated

- [x] 1.1 Dependency installs: `npm install` succeeds and `zod` is in `package.json`
- [x] 1.2 Type checking passes: `npx astro check` (or `npm run build`)
- [x] 1.3 Linting passes: `npm run lint`
- [x] 1.4 Production build succeeds: `npm run build`

#### Manual

- [x] 1.5 `POST /api/generate` with a paragraph returns a JSON `candidates` array (≤10, non-empty front/back)
- [x] 1.6 `POST /api/generate` returns 400 on empty/short and on >10000 chars
- [x] 1.7 `POST /api/generate` unauthenticated returns 401
- [x] 1.8 `POST /api/flashcards` with a valid body creates a correctly-owned row and returns 201; invalid returns 400
- [x] 1.9 With `OPENROUTER_API_KEY` unset, `/api/generate` returns 503 (no crash)

### Phase 2: Frontend — generate page & review island

#### Automated

- [ ] 2.1 Type checking passes: `npx astro check` (or `npm run build`)
- [ ] 2.2 Linting passes: `npm run lint`
- [ ] 2.3 Production build succeeds: `npm run build`

#### Manual

- [ ] 2.4 `/generate` while signed out redirects to `/auth/signin`
- [ ] 2.5 Generate shows instant pending + continuous progress until candidates render
- [ ] 2.6 Character counter warns near 10,000 and Generate is disabled past the cap
- [ ] 2.7 Unedited accept saves `ai-full`; edit-then-accept saves `ai-edited` (verified in Studio)
- [ ] 2.8 Reject removes a card with no DB write
- [ ] 2.9 Empty state shows and the manual-create form saves a `manual` card
- [ ] 2.10 Error state shows Retry and preserves pasted text
- [ ] 2.11 No regression to existing auth/dashboard flows
