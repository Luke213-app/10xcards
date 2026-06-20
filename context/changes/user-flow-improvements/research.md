---
date: 2026-06-20T13:25:53+0200
researcher: lukaszblonski
git_commit: 39dda8e603b8bd5ea401f7951573c30cc3f0cd73
branch: master
repository: Luke213-app/10xcards
topic: "Existing nav/layout/redirect/auth-state patterns for the S-06 user-flow-improvements UX refinement"
tags: [research, codebase, layout, navigation, auth, middleware, design-system, chrome]
status: complete
last_updated: 2026-06-20
last_updated_by: lukaszblonski
---

# Research: nav / layout / redirect patterns for S-06 (user-flow-improvements)

**Date**: 2026-06-20T13:25:53+0200
**Researcher**: lukaszblonski
**Git Commit**: 39dda8e603b8bd5ea401f7951573c30cc3f0cd73 (pushed; `master` in sync with origin)
**Branch**: master
**Repository**: Luke213-app/10xcards
**GitHub blob base**: `https://github.com/Luke213-app/10xcards/blob/39dda8e603b8bd5ea401f7951573c30cc3f0cd73/<file>#L<line>`

## Research Question

Map the existing chrome (header/nav/footer), auth-state resolution, redirect mechanics, the internal navigation graph (to find orphans), and the design-system surface — so the S-06 plan rests on codebase evidence. S-06 scope = R1 landing restyle + auth-aware redirect, R2 dashboard restyle, R3 cards header/footer cleanup, R4 one shared authenticated header/footer + orphaned-link wiring. (Spec: `change.md`; visual targets: `reference/ref-landing.png`, `reference/ref-dashboard.png`.)

## Summary

The refactor is **highly feasible and low-risk** (presentation only, no schema change — the `lessons.md` migration rule does **not** apply). The cosmic dark/purple aesthetic already matches the reference's family. The real work is **structural, not visual**:

1. **There is no shared app chrome.** `Layout.astro` is a chrome-free HTML shell; `Topbar.astro` (the only reusable nav) is imported **only** by the landing. Every authed page hand-rolls its own `<header>` link row, each exposing a *different subset and order* of the 6 destinations, none with sign-out, none linking to `/`. **No footer or `<nav>` exists anywhere.** R4's "one shared header+footer" is the load-bearing change; everything else hangs off it.
2. **The auth-aware redirects (R1) are net-new logic** — `/` never redirects today. The cleanest, convention-matching home is `src/middleware.ts` (which already gates `PROTECTED_ROUTES`), with one caveat: `/` must be matched **exactly** (`pathname === "/"`), and auth routes by the **explicit pair** `["/auth/signin","/auth/signup"]` (a `/auth` prefix would wrongly trap `/auth/confirm-email`). Null-Supabase-client case is automatically safe (user is always `null`).
3. **Orphan risk is real and answers OQ-B.** After the redesign removes the dashboard buttons and the `/cards` header row, **`/generate` and `/cards/new` each drop to 2 fragile inbound links** (via `/review` / empty-states only). The shared header **must** carry "Generate" and "Add manually" entry points or these pages become near-orphans.
4. **Design tokens exist but as copy-pasted strings, not components.** Only `Button` + a starter `LibBadge` live in `src/components/ui/`. The reference's geometric **display font is net-new** (the single biggest exact-match gap). De-facto primitives (glass panel, pill/badge, primary/secondary CTA) should be extracted, not re-pasted.

## Detailed Findings

### A. Shared chrome & layout (grounds R2, R3, R4)

