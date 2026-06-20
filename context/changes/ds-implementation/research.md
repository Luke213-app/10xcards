---
date: 2026-06-20T15:03:34+0200
researcher: lukaszblonski
git_commit: 8f02d8d121f1c2f6f43756db07d110f1c06105b5
branch: master
repository: 10xcards
topic: "Apply the zen design system (open-wispr neo-brutalist look) to the current 10xCards frontend"
tags: [research, codebase, design-system, zen, tailwind4, shadcn, theming, fonts]
status: complete
last_updated: 2026-06-20
last_updated_by: lukaszblonski
---

# Research: Apply the zen design system to the current 10xCards frontend

**Date**: 2026-06-20T15:03:34+0200
**Researcher**: lukaszblonski
**Git Commit**: 8f02d8d121f1c2f6f43756db07d110f1c06105b5
**Branch**: master
**Repository**: 10xcards

## Research Question

The user wants to use the **zen** skill to apply a design system to the current frontend
("chce skorzystac ze skilla zen, zeby zaaplikowac design system do aktualnego frontu").

Scope locked with the user before research:
- **Branding**: adopt open-wispr's look **as-is** (neo-brutalist, ink-on-paper, electric-purple `#7C3AED`, IBM Plex Mono + DM Sans, hard offset shadows, square corners).
- **Surface**: the **whole app** (landing, auth, dashboard, cards, generate, review + shared chrome).
- **Integration**: research recommends the cleanest way to wire zen into the existing Tailwind 4 + shadcn/ui token layer.

## Summary

Applying zen is a **full visual reskin, not an additive overlay**. The shipped 10xCards UI is a dark "cosmic" theme (purple/blue gradients, glass panels `bg-white/5 border-white/10`, generous `rounded-2xl` radii, no defined font). Zen is the near-opposite: **light** warm-paper background, near-black ink text *and* 2px borders, a single purple accent, **square corners**, **hard offset shadows** (no blur), and a **monospace-first** type system (IBM Plex Mono body + DM Sans 800 display). Adopting it touches every page and almost every component.

The good news: the codebase is **lean and CSS-first**. There is exactly **one JS-driven shadcn primitive** (`button.tsx` via CVA); everything else is Tailwind utilities inline or tiny `.astro` primitives. All theming lives in **one file** — `src/styles/global.css` — via Tailwind 4 `@theme inline` + shadcn oklch tokens. There is **no `tailwind.config.*`** and **no font loaded at all** (greenfield typography).

