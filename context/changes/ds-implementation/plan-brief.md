# Apply the zen Design System to the 10xCards Frontend — Plan Brief

> Full plan: `context/changes/ds-implementation/plan.md`
> Research: `context/changes/ds-implementation/research.md`

## What & Why

Reskin the entire 10xCards frontend to the **zen** design system (open-wispr's neo-brutalist look) so the app has a deliberate, cohesive visual identity instead of the placeholder dark "cosmic" theme. Adopt zen as-is: light warm-paper background, near-black ink text and 2px borders, electric-purple accent `#7C3AED`, hard offset shadows, square corners, DM Sans + IBM Plex Mono.

## Starting Point

Today the app looks dark (purple/blue gradients, glassmorphism, `rounded-2xl`) — but the dark theme is actually inert: nothing ever applies `.dark`; the look is hardcoded utilities. Theming lives in one file (`src/styles/global.css`, Tailwind 4 CSS-first), only `button.tsx` consumes shadcn tokens, and no font is loaded at all.

## Desired End State

Every screen (`/`, auth, dashboard, cards, generate, review) renders in zen's light neo-brutalist style with the brand fonts loaded, driven by retokened `global.css` plus reusable primitives. No residual dark/glass/gradient utilities remain. 10xCards keeps its own product name and copy.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Branding fidelity | Adopt open-wispr look as-is | User wants the app to look like zen. | Research |
| Surface | Whole app | All screens + shared chrome in scope. | Research |
| Token integration | Re-point shadcn token *names* to zen values | Keeps `button.tsx` + `@theme inline` working; no zen `styles.css` import. | Research |
| Dark mode | Light-only (MVP) | Light is zen's canonical theme; current dark is dead code. | Plan |
| Voice/copy | Typographic conventions only | Keep 10xCards copy; adopt UPPERCASE labels + sentence-case headings only. | Plan |
| Grade buttons | Zen-faithful accent + ink | Prioritize the zen look over semantic red/green color-coding. | Plan |
| Primitives | Add Input/Textarea/Card + restyle existing | Kill inline-style duplication; one-file consistency. | Plan |
| Fonts | Google Fonts `<link>` | Simplest, no CSP blocking, no build setup. | Plan |
| Phasing | Page-by-page vertical (shared layer first) | Each screen verifiable end-to-end after a shared foundation. | Plan |

## Scope

**In scope:** fonts; `global.css` retoken; restyle `button`/`Badge`/`Panel`/`Cta` + new `Input`/`Textarea`/`Card`; restyle chrome (`AppHeader`/`AppFooter`/`Banner`); reskin landing, auth, dashboard, cards (+ FAB modal), generate/manual, review; whole-app consistency sweep.

**Out of scope:** dark-mode toggle; copy rewrite / product-name change; self-hosted fonts; any feature/route/API/data-model change; semantic grade colors; verbatim port of zen's React components/UI kits; `/api/*`.

## Architecture / Approach

Tailwind 4 is CSS-first with all tokens in `src/styles/global.css`. Phase 1 delivers the shared layer (fonts in `Layout.astro`, retokened `global.css` keeping shadcn names with zen values + effect/font tokens, restyled + new primitives, restyled chrome). Because only `button.tsx` reads tokens, each later phase's main work is replacing a screen's hardcoded dark/glass utilities with semantic tokens and the new primitives, finishing one screen group end-to-end.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Foundation & shared layer | Fonts, zen tokens, primitives, chrome | `--radius:0` + token re-point affect everything; get the base right |
| 2. Landing + auth | Public entry screens in zen | Auth forms must keep working through restyle |
| 3. Dashboard | Authed hub in zen | Recently redesigned; preserve nav behavior |
| 4. My Cards | Cards list + FAB modal in zen | Preserve edit/delete + modal Esc/backdrop behavior |
| 5. Create flashcards | Generate + manual in zen | Counters/progress/candidate flow must still work |
| 6. Review + final sweep | Review screen + whole-app consistency | Zen-faithful grade buttons must stay distinguishable |

**Prerequisites:** none beyond the existing dev setup (`npm run dev`, lint, build).
**Estimated effort:** ~3–5 sessions across 6 phases (Phase 1 is the heaviest; screen phases are mostly utility swaps).

## Open Risks & Assumptions

- Token re-point only restyles `button.tsx` — the bulk is a manual hardcoded-utility sweep per screen; missed hits cause an inconsistent half-reskin (mitigated by the Phase 6 grep sweep).
- Zen-faithful grade buttons drop color-coding; relies on labels/position remaining clearly distinguishable.
- Google Fonts is a runtime third-party request; fine now (no CSP), revisit if a CSP is added.
- No automated test runner — correctness rests on lint/build + manual walkthrough.

## Success Criteria (Summary)

- All routes render one consistent zen look with brand fonts; no dark/glass/gradient utilities remain.
- Every interactive flow (auth, create AI/manual, browse/edit/delete, review) still works.
- `npm run lint` and `npm run build` pass.
