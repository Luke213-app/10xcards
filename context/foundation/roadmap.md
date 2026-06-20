---
project: "10xCards"
version: 1
status: draft
created: 2026-06-19
updated: 2026-06-20
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: 10xCards

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline (2026-06-19).
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Authoring a flashcard deck by hand is slow enough that a time-poor professional upskiller abandons spaced repetition before the first review session. 10xCards collapses the authoring step: paste source text you already have, get usable candidate cards, gate them by hand, and start reviewing — short enough that motivation survives.

The product wedge — the one trait that, if removed, makes the product indistinguishable from a generic AI tool — is that cards are both **AI-generated from the learner's own pasted text** and **human-gated** (accept / edit / reject) before they land in the collection. The two success metrics (≥75% of AI cards accepted, ≥75% of all cards made via AI) measure exactly that wedge.

## North star

**S-01: A logged-in user pastes text, generates candidate cards, accepts/edits/rejects them, and saves the accepted ones** — this is the validation milestone because it is the only slice that exercises the core hypothesis (AI-generated, human-gated cards clear the ≥75% acceptance bar), and with `main_goal: speed` everything else is sequenced behind getting this loop in front of users.

> "North star" here means the smallest end-to-end slice whose successful delivery would prove the core product hypothesis — placed as early as its Prerequisites allow, because everything else only matters if this works.

## At a glance

| ID    | Change ID                     | Outcome (user can …)                                              | Prerequisites | PRD refs                       | Status   |
| ----- | ----------------------------- | ----------------------------------------------------------------- | ------------- | ------------------------------ | -------- |
| F-01  | flashcard-store-and-isolation | (foundation) per-user flashcard store with RLS data isolation     | —             | Access Control, Guardrails, NFR | ready    |
| S-01  | ai-card-generation            | paste text → generate candidates → accept/edit/reject → save      | F-01          | US-01, FR-003, FR-004, FR-005  | proposed |
| S-02  | manual-card-creation          | manually create a flashcard (front/back)                          | F-01          | FR-006                         | proposed |
| S-03  | browse-saved-cards            | browse their saved flashcard collection                           | F-01          | FR-007                         | proposed |
| S-04  | edit-delete-saved-cards       | edit and delete a saved flashcard                                 | S-03          | FR-008, FR-009                 | proposed |
| S-05  | srs-review-session            | start a review session and grade due cards to reschedule them     | F-01, S-01    | FR-010, FR-011                 | blocked  |
| S-06  | user-flow-improvements        | move through a coherent landing → dashboard → cards flow with consistent chrome & auth-aware routing | S-01, S-02, S-03 | NFR (usability), Access Control | ready    |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                  | Chain                      | Note                                                                       |
| ------ | ---------------------- | -------------------------- | -------------------------------------------------------------------------- |
| A      | Rdzeń AI (wedge)       | `F-01` → `S-01`            | The north-star path; everything else only matters once this proves out.    |
| B      | Zarządzanie kolekcją   | `S-02` / `S-03` → `S-04`   | Branches from `F-01` (joins Stream A at `F-01`); all three are management CRUD on the same store. |
| C      | Powtórki (SR)          | `S-05`                     | Joins Stream A at `S-01`; blocked on OQ-1 (which SR library) until that decision lands. |
| D      | Spójność UX (refinement) | `S-06`                   | Cross-cutting; lands after the feature slices it restyles (S-01/S-02/S-03). Not a vertical wedge — IA/navigation/visual polish over shipped pages. |

## Baseline

What's already in place in the codebase as of `2026-06-19` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 + React 19 + Tailwind 4 islands; shadcn/ui scaffold in `src/components/ui/` (auth components only so far).
- **Backend / API:** present — Astro SSR (`output: "server"`); only auth endpoints exist (`src/pages/api/auth/{signin,signup,signout}.ts`).
- **Data:** absent — `supabase/` holds config only (`schema_paths = []`); no migrations, no app tables. Only Supabase Auth's built-in `auth.users`.
- **Auth:** present — Supabase SSR cookie auth, `src/middleware.ts` with `PROTECTED_ROUTES`, KV-backed sessions; deployed and verified end-to-end in production. **This already satisfies FR-001 (register) and FR-002 (login/logout)** — no slice re-builds them.
- **Deploy / infra:** present — live on Cloudflare Workers (`https://10x-astro-starter.01-lukaszblonski.workers.dev`); GitHub Actions lint+build + Cloudflare Workers Builds auto-deploy on `master`.
- **Observability:** partial — Cloudflare `observability.enabled: true` (infra logs/traces); no app-level logging, error tracking, or metrics.

## Foundations

### F-01: Minimal per-user flashcard store with data isolation