- **`src/layouts/Layout.astro` is chrome-free.** Owns only `<head>` + `missingConfigs` banners + a single `<slot/>` (`Layout.astro:13-40`); imports `global.css` (`:2`). No nav/header/footer, no `bg-cosmic` — every page paints its own background. Default `title` is still the starter's `"10x Astro Starter"` (`Layout.astro:10`) — a leftover to clean up.
- **`src/components/Topbar.astro` is the only reusable chrome, and it's landing-only.** Auth-aware: signed-in branch shows `user.email` + Dashboard link (`:13`) + sign-out form (`:16-20`); signed-out branch shows Sign in (`:27`) / Sign up (`:30`). **Imported only by `Welcome.astro` (`Welcome.astro:2,28`)** — no product page uses it.
- **`src/components/Welcome.astro` is unmodified starter content** — "10x Astro Starter" hero (`:35`), starter feature cards with inline SVGs (`:57-124`), and the reusable **cosmic decoration**: orbs (`:7-18`) + star-field (`:21-25`). The 3-feature-grid scaffold (`:57`) and gradient-accent H1 (`:32-34`) are directly reusable for R1.
- **Every authed page hand-rolls chrome, in two clashing paradigms:**
  - *Centered button-grid hub*: `dashboard.astro` — links `/review` (`:19`), `/generate` (`:25`), `/cards/new` (`:31`), `/cards` (`:37`) + sign-out form (`:43-50`). No `<header>`.
  - *Top-right link row* (identical structural template, divergent contents): `cards/index.astro:21-36` (links `/review`,`/cards/new`,`/generate`,`/dashboard`), `cards/new.astro:12-25`, `generate.astro:12-27`, `review/index.astro:22-40`. Each exposes a **different subset/order** of destinations; **none** has sign-out; **none** links to `/`; user email is buried in subtitle copy (e.g. `cards/index.astro:27`).
- **No footer, no `<nav>` element exist** (full-tree confirmed; the only `footer` token is an unrelated `ManualCardForm` prop). The reference's "© + Source" footer is greenfield.
- **Recommendation (Astro-idiomatic):** build a standalone `src/components/AppShell.astro` (or `AppHeader.astro` + `AppFooter.astro`) that reads `Astro.locals.user`, wraps `bg-cosmic min-h-screen` + header + `<slot/>` + footer, and is **imported by pages** — **not** baked into `Layout.astro` (auth pages + landing deliberately want different chrome). Build as `.astro` (server-only, no island needed); use inline SVG / `lucide-static` for icons (lucide-react would force an unnecessary island). It should also collapse the duplicated `main.bg-cosmic … / mx-auto max-w-3xl` boilerplate repeated across the four app pages.

### B. Auth state & redirect mechanics (grounds R1, R4 logout)

- **`src/middleware.ts` resolves `context.locals.user` on every request** (`:6-16`) then gates `PROTECTED_ROUTES = ["/dashboard","/generate","/cards","/review"]` (`:4`) via `.some(... startsWith)` → redirect `/auth/signin` if unauthenticated (`:18-22`). `/` and `/auth/*` are public.
- **`context.locals.user` is typed `User | null`** at `src/env.d.ts:3`; a truthiness check is the established idiom.
- **Null Supabase client** (secrets unset) → `createClient` returns `null` (`src/lib/supabase.ts:5-8`) → middleware sets `user = null` (`:14-16`). So a logged-in→/dashboard redirect is **inherently inert** when unconfigured — no special-casing needed.
- **Redirect targets today:** `signout.ts:9` → `/` (✓ R4 logout already lands on `/`); `signin.ts:19` success → `/`; `signup.ts:19` success → `/auth/confirm-email`. **No CSRF/Origin checks** on any auth endpoint.
- **Auth pages have no "already logged in" guard** (`signin.astro:1-6`, `signup.astro:1-6` read only the `error` param).
- **Recommendation: centralize R1 redirects in `src/middleware.ts`** (Option A) as a sibling block after `user` is resolved — consistent with the existing protected-route gating. **Caveats:** match `/` **exactly** (`pathname === "/"`); match auth routes by the **explicit pair** `["/auth/signin","/auth/signup"]` (never `/auth` prefix → would trap `/auth/confirm-email` and block a just-signed-up user). Per-page frontmatter guards (Option B) work but scatter policy across 3 files and diverge from the centralized convention.

