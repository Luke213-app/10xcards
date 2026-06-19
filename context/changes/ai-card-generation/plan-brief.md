# AI Card Generation (S-01) — Plan Brief

> Full plan: `context/changes/ai-card-generation/plan.md`

## What & Why

Build the north-star slice: a logged-in user pastes source text, the app calls an LLM to produce candidate flashcards, and the user accepts / edits-then-accepts / rejects each, saving accepted cards to their collection. This is the product wedge — the ≥75%-acceptance success metric lives here — and it introduces the first LLM integration (OpenRouter) inside the slice itself.

## Starting Point

F-01 already shipped the persistence floor: the `public.flashcards` table with RLS, the `flashcard_source` enum (`ai-full`/`ai-edited`/`manual`), the `src/types.ts` DTOs, and `createFlashcard(client, cmd)` in `src/lib/services/flashcards.ts`. Auth, the SSR Supabase client, the middleware route-gate, the API-route pattern, and the `.astro`-renders-React-island pattern are all in place. Missing: `zod` (not installed), any OpenRouter wiring, and all generate/review code.

## Desired End State

At `/generate` (auth-gated) a user pastes ≤10,000 chars, clicks Generate, gets instant acknowledgement + visible progress, and sees ≤10 candidate cards in an inline list. They edit any card in place, accept it (persists immediately as `ai-full` or `ai-edited`), or reject it (disappears). Empty generation shows an explanatory state with an inline manual-create fallback; errors show a friendly Retry that keeps the pasted text. Lint, typecheck, and build pass.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| AI provider & delivery | OpenRouter via `fetch`; single JSON POST awaiting full generation | Workers bills CPU not wall-clock, so the long await is free and avoids streaming-parity risk. | Change.md |
| Model config | `OPENROUTER_MODEL` + `OPENROUTER_API_KEY` env secrets | Mirrors the existing `SUPABASE_*` `astro:env/server` pattern; model swappable without code change. | Change.md |
| Review UX | Inline list, edit-in-place, per-card Accept/Reject | Everything visible at once; matches the repo's simple form-island style; fastest to build. | Plan |
| Save timing | Save each card immediately on accept | No triage work lost mid-session; one validated write path. | Plan |
| Input cap (OQ-2) | ~10,000 chars, soft (counter) + hard (zod) | Bounds LLM cost/latency, fits a few pages of notes; enforced client + server. | Plan |
| Card count | Model decides, server clamps to ≤10 | Count tracks the text; no UI control to build; zod caps defensively. | Plan |
| Empty/error | Distinct states + inline manual-create fallback | Satisfies US-01's "explanatory state, still create manually" AC; separates user-fixable vs system errors. | Plan |
| Source-text retention (OQ-4) | Never persisted (ephemeral) | Privacy-safe default; zero schema/retention surface. | Change.md / Plan |
| Validation library | Add `zod` | CLAUDE.md mandates it; also parses untrusted LLM output. | Plan |

## Scope

**In scope:** `zod` dep + OpenRouter env wiring; zod schemas + DTO types; OpenRouter generation service; `POST /api/generate` and `POST /api/flashcards` (serves accept-save + manual fallback); gated `/generate` page; React review island with paste/progress/inline-edit/empty/error/manual states.

**Out of scope:** browse list (S-03), edit/delete saved cards (S-04), SR fields/review (S-05), source-text persistence, streaming, user-controlled card count, bulk save-all, deck/tag grouping, a test runner.

## Architecture / Approach

Bottom-up, contract-first. **Phase 1** builds the backend (env, zod schemas, OpenRouter service, two JSON endpoints) — curl-testable before any UI. **Phase 2** builds the page + island that consume it. `/api/generate` is DB-read-only (ephemeral source); a single `/api/flashcards` write path serves both accept-save and manual-create, differing only by the `source` value. `ai-full`-vs-`ai-edited` is decided client-side by comparing each accepted card to its original generated values.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backend | `zod` + env wiring, zod schemas, OpenRouter service, `/api/generate` + `/api/flashcards` | LLM returns malformed/unparseable output — mitigated by zod-parsing + clamp/drop, never 500 the whole call |
| 2. Frontend | gated `/generate` page + review island (paste→progress→inline review→empty/error/manual) | >2s progress NFR is a client concern; a frozen button fails it — island must show continuous progress for the full await |

**Prerequisites:** F-01 shipped (done); local Supabase running; a real `OPENROUTER_API_KEY` in `.env`/`.dev.vars`.
**Estimated effort:** ~1–2 sessions across 2 phases.

## Open Risks & Assumptions

- Generation quality drives the ≥75% acceptance metric but can't be verified in-plan — only after real use; the prompt is the lever and may need iteration.
- The 10,000-char cap and ≤10-card clamp are defaults; either may need tuning (single-point changes).
- Assumes a single full `await` stays within Workers limits for a 10k-char prompt (CPU-billed); if a model is slow this is the place to revisit streaming.
- Assumes the chosen default model reliably emits JSON via `response_format`; the service must defend against prose-wrapped output.

## Success Criteria (Summary)

- A signed-in user can paste text, generate, and save accepted cards that land in their own collection with correct `source` tagging (`ai-full` vs `ai-edited`).
- The manual fallback and empty/error states behave per US-01; unauthenticated access is redirected.
- Lint, typecheck, and build pass; no regression to auth/dashboard.
