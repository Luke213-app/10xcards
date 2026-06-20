# User Flow Improvements (S-06) Implementation Plan

## Overview

A cross-cutting UX/IA refinement layered on the already-shipped feature slices (S-01…S-05). It introduces one shared authenticated chrome, restyles the landing / dashboard / cards pages toward the "Recall" reference, makes routing auth-aware, and consolidates card creation behind a single toggle surface. **No data model, schema, migration, or backend/API change** — existing islands and endpoints are reused verbatim.

## Current State Analysis

Established by `research.md` (commit `39dda8e`):

- **No shared chrome exists.** `Layout.astro` is a chrome-free HTML shell (`Layout.astro:13-40`). `Topbar.astro` (the only reusable nav) is imported **only** by the landing (`Welcome.astro:2,28`). Every authed page hand-rolls a `<header>` link row exposing a *different subset/order* of destinations; **no footer or `<nav>` exists anywhere**; sign-out is duplicated (Topbar + dashboard) and absent from the four app-page headers.
- **`/` never redirects today.** Auth-aware landing routing is net-new. `middleware.ts:4` gates `PROTECTED_ROUTES` via `.startsWith`; `/` and `/auth/*` are public.
- **Creation entry points are fragile.** After the redesign removes the dashboard buttons and the `/cards` header row, `/generate` and `/cards/new` drop to 2 fragile inbound links each (`research.md` §C).
- **Design tokens are copy-pasted strings, not components.** Only `Button` + a starter `LibBadge` live in `src/components/ui/`. `bg-cosmic` is the one custom utility (`global.css:119-121`). Cosmic decoration (orbs + starfield) lives in `Welcome.astro:7-25`.
- **Islands are prop-light and reusable:** `GenerateView` (default export, no props, owns all state — and already imports `ManualCardForm` for its empty-state, `GenerateView.tsx:6,25`); `ManualCardForm` (default export, props `heading`/`intro`/optional `actions`/`footer`, POSTs `source:"manual"` → `/api/flashcards`, `ManualCardForm.tsx:12-35`).
- **No test runner is configured** (CLAUDE.md). Automated gates are `npm run lint` + `npm run build`.
- **`lessons.md`** has one rule (push Supabase migrations on deploy) — **N/A**: this change touches no schema.

## Desired End State

A coherent, auth-aware flow with a single shared chrome:

- **Landing `/`** (public): Recall-style hero + 3 feature cards + public header (Sign in / Sign up). A logged-in visitor is redirected to `/dashboard`.
- **Dashboard `/dashboard`**: hero "What are you up to today?" + 3 action blocks (I want to Learn → `/review`; Browse my cards → `/cards`; Create a deck → inert placeholder) + shared **footer only** (no header).
- **Shared header** on `/cards`, `/generate`, `/review`: brand → `/` · Dashboard · Learn · Cards · Add card. **Shared footer everywhere** (authed): © · Source · **Sign out**.
- **Card creation is consolidated**: a floating "Add card" button on `/cards` → `/generate`, which now has an **AI / Manual toggle (default AI)**. `/cards/new` redirects into the Manual mode of that surface.
- **Sign out from anywhere → `/`** (already true; now exposed via the footer on every authed page).
- No orphaned/dead-end links.

### Key Discoveries

- `Topbar.astro` is landing-only; per-page headers diverge (`research.md` §A) — the shared chrome supersedes a deliberate prior "no global nav" choice (`s-03/plan.md:45`).
- Centralizing redirects in `middleware.ts` requires **exact** match for `/` and an **explicit pair** `["/auth/signin","/auth/signup"]` — a `/auth` prefix would trap `/auth/confirm-email` (`research.md` §B).
- `GenerateView` already composes `ManualCardForm` (`GenerateView.tsx:6`), so a parent toggle island is consistent with existing composition.
- `signin.ts:19` success currently → `/`; retargeting to `/dashboard` removes a double hop once the `/` redirect exists.

## What We're NOT Doing