- **Outcome:** (foundation) accepted/created cards persist in a per-user store with row-level-security isolation; a user can only ever read or write their own cards, and saved cards survive across devices.
- **Change ID:** flashcard-store-and-isolation
- **PRD refs:** Access Control; Guardrails (user-data isolation, no-data-loss); NFR (cards available from any device after login)
- **Unlocks:** S-01 (north star — somewhere to save accepted cards), S-02, S-03, S-05; reduces the standing risk that the two launch guardrails (isolation, no-data-loss) are bolted on late instead of designed into the store.
- **Prerequisites:** — (its only dependency, auth, is present in the Baseline)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sequenced first because every user-facing slice writes to this store; the load-bearing call is the RLS policy shape — get isolation wrong and the user-data-isolation guardrail fails silently. Kept minimal (a single flat card table + policies), not a full data layer, so vertical slices still exercise it end-to-end.
- **Status:** ready

## Slices

### S-01: Generate and save flashcards from pasted text

- **Outcome:** user can paste source text, request AI generation, review each candidate (accept / edit before accepting / reject), and save accepted cards to their collection; if generation returns nothing usable they see an explanatory state and can still create cards manually.
- **Change ID:** ai-card-generation
- **PRD refs:** US-01, FR-003, FR-004, FR-005, NFR (request acknowledged promptly + continuous progress past 2s under the edge runtime)
- **Prerequisites:** F-01
- **Parallel with:** S-02, S-03
- **Blockers:** —
- **Unknowns:**
  - OQ-2: Is there a source-text length bound for generation? — Owner: user. Block: no (plan with a sensible default cap; exact bound is a refinement).
  - OQ-4: Is pasted source text retained, and for how long? — Owner: user. Block: no (default to not persisting source text unless decided otherwise).
- **Risk:** This is the wedge and the riskiest quality bet (the ≥75% acceptance metric lives here); the LLM integration is introduced inside this slice rather than as a standalone foundation, and the >2s progress NFR must be honored against the Cloudflare edge runtime's long-task constraints (stream/chunk, don't block).
- **Status:** proposed

### S-02: Manually create a flashcard

- **Outcome:** user can manually author a flashcard (front and back) and save it to their collection — the fallback path when generation returns nothing usable.
- **Change ID:** manual-card-creation
- **PRD refs:** FR-006
- **Prerequisites:** F-01
- **Parallel with:** S-01, S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Low-risk write path against the F-01 store; main caution is keeping the manual-create form consistent with the shape S-01 saves accepted cards into, so the collection is homogeneous.
- **Status:** proposed

### S-03: Browse saved flashcards

- **Outcome:** user can browse their saved flashcard collection as a flat per-user list (with an empty state before any cards exist).
- **Change ID:** browse-saved-cards
- **PRD refs:** FR-007
- **Prerequisites:** F-01
- **Parallel with:** S-01, S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Read-only over the F-01 store; deferred deck/topic grouping (Non-Goals) keeps this a flat list, so the risk is only that "flat list" UX is assumed not to need pagination at MVP scale (target_scale: small data volume — acceptable).
- **Status:** proposed

### S-04: Edit and delete a saved flashcard

- **Outcome:** user can edit a saved card's front/back and delete a card from their collection, acting on a card selected from the browse list.
- **Change ID:** edit-delete-saved-cards
- **PRD refs:** FR-008, FR-009
- **Prerequisites:** S-03
- **Parallel with:** S-01, S-02
- **Blockers:** —
- **Unknowns:**
  - OQ-3: Delete vs suspend/archive semantics? — Owner: user. Block: no (MVP commits to hard-delete per FR-009; non-destructive suspend is the open refinement, not a planning blocker).
- **Risk:** Hard-delete discards a card's future SR history (relevant once S-05 lands); sequenced after S-03 because edit/delete act on a card the user selects from the browse list. Coupled as one slice because both are management actions on a saved card from the same view.
- **Status:** proposed

### S-05: Spaced-repetition review session

- **Outcome:** user can start a review session that surfaces due cards using a ready-made spaced-repetition algorithm, and grade each card so the algorithm reschedules its next appearance.
- **Change ID:** srs-review-session
- **PRD refs:** FR-010, FR-011
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-02, S-03, S-04
- **Blockers:** —
- **Unknowns:**
  - OQ-1: Which ready-made spaced-repetition algorithm/library? — Owner: user. Block: yes (the choice dictates the per-card scheduling state F-01 must store and the grade-scale shape FR-011 exposes; planning can't proceed coherently until it's picked).
- **Risk:** The payoff slice but blocked on the single most consequential open decision (OQ-1); kept out of the critical path under `main_goal: speed` until the library is chosen, because guessing the algorithm risks reworking both the schema and the grading UX.
- **Status:** blocked

### S-06: Coherent navigation, landing & dashboard refinement