### C. Navigation graph & orphan risk (grounds R4, answers OQ-B)

- **At-risk page `/generate` — current inbound:** `dashboard.astro:25` (removed), `cards/index.astro:33` header (removed), `cards/index.astro:51` empty-state (removed), `review/index.astro:37` header (survives), `review/index.astro:61` empty-state (survives). **→ After redesign: 2 inbound, both from `/review` only.**
- **At-risk page `/cards/new` — current inbound:** `dashboard.astro:31` (removed), `cards/index.astro:32` header (removed), `generate.astro:23` header (survives), `cards/index.astro:57` empty-state (survives). **→ After redesign: 2 inbound (`/generate` header + `/cards` empty-state).**
- **`/cards` and `/review` survive** (dashboard's "Browse my cards" → `/cards`, "I want to Learn" → `/review`; plus cross-links).
- **No page becomes fully unreachable, but `/generate` and `/cards/new` become fragile** — they depend entirely on `/review` and empty-state fallbacks. **This is the concrete evidence behind OQ-B: the shared header (R4) should surface "Generate" and "Add manually" so creation entry points are robust, not incidental.**

### D. Design system & feasibility (grounds visual match)

- **Tailwind 4 via Vite plugin, CSS-first** (`astro.config.mjs:6,11-13`); no `tailwind.config`. `src/styles/global.css` holds the shadcn neutral oklch token set (`:6-75`, unused — `.dark` is never applied to `<html>`) + the one custom token `@utility bg-cosmic` (`global.css:119-121`). Cosmic styling is **hardcoded utilities**, not semantic tokens.
- **`src/components/ui/` has only `button.tsx` + `LibBadge.astro`** (starter leftover). **No Card/Badge/Dialog/Input/Avatar/DropdownMenu.** Adding any would be a first for the repo (confirmed `s-04/plan.md:16`).
- **Icons:** `lucide-react@^1.14.0` installed, used in all React islands; `.astro` files use **inline SVG** (lucide-react can't import into Astro). `components.json`: new-york / neutral / `iconLibrary: lucide`.
- **`cn()`** (clsx + tailwind-merge) at `src/lib/utils.ts`; no other UI helpers.
- **De-facto primitives are duplicated strings**, not components: glass panel `rounded-2xl border border-white/10 bg-white/5`, pill `rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-xs` (`CardList.tsx:150`, `CandidateCard.tsx:34`), primary CTA `bg-purple-600 hover:bg-purple-500`, secondary CTA `border border-white/20 bg-white/10 hover:bg-white/20`. R3 keeps the `/cards` list/empty-state behavior untouched, so reuse — don't reinvent.
- **No custom font anywhere** (no `@font-face`/Google Fonts/`@fontsource`). The reference's bold geometric display sans is **net-new** — a font import in `Layout.astro` head + a `--font-display` token. **This is the single biggest exact-match gap.**
- **Gradient inconsistency:** Welcome uses 3-stop `from-blue-200 via-purple-200 to-pink-200` (`Welcome.astro:33`); the other 8 surfaces use 2-stop `from-blue-200 to-purple-200`. Pick one for the shared chrome.

## Code References

- `src/layouts/Layout.astro:2,10,13-40` — chrome-free shell; starter default title.
- `src/components/Topbar.astro:5-37` — only reusable nav; landing-only (`Welcome.astro:2,28`).
- `src/components/Welcome.astro:7-25` (cosmic decoration, reuse), `:32-34` (gradient H1), `:57` (3-card grid), `:35,57-124` (starter content to replace).
- `src/pages/dashboard.astro:17-50` — button-grid hub + sign-out (R2 target).
- `src/pages/cards/index.astro:21-36` — header + link row to remove (R3); `:38-67` list/empty-state to keep.
- `src/pages/{generate.astro:12-27, review/index.astro:22-40, cards/new.astro:12-25}` — per-page headers to adopt shared chrome.
- `src/middleware.ts:4,18-22` — PROTECTED_ROUTES + `.startsWith` gate (R1 redirect home).
- `src/env.d.ts:3` — `locals.user: User | null`.
- `src/lib/supabase.ts:5-8` — null-client path (redirect-safe).
- `src/pages/api/auth/{signout.ts:9 → "/", signin.ts:19 → "/", signup.ts:19 → "/auth/confirm-email"}`.
- `src/styles/global.css:119-121` — `bg-cosmic`; `:6-75` unused shadcn tokens.
- `src/components/ui/{button.tsx, LibBadge.astro}`; `src/lib/utils.ts` (`cn`).
- `astro.config.mjs:6,11-13` — Tailwind 4 Vite plugin.

## Architecture Insights

- **The redesign reverses a prior deliberate choice.** `s-03/plan.md:45` records that global nav was intentionally *not* adopted (per-page headers instead). S-06 R4 consciously reverses this — note it in the plan so it doesn't read as contradicting an unexamined decision.
- **Build the shared chrome as `.astro`, not React.** It only reads `Astro.locals.user` server-side; a React island would add hydration cost and pull in lucide-react for no interaction. Icons via inline SVG / `lucide-static`.
- **Centralize redirects, but mind the matching.** Exact `/`, explicit auth pair — the `.startsWith` idiom that works for `PROTECTED_ROUTES` is unsafe for `/` and `/auth`.
- **Extract primitives once.** A `Badge`/`Pill`, `Panel`, and CTA variants (cva or shadcn) would keep the shared header/footer + restyled pages DRY and stop the copy-paste-string pattern from spreading further.
- **`bg-cosmic`-hardcoded vs tokenized palette is a fork:** keep hardcoding cosmic utilities (matches every prior slice — recommended for scope) vs populate `.dark` tokens + apply `class="dark"` (cleaner, larger refactor, precedent-breaking). Default to hardcoding for S-06.

## Historical Context (from prior changes)

- `context/foundation/lessons.md` — the only lesson (push Supabase migrations to remote as part of deploy) **does not apply**: S-06 is presentation-only, zero schema/DB change.
- `context/changes/s-03/plan.md:19,21,45` — canonical page-shell template + token cheat-sheet + the deliberate "no global nav" decision S-06 supersedes.
- `context/changes/s-04/plan.md:16` — "only `Button` exists in `ui/`; no Dialog/AlertDialog" — adding primitives is net-new.
- `context/changes/srs-review-session/plan.md:23-24` & `ai-card-generation/plan.md:185` — island conventions (`client:load`, `Button` + lucide + `cn()`, cosmic textarea).

## Related Research

None prior for this change (`research.md` is the first artifact under `context/changes/user-flow-improvements/`).

## Open Questions

1. **OQ-B (now evidence-backed):** Surface "Generate" and "Add manually" in the shared header (R4) — the nav-graph shows both become fragile 2-inbound pages otherwise. Recommend: yes, plus keep `/cards` empty-state CTAs. *Confirm during `/10x-plan`.*
2. **Signin success target:** `signin.ts:19` redirects to `/`; once R1's `/`→`/dashboard` redirect exists, sign-in will chain `/` → `/dashboard` (one harmless extra hop). Decide whether to retarget signin success directly to `/dashboard`.
3. **Display font:** adopt the reference's geometric sans (net-new font import) for a close match, or stay on the system sans and match only layout/color? Owner: user — affects "looks like X" fidelity, not function.
4. **Primitive extraction depth:** extract `Badge`/`Panel`/CTA components now, or keep hardcoded utility strings for this slice? Scope/debt trade-off for `/10x-plan`.
5. **Cosmic palette:** keep hardcoded utilities (recommended, matches precedent) vs tokenize `.dark` (cleaner, larger). Default: hardcode.