- **No deck/grouping logic** — "Create a deck" stays an inert "Coming soon" placeholder (PRD Non-Goal).
- **No new font** — stay on Astro's default system sans; match layout + color only.
- **No schema / DB / migration / API change**; no change to AI-generation, manual-save, or review logic — islands and endpoints reused as-is.
- **No `.dark`-token refactor** — keep hardcoded cosmic utilities; extract only a minimal primitive set.
- **No restyle of auth pages** (`signin`/`signup`/`confirm-email`) beyond adding the logged-in redirect guard — they keep their centered-card layout.
- **No pagination / list-behavior change** on `/cards` — R3 is chrome + FAB only; list/empty-state logic untouched.

## Implementation Approach

Build the shared chrome and primitives first (Phase 1), since every later phase consumes them. Add the orthogonal routing change (Phase 2). Then restyle page-by-page in dependency order: landing (3), dashboard (4), cards + the new creation entry (5), and finally the creation-consolidation surface + remaining pages + orphan sweep (6). Each phase is independently buildable and manually verifiable.

## Critical Implementation Details

- **Redirect matching (Phase 2):** `/` must be matched with `pathname === "/"` (not `.startsWith`, which matches everything); auth routes by the explicit set `["/auth/signin","/auth/signup"]`. The null-Supabase-client case is inherently safe (`locals.user` is always `null`, so the redirect never fires).
- **Chrome is `.astro`, not React:** `AppHeader`/`AppFooter` read `Astro.locals.user` server-side and need no hydration; use inline SVG for icons (lucide-react would force an unnecessary island). Mount them as components imported by pages — **not** baked into `Layout.astro` (the public auth pages and landing want different chrome).
- **Toggle initial mode (Phase 6):** the `CreateCard` island takes an `initialMode` prop; `generate.astro` derives it from `Astro.url.searchParams.get("mode")` (default `"ai"`), so `/cards/new` → `/generate?mode=manual` lands directly in Manual.

## Phase 1: Shared chrome + UI primitives

### Overview

Extract the de-facto primitives into real components and build the shared header/footer that every later phase consumes.

### Changes Required:

#### 1. UI primitives

**File**: `src/components/ui/Badge.astro`, `src/components/ui/Panel.astro`, and CTA variants on `src/components/ui/button.tsx` (or a sibling `cta` helper)

**Intent**: Replace the copy-pasted utility strings (pill, glass panel, primary/secondary CTA) with a minimal reusable set so the new chrome and restyled pages stay DRY.

**Contract**: `Badge.astro` renders the pill (`rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-xs`) with a `<slot/>`. `Panel.astro` renders the glass panel (`rounded-2xl border border-white/10 bg-white/5`) with a `<slot/>` and optional `class` passthrough via `cn()`. CTA: a primary (`bg-purple-600 hover:bg-purple-500`) and secondary (`border border-white/20 bg-white/10 hover:bg-white/20`) variant usable from `.astro` (an `.astro` link wrapper is fine; do not force a React island).

#### 2. Shared header

**File**: `src/components/AppHeader.astro`

**Intent**: One authenticated top bar replacing the four divergent per-page header rows.

**Contract**: No props; reads `Astro.locals.user`. Left: brand "Recall" (icon + wordmark) linking `/`. Right nav links: Dashboard → `/dashboard`, Learn → `/review`, Cards → `/cards`, Add card → `/generate`. No sign-out here (it lives in the footer). Cosmic styling via the Phase-1 primitives; inline SVG brand icon.

#### 3. Shared footer

**File**: `src/components/AppFooter.astro`

**Intent**: The single element present on every authed page (including the header-less dashboard); carries the always-available account control.

**Contract**: No props. Left: `© 2026 10xCards` (or chosen brand line). Right: `Source` link + a sign-out `<form method="POST" action="/api/auth/signout">` submit styled as a link (the existing pattern from `Topbar.astro:16-20` / `dashboard.astro:43-50`).

#### 4. Retire/!consume Topbar duplication

**File**: `src/components/Topbar.astro` (and `Layout.astro:10` default title)

**Intent**: The landing's public header is rebuilt in Phase 3; the duplicated sign-out form is centralized into `AppFooter`. Update `Layout.astro` default `title` away from the starter "10x Astro Starter".

