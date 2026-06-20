# User Flow Improvements (S-06) — Plan Brief

> Full plan: `context/changes/user-flow-improvements/plan.md`
> Research: `context/changes/user-flow-improvements/research.md`
> Requirements + visual targets: `change.md`, `reference/ref-landing.png`, `reference/ref-dashboard.png`

## What & Why

A cross-cutting UX/IA refinement over the already-shipped feature slices (S-01…S-05): introduce one shared authenticated chrome, restyle the landing / dashboard / cards pages toward the "Recall" reference, make routing auth-aware, and consolidate card creation behind a single AI/Manual toggle. The product works but its connective tissue is incoherent — every page hand-rolls a different header, there is no footer, and creation entry points are fragile.

## Starting Point

No shared chrome exists: `Layout.astro` is a bare shell, `Topbar.astro` is landing-only, and the four authed pages each hand-roll a divergent header link row with no footer and duplicated sign-out. `/` never redirects logged-in users. AI generation, manual creation, browsing, and review all exist and work — only their navigation/presentation layer is being changed. No test runner is configured.

## Desired End State

A logged-in user lands on a dashboard of clear action blocks (Learn / Browse / Create-a-deck-placeholder) with a footer; every other authed page wears a shared header (brand · Dashboard · Learn · Cards · Add card) and the same footer (© · Source · Sign out). Card creation is one consolidated surface — a floating "Add card" on `/cards` opens `/generate` with an AI/Manual toggle (AI default). The logged-out landing is a Recall-style marketing page; logged-in visitors are redirected to the dashboard.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Landing redirect / "Sign up" | Hard redirect logged-in → `/dashboard`; "Sign up" = plain link | "Sign up logs out" was a requirements error; redirect covers the only real case | Frame (OQ-A) |
| Chrome scope | Shared header on cards/generate/review; **dashboard = footer only** | User chose the dashboard as a header-less hub of action blocks | Plan |
| Sign-out placement | In the shared footer (present on every authed page) | A header-less dashboard still needs a reachable logout | Plan |
| Creation entry (OQ-B) | Floating "Add card" on `/cards` → `/generate` with AI/Manual toggle (AI default); `/cards/new` redirects in | Consolidate the fragile creation entry points into one surface | Plan |
| Display font | Stay on Astro's system sans | Match layout + color, avoid a net-new font dependency | Plan |
| Sign-in success target | Redirect to `/dashboard` (not `/`) | Removes the `/`→`/dashboard` double hop | Plan |
| UI primitives | Extract a minimal set (Badge/Pill, Panel, CTA) | Stop the copy-pasted utility-string sprawl; keep chrome DRY | Plan |
| Redirect mechanism | Centralize in `middleware.ts` (exact `/`, explicit auth pair) | Matches existing route-gating; avoids trapping `/auth/confirm-email` | Research |

## Scope

**In scope:** shared `AppHeader`/`AppFooter` + minimal UI primitives; auth-aware redirects + sign-in target; landing, dashboard, cards restyle; `/generate` AI/Manual toggle; `/cards` "Add card" FAB; `/cards/new` → redirect; `/review`+`/generate` adopt shared chrome; orphan sweep.

**Out of scope:** deck/grouping logic (placeholder only); new fonts; any schema/DB/migration/API change; changes to AI-gen, manual-save, or review logic; `.dark`-token refactor; auth-page restyle (only the redirect guard); `/cards` list-behavior/pagination changes.

## Architecture / Approach

Two `.astro` chrome components (`AppHeader`, `AppFooter`) read `Astro.locals.user` server-side (no hydration) and are imported by pages — not baked into `Layout`. Redirects centralize in `middleware.ts`. Creation consolidation adds one parent island (`CreateCard`) that toggles between the **existing** `GenerateView` and `ManualCardForm` islands — zero backend change. Cosmic theme stays hardcoded utilities, now partly behind extracted primitives.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Shared chrome + primitives | `AppHeader`/`AppFooter` + Badge/Panel/CTA | Getting the shared API right so later phases just consume it |
| 2. Auth-aware routing | `/` + auth-page redirects; sign-in → dashboard | Redirect over-matching (`/` exact, auth explicit pair) |
| 3. Landing redesign | Recall-style `/` + public header | Visual fidelity without the reference font |
| 4. Dashboard redesign | Action blocks + footer-only | Header-less page must still log out (footer) |
| 5. Cards + creation entry | Shared chrome + "Add card" FAB | Keeping list/empty-state behavior untouched |
| 6. Creation consolidation + rest | AI/Manual toggle, `/cards/new` redirect, review/generate chrome, orphan sweep | Toggle wiring + no dead links after header removals |

**Prerequisites:** S-01/S-02/S-03 shipped (they are). No external access needed.
**Estimated effort:** ~2–3 sessions across 6 small, independently shippable phases.

## Open Risks & Assumptions

- "Looks like the reference" fidelity is intentionally approximate (system font, hardcoded cosmic palette) — exact pixel match is not a goal.
- Manual verification only (no test runner); each phase gates on `npm run lint` + `npm run build` plus a browser pass.
- Consolidating `/cards/new` into a redirect assumes no external deep-links depend on its old form rendering (MVP — safe).

## Success Criteria (Summary)

- A logged-in user moves landing → dashboard → cards → create/review with one consistent header/footer and no dead-ends.
- Card creation is reachable and defaults to AI; manual is one toggle away; logout works from every page including the dashboard.
- `npm run lint` and `npm run build` pass after every phase; behavior of existing AI/manual/review flows is unchanged.
