---
change_id: ai-card-generation
title: Generate and save flashcards from pasted text
status: implementing
created: 2026-06-19
updated: 2026-06-19
archived_at: null
---

## Notes

Roadmap slice **S-01** (north star). Outcome: a logged-in user pastes source text, requests AI generation, reviews each candidate (accept / edit before accepting / reject), and saves accepted cards to their collection; if generation returns nothing usable they see an explanatory state and can still create cards manually.

- **Prerequisites:** F-01 (`flashcard-store-and-isolation`) — the per-user RLS store accepted cards save into.
- **PRD refs:** US-01, FR-003, FR-004, FR-005, NFR (request acknowledged promptly + continuous progress past 2s under the edge runtime).
- **Why it matters:** this is the product wedge and the riskiest quality bet — the ≥75% acceptance metric lives here. LLM integration is introduced inside this slice, not as a standalone foundation.
- **Edge-runtime constraint:** Cloudflare Workers limits long-running tasks; the >2s progress NFR must be honored by streaming/chunking generation, not blocking.

Open questions to resolve during planning (neither blocks):
- OQ-2: source-text length bound for generation — plan with a sensible default cap; exact bound is a refinement.
- OQ-4: is pasted source text retained, and for how long? — default to NOT persisting source text unless decided otherwise.

### Decisions carried from 2026-06-19 planning session (S-01 paused pending F-01)

S-01 planning was paused so F-01 (`flashcard-store-and-isolation`) is planned/shipped first — the save step depends on its table + RLS contract. Decisions already made for S-01, to fold into its plan when resumed:

- **Dependency:** build on F-01's `flashcards` table + `src/lib/services/flashcards.ts`; AI-accepted cards use `source: "ai-full"`, edited-then-accepted use `source: "ai-edited"`.
- **Delivery (NFR >2s):** single JSON POST that awaits full generation; React island shows instant acknowledgement then an animated progress state past 2s (Workers bills CPU not wall-clock, so the long await is free; avoids workerd streaming-parity risk).
- **AI provider/model:** call OpenRouter via `fetch`; model id read from an env var (e.g. `OPENROUTER_MODEL`) defaulting to a fast, cheap, structured-output-capable model. Add `OPENROUTER_API_KEY` to `astro.config.mjs` env.schema + `.env`/`.dev.vars`/`wrangler secret`.

Still to decide when S-01 resumes: review/accept-edit-reject UX details, empty/error states, source-text cap value (OQ-2) and zod validation of model output.