**Contract**: `Topbar.astro` is either deleted (if Phase 3 inlines a public header) or repurposed as the public-variant header. Decide in Phase 3; Phase 1 only stops new pages from depending on it.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`
- New components exist: `src/components/AppHeader.astro`, `src/components/AppFooter.astro`, and the primitive files

#### Manual Verification:

- `AppHeader` renders brand + nav and is keyboard-navigable; all nav targets resolve
- `AppFooter` sign-out logs the user out and lands on `/`
- Primitives render visually identical to the prior inline-string versions

---

## Phase 2: Auth-aware routing

### Overview

Redirect logged-in users away from public/auth entry points to the dashboard, and land sign-in directly on the dashboard.

### Changes Required:

#### 1. Middleware redirects

**File**: `src/middleware.ts`

**Intent**: After `locals.user` is resolved, send a logged-in visitor from `/` and the auth pages to `/dashboard`.

**Contract**: Add a sibling block to the existing `PROTECTED_ROUTES` gate: if `locals.user` is truthy and (`pathname === "/"` **or** `pathname` ∈ `["/auth/signin","/auth/signup"]`), `return context.redirect("/dashboard")`. Exact match for `/`; explicit pair for auth (never a `/auth` prefix — would catch `/auth/confirm-email`).

#### 2. Sign-in success target

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Avoid the `/` → `/dashboard` double hop.

**Contract**: Change the success redirect (`signin.ts:19`) from `/` to `/dashboard`. Error/null-client redirects unchanged.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Logged-in user visiting `/`, `/auth/signin`, `/auth/signup` is redirected to `/dashboard`
- Logged-out user still sees `/` and can reach the auth pages
- `/auth/confirm-email` is reachable after sign-up (not trapped by the redirect)
- Fresh sign-in lands on `/dashboard` (single redirect)

---

## Phase 3: Landing redesign (R1)

### Overview

Replace the starter landing with the Recall-style marketing page and a public header.

### Changes Required:

#### 1. Landing markup

**File**: `src/components/Welcome.astro` (rendered by `index.astro`)

**Intent**: Match `reference/ref-landing.png`: badge "Free & open source", hero H1 "Remember everything you learn." with a gradient accent word, subtitle, and three feature cards (Active recall / Spaced repetition / It's for free). Reuse the existing cosmic orbs + starfield (`Welcome.astro:7-25`).

**Contract**: Public header (not `AppHeader`): brand "Recall" + "Sign in" link → `/auth/signin` + "Sign up" button → `/auth/signup` (plain link, **no logout** — OQ-A). Feature cards use the Phase-1 `Panel`/`Badge` primitives; inline-SVG icons. Replace all starter copy.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Logged-out `/` matches the reference (hero, badge, 3 cards, header)
- "Sign in" → `/auth/signin`; "Sign up" → `/auth/signup`
- Logged-in visitor never sees the landing (redirected — verifies Phase 2 interplay)

---

## Phase 4: Dashboard redesign (R2)

### Overview

Rebuild the dashboard as a hub of action blocks with footer-only chrome.

### Changes Required:

#### 1. Dashboard page

**File**: `src/pages/dashboard.astro`

**Intent**: Match `reference/ref-dashboard.png`: hero "What are you up to today?" + three action blocks; no header, `AppFooter` only.

**Contract**: Blocks (Phase-1 `Panel` style, inline-SVG icons): "I want to Learn" → `/review`; "Browse my cards" → `/cards`; "Create a deck" → inert element with a "Coming soon" `Badge` (no href, not focusable as a link). Remove the old button row + inline sign-out form (sign-out now in `AppFooter`).

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Dashboard matches the reference; "I want to Learn" → `/review`, "Browse my cards" → `/cards`
- "Create a deck" is visibly inert (no navigation)
- Footer sign-out works from the dashboard (confirms header-less page can still log out)

---

## Phase 5: Cards page + creation entry (R3)

### Overview

Strip the cards page's ad-hoc header, adopt the shared chrome, and add the floating "Add card" entry.

### Changes Required:

#### 1. Cards page chrome + FAB

**File**: `src/pages/cards/index.astro`

**Intent**: Remove the bespoke header ("My cards / …email" + Review/Add manually/Generate/Dashboard link row, `cards/index.astro:21-36`); adopt `AppHeader` + `AppFooter`; add a floating "Add card" button. Keep list / empty-state / RLS-scoped fetch untouched (chrome only).

**Contract**: A fixed-position FAB (bottom-right, cosmic primary CTA + Plus inline-SVG) that is a plain `<a href="/generate">` — no island. Update the empty-state CTAs (`cards/index.astro:51,57`) to `/generate` (AI) and `/generate?mode=manual` (manual).

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- `/cards` shows the shared header + footer; the old header row is gone
- The card list and empty state render and behave exactly as before (edit/delete still work)
- The floating "Add card" button is visible and navigates to `/generate`

---

## Phase 6: Creation consolidation + remaining pages (R4)

### Overview

Introduce the AI/Manual toggle surface, redirect the old manual page into it, bring `/generate` and `/review` onto the shared chrome, and sweep for orphans.

### Changes Required:

#### 1. Toggle island

**File**: `src/components/generate/CreateCard.tsx` (new)

**Intent**: A parent island that switches between the existing AI and manual creation flows behind one control, defaulting to AI.

**Contract**: `Props { initialMode?: "ai" | "manual" }` (default `"ai"`). Holds `mode` state; renders a segmented toggle (AI ✨ / Manual ✍️) then `<GenerateView/>` (no props) or `<ManualCardForm heading="New flashcard" intro="Type a question and its answer, then save." />`. Default export, hydrated `client:load`.

#### 2. Generate page

**File**: `src/pages/generate.astro`

**Intent**: Mount the toggle surface and adopt the shared chrome.

**Contract**: Replace the bespoke header (`generate.astro:12-27`) with `AppHeader` + `AppFooter`. Read `Astro.url.searchParams.get("mode")` and pass `initialMode` to `<CreateCard client:load />` (replacing the direct `<GenerateView/>` mount).

#### 3. Redirect the old manual page

**File**: `src/pages/cards/new.astro`

**Intent**: Collapse the duplicate manual surface into the toggle.

**Contract**: Replace the page body with a frontmatter redirect: `return Astro.redirect("/generate?mode=manual")`.

#### 4. Review page chrome

**File**: `src/pages/review/index.astro`

**Intent**: Adopt the shared chrome.

**Contract**: Replace the bespoke header (`review/index.astro:22-40`) with `AppHeader` + `AppFooter`; keep `ReviewSession` and its existing links/behavior.

#### 5. Orphan/navigation sweep

**File**: all pages touched above

**Intent**: Confirm every page is reachable and no dead links remain after the header removals.

**Contract**: Verify the post-change graph: `/generate` reachable via header "Add card" + `/cards` FAB; manual creation via toggle + `/cards/new` redirect; `/review` via header "Learn" + dashboard block; no `href` points to a removed element.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`
- No references to the removed `/cards/new` form page remain except the intended redirect: `grep -rn "/cards/new" src/` shows only `/generate?mode=manual` redirect + intentional links

