---
change_id: user-flow-improvements
title: User flow improvements
status: planned
created: 2026-06-20
updated: 2026-06-20
archived_at: null
---

## Notes

Cross-cutting UX/IA refinement layered on already-shipped feature slices (S-01…S-05).
Adds **no new FR** — traces to PRD **NFR (desktop usability)** + **Access Control (auth-gated routing)**.
Registered on the roadmap as **S-06** (see `context/foundation/roadmap.md`).

Visual reference (captured 2026-06-20 from `cognito-zen-study.lovable.app`, "Recall"):
- `reference/ref-landing.png` — target landing
- `reference/ref-dashboard.png` — target dashboard (also the header/footer source for `/cards`)

## Scope / Requirements

### R1 — Landing page (`/`, currently `src/components/Welcome.astro`)
- Restyle to match `ref-landing.png`: badge "Free & open source", H1 "Remember everything you learn." (gradient accent word), subtitle, three feature cards (Active recall / Spaced repetition / It's for free), shared header with logo + "Sign in" (link) + "Sign up" (button). Drop the current "10x Astro Starter" copy and the starter feature cards.
- **Auth-aware:** if the visitor is already logged in, redirect to `/dashboard` (today `/` is unprotected and never redirects — new behavior).
- "Sign in" → `/auth/signin` (already the case).
- "Sign up" → `/auth/signup` (plain link). *The earlier "log out first" was a mistake in the requirements — removed (see OQ-A, resolved).*

### R2 — Dashboard (`/dashboard`, `src/pages/dashboard.astro`)
- Restyle to match `ref-dashboard.png`: shared header (logo + nav Learn / Cards / New deck `SOON` / Account), H1 "What are you up to today?", three action blocks, shared footer (© + Source).
- Block "I want to Learn" → `/review`.
- Block "Browse my cards" → `/cards`. (Reference labels this block "Create a card"; we remap it to browsing per request.)
- Block "Create a deck" → placeholder / "Coming soon", non-clickable. Traces to the parked Non-Goal *deck grouping* — keep it inert, do not build deck logic.
- Replace the current ad-hoc 4-link button row + inline sign-out.

### R3 — Cards page (`/cards`, `src/pages/cards/index.astro`)
- Remove the current header ("My cards / Your saved flashcard collection, {email}") and its link row (Review / Add manually / Generate / Dashboard).
- Adopt the **same shared header + footer** as the dashboard.
- Keep the existing list / empty-state / RLS-scoped fetch behavior untouched — this is chrome only.

### R4 — Cross-cutting navigation & logout
- **Logout from any page → `/`** (`src/pages/api/auth/signout.ts` already redirects to `/`; the work is exposing a logout control on every page via the shared header / Account menu — `/cards` currently has none).
- **Introduce one shared authenticated header + footer component** used by `/dashboard` and `/cards` (and, for coherence, `/generate`, `/review`, `/cards/new`). Today `Topbar.astro` is landing-only and each page hand-rolls its own nav.
- **Wire orphaned links** so every reachable page has a sensible way in and out. After R2 drops the dashboard's direct "Generate" / "Add manually" links, ensure `/generate` and `/cards/new` remain reachable (e.g. from the shared header or from `/cards`) — they must not become dead-ends.

## Open Questions

- **OQ-A — RESOLVED (2026-06-20):** "Sign up logs out first" was a mistake in the original requirements. Decision: landing **hard-redirects** a logged-in visitor to `/dashboard`; "Sign up" is a **plain link** to `/auth/signup` (no logout). For consistency, `/auth/signin` and `/auth/signup` also redirect an already-logged-in visitor to `/dashboard` (inferred default, low-stakes — flag if unwanted).
- **OQ-B — RESOLVED (2026-06-20):** Creation is consolidated. A floating **"Add card"** button on `/cards` opens `/generate`, which gains an **AI / Manual toggle (default AI)**; `/cards/new` redirects to `/generate?mode=manual`. Dashboard stays the 3-block hub (creation reached via Browse my cards → `/cards` → Add card). Shared header also carries an "Add card" entry. See `plan.md` Phase 5–6.

## Methodology trail

`/10x-new` ✅ → requirements (this file) ✅ → roadmap S-06 ✅ → OQ-A resolved ✅ → `/10x-research` ✅ (`research.md`) → `/10x-plan` ✅ (`plan.md` + `plan-brief.md`, OQ-B resolved) → **next:** `/10x-implement user-flow-improvements phase 1`.