- **Outcome:** user moves through a consistent landing → dashboard → cards experience: a redesigned marketing landing (auto-routing a logged-in visitor to the dashboard), a dashboard of clear action blocks (Learn → `/review`, Browse my cards → `/cards`, Create a deck → inert placeholder), and a `/cards` page that drops its ad-hoc header for a shared header + footer — with logout from anywhere returning to `/` and no orphaned/dead-end links.
- **Change ID:** user-flow-improvements
- **PRD refs:** NFR (product remains usable on mainstream desktop browsers); Access Control (unauthenticated visitor cannot reach app routes; auth-aware landing redirect). Visual target captured in `context/changes/user-flow-improvements/reference/`.
- **Prerequisites:** S-01, S-02, S-03 (it restyles the entry points to generation, manual create, and the card collection, plus the shared chrome around them)
- **Parallel with:** S-04, S-05 (independent — touches presentation/IA, not their write paths)
- **Blockers:** —
- **Unknowns:**
  - OQ-A: ✅ Resolved (2026-06-20) — "Sign up logs out" was a requirements error. Landing hard-redirects logged-in → `/dashboard`; "Sign up" is a plain link to `/auth/signup`; auth pages also redirect logged-in visitors to `/dashboard`.
  - OQ-B: Post-redesign home for "Generate" / "Add manually" entry points. Owner: user. Block: no (default: surface from the shared header + keep `/cards` empty-state CTAs).
- **Risk:** Low product risk (no new capability, no schema/data change), but it is the connective tissue every user sees — the load-bearing move is extracting **one** shared authenticated header/footer (today `Topbar.astro` is landing-only and each page hand-rolls nav) and rerouting through it without orphaning `/generate` and `/cards/new`. The "Create a deck" block stays an inert placeholder, honoring the parked *deck grouping* Non-Goal rather than smuggling deck logic in.
- **Status:** ready

## Backlog Handoff

| Roadmap ID | Change ID                     | Suggested issue title                                  | Ready for `/10x-plan` | Notes |
| ---------- | ----------------------------- | ------------------------------------------------------ | --------------------- | ----- |
| F-01       | flashcard-store-and-isolation | Per-user flashcard store with RLS isolation            | yes                   | Run `/10x-plan flashcard-store-and-isolation` — unlocks the north star |
| S-01       | ai-card-generation            | Generate & save flashcards from pasted text            | no                    | Waits on F-01; resolve OQ-2/OQ-4 defaults during planning |
| S-02       | manual-card-creation          | Manual flashcard creation                              | no                    | Waits on F-01 |
| S-03       | browse-saved-cards            | Browse saved flashcards                                | no                    | Waits on F-01 |
| S-04       | edit-delete-saved-cards       | Edit & delete saved flashcards                         | no                    | Waits on S-03 |
| S-05       | srs-review-session            | Spaced-repetition review session                       | no                    | Blocked on OQ-1 (SR library choice) — not plannable until resolved |
| S-06       | user-flow-improvements        | Coherent navigation, landing & dashboard refinement    | yes                   | OQ-A resolved; OQ-B has a sensible default. Run `/10x-research user-flow-improvements` → `/10x-plan` |

This table is the clean handoff to Jira/Linear or any MCP-backed backlog. One row per `F-NN` / `S-NN`; it does not duplicate the detailed roadmap body.

## Open Roadmap Questions

1. **Which ready-made spaced-repetition algorithm/library?** — Owner: user. Block: S-05 (the single decision that unblocks the review payoff).
2. **Is there a source-text length bound for AI generation?** — Owner: user. Block: refinement to S-01 (not blocking — plan with a default cap).
3. **Delete vs suspend/archive semantics for cards?** — Owner: user. Block: refinement to S-04 (MVP commits to hard-delete).
4. **Source-text retention/privacy commitment?** — Owner: user. Block: refinement to S-01 (default to not retaining pasted text unless decided otherwise).

## Parked

- **Custom spaced-repetition algorithm** — Why parked: PRD Non-Goals (integrate a ready-made one, do not build a scheduler).
- **Multi-format import (PDF/DOCX/URL)** — Why parked: PRD Non-Goals (paste-only source in v1).
- **Deck sharing / collaboration** — Why parked: PRD Non-Goals (every collection private, single-owner).
- **Native mobile app** — Why parked: PRD Non-Goals (web only for MVP).
- **Deck / folder / tag grouping** — Why parked: PRD Non-Goals (single flat per-user collection in v1).
- **Third-party platform integrations** — Why parked: PRD Non-Goals.
- **Repeat-review retention as a tracked metric** — Why parked: PRD Secondary success criteria (candidate nice-to-have, not committed for MVP); deprioritized further under `main_goal: speed`.
- **App-level observability (error tracking / metrics)** — Why parked: not a PRD requirement; baseline already has Cloudflare infra logs. Add only if a launch incident forces it.

## Done

(Empty on first generation. `/10x-archive` appends an entry here — and flips that item's `Status` to `done` — when a change whose `Change ID` matches the item is archived. Do NOT pre-populate.)