#### Manual Verification:

- `/generate` shows the toggle; AI mode is default and generates+saves; Manual mode saves a hand-written card
- Visiting `/cards/new` redirects to `/generate?mode=manual` and opens in Manual
- `/generate` and `/review` show the shared header + footer
- From the dashboard, a user can reach creation (Browse my cards → `/cards` → Add card) and every page is reachable; no dead links

---

## Testing Strategy

No automated test runner is configured (CLAUDE.md), so verification is build/lint + manual.

### Automated (per phase):

- `npm run lint` (ESLint, type-checked rules)
- `npm run build` (Astro SSR production build — catches type/SSR errors)

### Manual Testing Steps:

1. Logged-out: load `/` → matches landing reference; Sign in/Sign up targets correct.
2. Sign in → lands on `/dashboard` (single redirect); revisit `/`, `/auth/signin` → redirected to `/dashboard`.
3. Dashboard: blocks route correctly; "Create a deck" inert; footer sign-out → `/`.
4. `/cards`: shared chrome, list/edit/delete unchanged, FAB → `/generate`.
5. `/generate`: toggle AI (default) generates+saves; Manual saves; `/cards/new` → Manual.
6. `/review` + `/generate`: shared chrome; full nav reachable; no dead links.

## Performance Considerations

Chrome is server-rendered `.astro` (no added hydration). The only new island is `CreateCard`, which lazily renders one of two already-existing islands — no net island-count increase on `/generate` (it replaces the direct `GenerateView` mount). Negligible impact.