The cleanest integration (detailed in [Recommended Integration](#recommended-integration-approach)):
1. Load DM Sans + IBM Plex Mono via a `<link>` in `Layout.astro` `<head>` (NOT a CSS `@import` — that fights Tailwind's `@import "tailwindcss"` first-line rule).
2. **Re-point the existing shadcn token names** (`--background`, `--foreground`, `--primary`, `--border`, `--radius`, …) onto zen's brand values, keeping the variable names so `button.tsx` and `@theme inline` keep working. Do **not** import zen's `styles.css`/`tokens/*.css` (relative paths + remote `@import` ordering break).
3. Add `--font-*` theme keys + `body { font-family }`, copy zen's effects tokens (hard shadows, 2px border, square radii) into `:root`.
4. Then sweep the **hardcoded** dark utilities (`bg-cosmic`, `text-white`, `bg-purple-600`, `text-blue-100/*`, `bg-white/5`, glass borders) out of pages/components — these are NOT token-driven, so re-pointing tokens alone will not restyle them.

Two prior decisions in `user-flow-improvements` are **deliberately reversed** by this change: "no new font — stay on system sans" and "keep hardcoded cosmic utilities; no `.dark`-token refactor." Treat ds-implementation as their conscious supersession.

## Detailed Findings

### Area 1 — The zen design system (what we're applying)

Source: `.claude/skills/zen/` (a complete, self-contained DS: tokens, React components, two full UI kits). It is reverse-engineered from open-wispr (a macOS voice-dictation app).

Identity (`.claude/skills/zen/SKILL.md`, `README.md`):
- Warm off-white paper `#FDFCF8`, near-black ink `#1a1a1a` (text **and** 2px borders), one electric-purple accent `#7C3AED`.
- **Hard offset shadows** `3px 3px 0` (no blur), **square corners**, IBM Plex Mono body + DM Sans 800 display.
- **Interaction**: elements "press" toward their shadow on hover — `translate(2px,2px)` + shadow collapses `3px → 1px`, fast `.12s` transitions. No soft shadows, no gradients on brand surfaces, no emoji.
- **Voice**: lowercase product name, sentence-case headings, UPPERCASE wide-tracked labels, "X. Not Y." copy. (open-wispr-specific; for 10xCards adopt the *form*, not the open-wispr product copy.)
- Full **dark mode** under `[data-theme="dark"]`.

Token files (exact values, `.claude/skills/zen/tokens/`):
- `colors.css` — `--paper #FDFCF8`, `--surface #ffffff`, `--ink #1a1a1a`, `--muted #6b6b6b`, `--subtle-border #e5e5e5`; accent `--accent #7C3AED`, `--accent-press #6D28D9`, `--accent-light #EDE9FE`; inverted header `--header-bg #1a1a1a`; semantic aliases (`--text-primary`, `--surface-card`, `--border-strong` = the 2px hard border). Dark theme remaps all under `[data-theme="dark"]`.
- `effects.css` — `--border-width 2px`, `--shadow 3px 3px 0`, `--shadow-press 1px 1px 0`, `--shadow-lg 5px 5px 0`; radii `--radius-none 0px` (default), `--radius-xs 2px`, `--radius-logo 24px`, `--radius-pill 999px`; motion `--dur-fast .12s`, `--press-shift translate(2px,2px)`.
- `typography.css` — `--font-display 'DM Sans'`, `--font-mono 'IBM Plex Mono'`, `--font-body var(--font-mono)`; weights to 800; clamp scale `--text-hero clamp(40px,7.5vw,76px)`, `--text-h2 clamp(26px,4.5vw,42px)`; body 14px mono, label 11px uppercase; tracking `-0.03em` hero / `0.1em` labels.
- `spacing.css` — 4–80px scale, `--section-pad 80px`, `--max-width 1200px`, `--pad-card 28px`, `--pad-btn-y 8px` / `--pad-btn-x 16px`.
- `fonts.css` — a remote Google Fonts `@import url('…DM+Sans…&family=IBM+Plex+Mono…&display=swap')`.

Reusable components (`.claude/skills/zen/components/`): `core/` (Button, IconButton, Tag, Card, Eyebrow) and `blocks/` (StepCard, FeatureCell), each `.jsx` + `.d.ts` + `*.prompt.md`. Full screens in `ui_kits/website/` and `ui_kits/macos-app/`. These are references/patterns — they are **not** wired into the app's Tailwind/shadcn setup and should be adapted, not dropped in.

### Area 2 — Current styling foundation (what we integrate into)

- **Single global stylesheet**: `src/styles/global.css`, imported once at `src/layouts/Layout.astro:2`.
- **Tailwind 4 CSS-first** — no `tailwind.config.*` exists. Setup in `global.css`:
  - L1 `@import "tailwindcss";` (must stay effectively first), L2 `@import "tw-animate-css";`
  - L4 `@custom-variant dark (&:is(.dark *));` — `dark:` is **class-based** (`.dark` ancestor).
  - L6–39 `:root` (light) + L41–73 `.dark` — standard shadcn **oklch** tokens (`--background`, `--foreground`, `--primary`, `--card`, `--muted`, `--accent`, `--border`, `--input`, `--ring`, charts, sidebar). `--radius: 0.625rem` (10px).
  - L75–111 `@theme inline { --color-*: var(--*); --radius-*: … }` — maps tokens to Tailwind utilities (`bg-background`, `rounded-lg`, …).
  - L113–115 `@utility bg-cosmic { linear-gradient(to bottom, #0a0e1a, #0f1529, #0a0e1a) }` — the app's signature dark background.
  - L117–124 `@layer base` — `* { @apply border-border outline-ring/50 }`, `body { @apply bg-background text-foreground }`.
- **Vite plugin**: `astro.config.mjs:6,13-15` — `@tailwindcss/vite` (`tailwindcss()`); integrations `react()` + `sitemap()` only.
- **`cn()`**: `src/lib/utils.ts` — standard `twMerge(clsx(...))`.
- **components.json**: `style: "new-york"`, `baseColor: "neutral"`, `cssVariables: true`, lucide icons.
- **CRITICAL — dark mode is wired but inert**: there is **no toggle, no `next-themes`, no script that ever adds `.dark`**. The app looks dark because pages/components **hardcode** dark utilities (`bg-cosmic`, `text-white`, `text-blue-100/*`, `bg-purple-600`, `from-purple-500 to-blue-500`, `bg-white/5`, `border-white/10`). The shadcn token theme and `dark:` variants are effectively dead in the rendered UI.
- **No font defined anywhere** — no `<link>`, no `@font-face`, no `@fontsource` in `package.json`. Browser default sans is used. `font-mono` appears once (`src/components/ui/LibBadge.astro:10`).
- **Radius/shadow conventions in use** (utility counts): `rounded-lg` ×20, `rounded-2xl` ×16, `rounded-full` ×13, `rounded-xl` ×8; shadows sparse (`shadow-xs` on buttons, `shadow-xl`/`shadow-2xl` on modals, colored `shadow-purple-900/40` on the FAB). **Directly contradicts zen's square corners + hard shadows.**

### Area 3 — Component inventory (the restyle surface)

shadcn primitive (only one):
- `src/components/ui/button.tsx` — CVA variants `default|destructive|outline|secondary|ghost|link` × sizes `default|sm|lg|icon`; uses Radix `Slot`. Consumes shadcn tokens, so re-pointing tokens restyles it automatically. **Highest-leverage single file.**

Custom `.astro` UI primitives (`src/components/ui/`):
- `Badge.astro` — `rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-xs`.
- `Panel.astro` — glass container `rounded-2xl border border-white/10 bg-white/5`.
- `Cta.astro` — link CTA, `primary` (`bg-purple-600`) / `secondary` variants.
- `LibBadge.astro` — `rounded-lg bg-blue-900/50 … font-mono text-blue-200` (landing only).

Auth islands (`src/components/auth/`): `SignInForm.tsx`, `SignUpForm.tsx`, `FormField.tsx` (input: `rounded-lg bg-white/10 border … focus:ring-purple-400`), `SubmitButton.tsx` (hardcoded `bg-purple-600`), `PasswordToggle.tsx`, `ServerError.tsx`.

Card/generate/review islands:
- `cards/CardList.tsx` — per-row view/edit/delete; wrapper `rounded-2xl border border-white/10 bg-white/5 p-6`.
- `cards/AddCardModal.tsx` — FAB (`fixed right-6 bottom-6 rounded-full bg-purple-600 … shadow-purple-900/40`) + custom modal (no Dialog primitive; backdrop + Esc + click-outside), modal `bg-[#0f1529]`.
- `generate/CreateCard.tsx` — AI/Manual tab toggle (`inline-flex rounded-xl border border-white/10 bg-white/5 p-1`, active `bg-purple-600`).
- `generate/GenerateView.tsx` — source textarea + char counter + candidate list + progress bar.
- `generate/CandidateCard.tsx` — candidate accept/reject, "edited" badge.
- `manual/ManualCardForm.tsx` — front/back textareas, save.
- `review/ReviewSession.tsx` — flip/grade state machine; **grade buttons hardcode semantic colors** Again `red-600/80`, Hard `amber-600/80`, Good `green-600/80`, Easy `blue-600/80` (cannot collapse into a single variant; decide zen treatment per-grade).

Shared chrome (`.astro`, server-rendered, **inline SVG icons by design — no lucide islands**):
- `AppHeader.astro` — logo + nav (Dashboard/Learn/Cards, active state) + account-menu dropdown (avatar `bg-gradient-to-br from-purple-500 to-blue-500`, menu `bg-[#0f1529]`). On all protected pages **except** dashboard.
- `AppFooter.astro` — `border-t border-white/10 … text-blue-100/60`; on all non-auth pages.
- `Welcome.astro` — public landing: cosmic bg + blurred gradient orbs + starfield, gradient hero text, three `Panel` feature cards.
- `Banner.astro` — config-error banner with its own inline `<style>` (light info/warning/error palettes).

Recurring patterns to plan around: **glassmorphism everywhere** (`bg-white/X` + `border-white/X` + `backdrop-blur`); **many one-off button overrides** that bypass the `button.tsx` variants (SubmitButton, save buttons, grade buttons) — these won't pick up token changes and must be edited by hand; **no Input/Textarea/Dialog primitives** (inline styling), which is an opportunity to introduce zen primitives.

### Area 4 — Pages, layouts & screens

Layout: `src/layouts/Layout.astro` — minimal shell `<html lang="en">` / `<head>` (charset, viewport, `favicon.png`, title) / `<body>` with optional config `Banner` + `<slot/>`. Imports `global.css` (L2). Inline `<style>`: `html,body { margin:0; width:100%; height:100% }`. Chrome (`AppHeader`/`AppFooter`) is imported **per page**, not baked into the layout (auth/landing want different chrome).

Pages (`src/pages/`, excluding `api/`):
- `index.astro` → `Welcome.astro` — public landing (own header with sign-in/up, hero, 3 feature panels, footer). `bg-cosmic min-h-screen`.
- `auth/signin.astro` → `SignInForm` — centered glass card `max-w-sm rounded-2xl border-white/10 bg-white/10 … backdrop-blur-xl` on `bg-cosmic`; gradient title. No AppHeader/Footer.
- `auth/signup.astro` → `SignUpForm` — same shell.
- `auth/confirm-email.astro` — static dev/prod confirmation card, same shell.
- `dashboard.astro` — **no AppHeader** (recently redesigned): centered hero "What are you up to **today?**" + three stacked action panels (Learn→/review, Cards→/cards, Create Deck disabled "Coming soon") + AppFooter. `bg-cosmic min-h-screen … max-w-2xl`.
- `cards/index.astro` → `CardList` + `AddCardModal` (FAB) — AppHeader/Footer, `max-w-3xl`, empty/error/list states.
- `cards/new.astro` — 302 redirect to `/generate?mode=manual` (legacy shim, no UI).
- `generate.astro` → `CreateCard` — AppHeader/Footer, `max-w-3xl`, AI/Manual toggle.
- `review/index.astro` → `ReviewSession` — AppHeader/Footer, `max-w-3xl`, loading/empty/active/complete states.

Common page container idiom (must change for zen's light look): `bg-cosmic flex min-h-screen flex-col p-4 text-white sm:p-8` + `mx-auto w-full max-w-3xl flex-1 py-6`. Headings use gradient clip text `bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-transparent`. No page-level `<style>` blocks except `Banner.astro`.

### Area 5 — Integration constraints (Astro 6 + Cloudflare + Tailwind 4)

- `astro.config.mjs` — `@astrojs/cloudflare`, `output: "server"`, integrations `react()`+`sitemap()`, vite `tailwindcss()`. **No `base`/`site`, no image/assets config** → nothing rewrites font URLs or a new CSS import. CSS is Tailwind-processed via Vite into a hashed asset; fonts (`<link>` or `@font-face`) are untouched by that pipeline.
- **Static assets**: `public/` is the root (`public/favicon.png`, `template.png`, `.assetsignore`). `public/fonts/x.woff2` → served at `/fonts/x.woff2` by Cloudflare's static-asset layer (not workerd) — self-hosting works.
- **No CSP, no `_headers` file** anywhere → a remote Google/Bunny Fonts `<link>` is not currently blocked. (If a CSP is added later, self-host instead.)
- **No font tooling installed** — no `@fontsource/*`, no Astro 6 experimental `experimental.fonts` API in config.
- **Tailwind `@import` ordering is the trap**: `@import "tailwindcss";` must be effectively first in `global.css`. A remote CSS `@import` (like zen's `fonts.css`) must precede all other statements — so it would fight Tailwind. → Load fonts via `<head>` `<link>`, keep them out of the Tailwind-processed CSS.
- **Token systems don't overlap by name** (except `--accent`): zen uses `--paper/--ink/--accent` raw hex; shadcn uses `--background/--foreground/--primary` oklch. Don't naively merge both `:root` blocks (collides on `--accent`, conflicts in meaning). Re-point shadcn names instead.
- **Tooling to respect**: Prettier with `prettier-plugin-tailwindcss` auto-sorts classes (don't hand-order); `prettier-plugin-astro`; `printWidth 120`. lint-staged runs `prettier --write` on `*.{json,css,md}` and `eslint --fix` on `*.{ts,tsx,astro}`. ESLint type-checked + `eslint-plugin-astro` (`astro/no-unused-css-selector` warn, `astro/no-set-html-directive` error). **No stylelint, no test runner** → gates are `npm run lint` + `npm run build` only.

## Recommended Integration Approach

A pragmatic order of operations for the plan (not a final contract — `/10x-plan` owns that):

1. **Fonts** — add to `src/layouts/Layout.astro` `<head>`: `preconnect` to `fonts.googleapis.com` / `fonts.gstatic.com` + the combined `css2?family=DM+Sans:…&family=IBM+Plex+Mono:…&display=swap` URL from zen's `tokens/fonts.css`. (Optional later hardening: self-host via `@fontsource-variable/dm-sans` + `@fontsource/ibm-plex-mono` if a CSP is introduced.)
2. **Tokens in `global.css`** — keep `@import "tailwindcss";` first. Then:
   - **Re-point the existing shadcn names** to zen brand values, preserving names so `button.tsx` + `@theme inline` keep resolving: `--background → #FDFCF8 (paper)`, `--foreground → #1a1a1a (ink)`, `--card/--popover → #ffffff`, `--primary → #7C3AED`, `--primary-foreground → #fff`, `--muted-foreground → #6b6b6b`, `--border/--input → #1a1a1a (the 2px ink border)`, `--ring → #7C3AED`, and **`--radius → 0`** (square; this visibly changes every shadcn component — intended).
   - Copy zen's **effects** tokens verbatim into `:root`: `--border-width 2px`, `--shadow 3px 3px 0`, `--shadow-press 1px 1px 0`, `--shadow-lg 5px 5px 0`, `--press-shift`, `--dur-fast .12s`.
   - Add font tokens + wire into Tailwind: in `@theme inline` add `--font-sans: 'DM Sans', sans-serif;` and `--font-mono: 'IBM Plex Mono', monospace;`; set `body { font-family: var(--font-mono) }` in `@layer base` (mono-first body per brand).
3. **Dark mode** — the app already standardizes on `.dark` (class). Fold zen's `[data-theme="dark"]` values into the existing `.dark` block; **don't** introduce a second mechanism. (Note: dark is currently inert; decide whether ds-implementation also wires a real toggle or just keeps the light brand. Light is zen's canonical theme, so shipping light-only is acceptable for MVP.)
4. **Custom utilities / shared primitives** — replace `@utility bg-cosmic` with the paper background (or delete and use `bg-background`). Restyle `Badge.astro`, `Panel.astro`, `Cta.astro`, and `button.tsx` to the hard-border/hard-shadow/square look. Consider adding zen-style `Input`/`Textarea`/`Card` primitives to kill the inline-textarea duplication.
5. **Sweep hardcoded utilities** — this is the bulk of the work and **token re-pointing will NOT do it for you**: remove/replace `bg-cosmic`, `text-white`, `text-blue-100/*`, `bg-purple-600`, `bg-white/5`, `bg-white/10`, `border-white/10|15|20`, gradient clip-text headings, the cosmic orbs/starfield in `Welcome.astro`, modal `bg-[#0f1529]`, and the one-off button overrides (SubmitButton, save buttons, ReviewSession grade buttons). Map them to semantic tokens / zen classes.
6. **Per-grade colors** — `ReviewSession.tsx` grade buttons need an explicit zen-compatible decision (e.g. keep semantic red/amber/green/blue but as flat brutalist fills with hard shadows, or accent-only). Flag for the plan.
7. **Verify** — `npm run lint` + `npm run build`; manually eyeball each page (landing, signin/up, dashboard, cards, generate, review). No test runner exists.

## Code References

- `.claude/skills/zen/SKILL.md` / `README.md` — DS identity, voice, component index.
- `.claude/skills/zen/tokens/{colors,effects,typography,spacing,fonts}.css` — exact token values to port.
- `.claude/skills/zen/components/{core,blocks}/*` , `.claude/skills/zen/ui_kits/{website,macos-app}/` — component & screen references.
- `src/styles/global.css:1-124` — the single retheme target (Tailwind import, `:root`/`.dark` oklch tokens, `@theme inline`, `bg-cosmic`, base layer).
- `src/layouts/Layout.astro:2` — `global.css` import; `<head>` is where fonts go.
- `astro.config.mjs:6,13-15` — `@tailwindcss/vite`, Cloudflare adapter, `output: "server"`.
- `src/lib/utils.ts` — `cn()`.
- `components.json` — shadcn new-york / neutral / cssVariables.
- `public/` — static-asset root (`favicon.png`, `template.png`, `.assetsignore`).
- `src/components/ui/{button.tsx,Badge.astro,Panel.astro,Cta.astro,LibBadge.astro}` — primitives.
- `src/components/{AppHeader.astro,AppFooter.astro,Welcome.astro,Banner.astro}` — chrome.
- `src/components/auth/*`, `cards/*`, `generate/*`, `manual/ManualCardForm.tsx`, `review/ReviewSession.tsx` — islands with hardcoded dark utilities.
- `src/pages/{index,dashboard,generate}.astro`, `src/pages/auth/{signin,signup,confirm-email}.astro`, `src/pages/cards/{index,new}.astro`, `src/pages/review/index.astro` — screens.

## Architecture Insights

- **One file controls the token theme** (`global.css`) and **one file controls fonts/chrome shell** (`Layout.astro`). High leverage: re-pointing shadcn tokens + adding fonts is small.
- **But tokens are under-used in the live UI** — the real work is sweeping hardcoded dark/glass utilities out of ~20 pages/components. A token swap alone produces an inconsistent half-reskin.
- **`button.tsx` is the only token-consuming component**; everything else is literal utilities. Plan for hand-edits, not just a theme flip.
- **Astro chrome is intentionally island-free** (inline SVGs, server-rendered) — keep it that way; don't introduce React just to restyle.
- **Zen is a light theme; the app is dark.** This is a polarity flip, not a hue tweak — every "dark surface / light text" assumption inverts.
- **Square corners + hard shadows + 2px ink borders** are the most disruptive zen traits against the current `rounded-2xl`/soft-shadow/`border-white/10` look.

## Historical Context (from prior changes)

- `context/changes/user-flow-improvements/plan.md` — the S-06 change that built the current chrome (commits `ea7de86`→`99313ed`, `8f02d8d`). Established: shared chrome as server-rendered `.astro` with inline SVGs (no lucide islands); UI primitives in `src/components/ui/`; the "Recall" cosmic dark visual language. **Explicitly decided "No new font — stay on system sans" (plan.md:40) and "keep hardcoded cosmic utilities; no `.dark`-token refactor" (plan.md:42)** — ds-implementation deliberately reverses both.
- `context/changes/{ai-card-generation,flashcard-store-and-isolation,srs-review-session}/` — created the generate/cards/review islands and pages now in scope for restyle.
- `context/changes/s-03/plan.md:45` — original "no global nav" choice, later superseded by S-06.
- `context/foundation/lessons.md` — one lesson (push Supabase migrations to remote as part of deploy). **Not relevant** to a pure frontend/CSS change (no DB/migration here).

## Related Research

- None prior. This is the first research artifact under `context/changes/ds-implementation/`.

## Open Questions

1. **Dark mode**: ship zen's canonical **light** theme only (simplest, dark is currently inert), or also wire a real `.dark` toggle using zen's dark remap? Recommendation: light-only for MVP.
2. **open-wispr branding leakage**: "adopt as-is" covers the *visual* language. The voice (lowercase product name, privacy copy, Breaking-Bad demo strings) is open-wispr product copy — confirm we keep 10xCards's own product name/copy and only adopt zen's *typographic/casing* conventions (UPPERCASE labels, sentence-case headings).
3. **Grade-button colors** (`ReviewSession.tsx`): keep semantic red/amber/green/blue (as flat brutalist fills) or collapse toward accent-only? Needs a design call in the plan.
4. **New primitives**: introduce zen-style `Input`/`Textarea`/`Card`/`Tag` primitives to replace inline-styled textareas, or keep restyle minimal and edit utilities in place? Affects plan size.
5. **Self-host vs remote fonts**: `<link>` to Google Fonts is fine now (no CSP). Worth self-hosting for privacy/offline given there's a privacy-minded brand? Optional follow-up.