## Migration Notes

None — no data or schema changes. `/cards/new` becomes a redirect, so any existing bookmarks/links resolve to the consolidated surface.

## References

- Research: `context/changes/user-flow-improvements/research.md`
- Requirements + visual targets: `context/changes/user-flow-improvements/change.md`, `reference/ref-landing.png`, `reference/ref-dashboard.png`
- Roadmap slice: `context/foundation/roadmap.md` (S-06)
- Reuse: `GenerateView.tsx`, `ManualCardForm.tsx:12-35`, `Topbar.astro:16-20` (sign-out form), `global.css:119-121` (`bg-cosmic`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Shared chrome + UI primitives

#### Automated

- [x] 1.1 Linting passes: `npm run lint`
- [x] 1.2 Production build succeeds: `npm run build`
- [x] 1.3 New components exist (AppHeader.astro, AppFooter.astro, primitives)

#### Manual

- [ ] 1.4 AppHeader renders brand + nav, keyboard-navigable, targets resolve
- [ ] 1.5 AppFooter sign-out logs out and lands on `/`
- [ ] 1.6 Primitives render visually identical to prior inline strings

### Phase 2: Auth-aware routing

#### Automated

- [ ] 2.1 Linting passes: `npm run lint`
- [ ] 2.2 Production build succeeds: `npm run build`

#### Manual

- [ ] 2.3 Logged-in user redirected from `/`, `/auth/signin`, `/auth/signup` to `/dashboard`
- [ ] 2.4 Logged-out user still sees `/` and reaches auth pages
- [ ] 2.5 `/auth/confirm-email` reachable after sign-up (not trapped)
- [ ] 2.6 Fresh sign-in lands on `/dashboard` (single redirect)

### Phase 3: Landing redesign (R1)

#### Automated

- [ ] 3.1 Linting passes: `npm run lint`
- [ ] 3.2 Production build succeeds: `npm run build`

#### Manual

- [ ] 3.3 Logged-out `/` matches reference (hero, badge, 3 cards, header)
- [ ] 3.4 Sign in → `/auth/signin`; Sign up → `/auth/signup`
- [ ] 3.5 Logged-in visitor never sees the landing (redirected)

### Phase 4: Dashboard redesign (R2)

#### Automated

- [ ] 4.1 Linting passes: `npm run lint`
- [ ] 4.2 Production build succeeds: `npm run build`

#### Manual

- [ ] 4.3 Dashboard matches reference; Learn → `/review`, Browse my cards → `/cards`
- [ ] 4.4 "Create a deck" is visibly inert (no navigation)
- [ ] 4.5 Footer sign-out works from the dashboard

### Phase 5: Cards page + creation entry (R3)

#### Automated

- [ ] 5.1 Linting passes: `npm run lint`
- [ ] 5.2 Production build succeeds: `npm run build`

#### Manual

- [ ] 5.3 `/cards` shows shared header + footer; old header row gone
- [ ] 5.4 Card list + empty state behave as before (edit/delete work)
- [ ] 5.5 Floating "Add card" button navigates to `/generate`

### Phase 6: Creation consolidation + remaining pages (R4)

#### Automated

- [ ] 6.1 Linting passes: `npm run lint`
- [ ] 6.2 Production build succeeds: `npm run build`
- [ ] 6.3 `grep -rn "/cards/new" src/` shows only the intended redirect + links

#### Manual

- [ ] 6.4 `/generate` toggle: AI default generates+saves; Manual saves
- [ ] 6.5 `/cards/new` redirects to `/generate?mode=manual` (opens Manual)
- [ ] 6.6 `/generate` and `/review` show shared header + footer
- [ ] 6.7 From dashboard, creation reachable (Browse → `/cards` → Add card); no dead links
