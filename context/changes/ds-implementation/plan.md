# Apply the zen Design System to the 10xCards Frontend — Implementation Plan

## Overview

Reskin the entire 10xCards frontend to the **zen** design system (open-wispr's neo-brutalist look) **as-is**: warm off-white paper `#FDFCF8`, near-black ink `#1a1a1a` for text *and* 2px borders, a single electric-purple accent `#7C3AED`, **hard offset shadows** (no blur), **square corners**, and a **monospace-first** type system (IBM Plex Mono body + DM Sans 800 display). This is a **light-only** theme and a full visual polarity flip away from the current dark "cosmic" UI.

## Current State Analysis

(Grounded in `context/changes/ds-implementation/research.md` — codebase baseline.)

- **Theming is one file**: `src/styles/global.css` (Tailwind 4 CSS-first; **no `tailwind.config.*`**). It holds `@import "tailwindcss"`, `@custom-variant dark`, shadcn oklch tokens in `:root`/`.dark`, `@theme inline` mapping, `@utility bg-cosmic`, and a base layer.
- **Only one token-consuming component**: `src/components/ui/button.tsx` (CVA). Everything else is inline Tailwind utilities or tiny `.astro` primitives.
- **Dark mode is inert**: nothing ever adds `.dark`. The app looks dark because pages **hardcode** dark/glass utilities (`bg-cosmic`, `text-white`, `text-blue-100/*`, `bg-purple-600`, `bg-white/5`, `border-white/10`, gradient clip-text). Re-pointing tokens alone will NOT restyle these — they must be hand-swept.
- **No font is loaded anywhere** (greenfield typography). `Layout.astro` `<head>` has no font `<link>`.
- **Chrome is server-rendered `.astro` with inline SVG icons** (`AppHeader`, `AppFooter`, `Welcome`, `Banner`) — deliberately island-free; keep it that way.
- **Tooling**: Prettier + `prettier-plugin-tailwindcss` (auto-sorts classes — don't hand-order), `prettier-plugin-astro`, ESLint type-checked + `eslint-plugin-astro`. **No stylelint, no test runner.** Gates are `npm run lint` + `npm run build`.
- **Cloudflare Workers / Astro 6 SSR**: `public/` is the static-asset root; no CSP / no `_headers` file, so a Google Fonts `<link>` is not blocked.

## Desired End State

Every user-facing screen renders in zen's light neo-brutalist style:
- Paper background, ink text, 2px ink borders, square corners, hard `3px 3px 0` shadows, purple accent.
- DM Sans on headings, IBM Plex Mono on body/labels/UI; UPPERCASE wide-tracked labels and sentence-case headings.
- No residual `bg-cosmic`, `text-white`, `bg-white/*`, `border-white/*`, purple/blue gradient, or glassmorphism anywhere.
- 10xCards's own product name and copy are retained (only casing/typography conventions adopted, not open-wispr's voice).
- Shared, reusable primitives (`Button`, `Input`, `Textarea`, `Card`, `Badge`, `Panel`, `Cta`) carry the look; call sites consume them instead of re-littering utilities.

**Verification**: `npm run lint` and `npm run build` pass; manual walkthrough of all routes (`/`, `/auth/signin`, `/auth/signup`, `/auth/confirm-email`, `/dashboard`, `/cards`, `/generate`, `/review`) shows a consistent zen look with the brand fonts loaded.

### Key Discoveries:

- Re-point shadcn token **names** (not introduce zen's `--paper`/`--ink` names) so `button.tsx` + `@theme inline` keep resolving — `src/styles/global.css:6-111`.
- Do **NOT** import zen's `styles.css`/`tokens/*.css` — relative paths + a remote `@import` break Tailwind's `@import "tailwindcss"` first-line ordering. Port values by hand.
- Fonts via `<head>` `<link>`, never a CSS `@import` — `src/layouts/Layout.astro`.
- `--radius` must go to `0` for square corners; this visibly changes every shadcn component (intended).
- `ReviewSession.tsx` grade buttons hardcode red/amber/green/blue — replace with zen accent+ink treatment.
- Prior change `user-flow-improvements` decided "no new font" and "keep cosmic utilities"; this change **deliberately supersedes both**.

## What We're NOT Doing

- **No dark mode toggle** — light-only; the dead `.dark` block and `@custom-variant dark` are removed (or neutralized), not extended.
- **No copy rewrite** — keep all existing 10xCards product text and the product name; adopt only typographic casing conventions.
- **No self-hosted fonts** — Google Fonts `<link>` for now (self-hosting is a possible later hardening if a CSP is added).
- **No new product features, routes, API, or data-model changes** — purely presentational.
- **No semantic color-coding on grade buttons** — zen-faithful accent+ink instead.
- **No porting of zen's React component files or UI kits verbatim** — they are references; we adapt patterns into our existing `.astro`/`.tsx` structure.
- **No restyle of `/api/*` routes** (non-visual).

## Implementation Approach

Page-by-page vertical, with all shared infrastructure delivered first. **Phase 1** establishes the foundation (fonts, retokened `global.css`, restyled + new primitives, restyled shared chrome) so that every later phase can finish a screen end-to-end by composing those primitives and sweeping that screen's residual hardcoded utilities. Phases 2–6 each take one screen group from "dark/glass" to "fully zen," verifiable in isolation.

Because token re-pointing only restyles `button.tsx`, the dominant per-screen task is **replacing hardcoded utility classes** with semantic tokens / primitive components. Each screen phase is therefore: (a) swap container/background/text utilities, (b) replace inline inputs/cards with the new primitives, (c) apply zen casing to labels/headings, (d) verify lint+build+visual.

## Critical Implementation Details

- **Tailwind `@import` ordering**: `@import "tailwindcss";` must remain the first statement in `global.css`. Fonts load via `<link>` in `Layout.astro`, never via CSS `@import`.
- **Token name preservation**: keep the existing shadcn variable *names* (`--background`, `--foreground`, `--primary`, `--border`, `--input`, `--ring`, `--radius`, `--muted-foreground`, etc.) and only change their *values* to zen's palette, so `@theme inline` and `button.tsx` continue to work without edits to their references.
- **Font token wiring**: Tailwind 4 maps `--font-*` theme keys to `font-*` utilities. Add `--font-sans` (DM Sans) and `--font-mono` (IBM Plex Mono) in `@theme inline`, and set the mono family as the default `body` font in the base layer.
- **Hard-shadow as a utility**: zen's `3px 3px 0` shadow and 2px ink border are not expressible by default Tailwind shadow utilities cleanly — expose them as CSS custom properties (and/or a small `@utility`) so primitives and call sites can apply them consistently, including the hover "press" (`translate(2px,2px)` + shadow collapse to `1px 1px 0`).

## Phase 1: Foundation & Shared Layer

### Overview

Load the brand fonts, convert `global.css` to the zen token system, restyle the existing primitives, add the missing core primitives, and restyle the shared chrome. After this phase the design language exists and is consumable everywhere.

### Changes Required:

#### 1. Brand fonts

**File**: `src/layouts/Layout.astro`

**Intent**: Make DM Sans + IBM Plex Mono available app-wide by adding the Google Fonts stylesheet to `<head>`, so every page renders in brand type.

**Contract**: Add `preconnect` links to `fonts.googleapis.com` and `fonts.gstatic.com` (crossorigin) plus the combined stylesheet `<link>` using zen's exact URL from `.claude/skills/zen/tokens/fonts.css` (`DM+Sans:opsz,wght@9..40,500;9..40,700;9..40,800&family=IBM+Plex+Mono:wght@400;500;600&display=swap`). No CSS `@import`.

#### 2. Token system rewrite

**File**: `src/styles/global.css`

**Intent**: Replace the dark/oklch shadcn theme with zen's light brand values, keeping shadcn variable names so existing consumers keep working, and add the zen effects + font tokens.

**Contract**:
- Keep `@import "tailwindcss";` first; keep `@import "tw-animate-css";`.
- Re-point `:root` shadcn tokens to zen values (names unchanged): `--background → #FDFCF8`, `--foreground → #1a1a1a`, `--card`/`--popover → #ffffff` with ink foregrounds, `--primary → #7C3AED`, `--primary-foreground → #ffffff`, `--secondary`/`--muted`/`--accent → zen tints (#F5F3EE / #EDE9FE as appropriate)`, `--muted-foreground → #6b6b6b`, `--border`/`--input → #1a1a1a`, `--ring → #7C3AED`, and **`--radius → 0`** (with the derived `--radius-*` recalculated or set to square). Map `--destructive` to a zen-compatible value.
- Add zen effect tokens to `:root`: `--border-width: 2px`, `--shadow: 3px 3px 0 var(--foreground)`, `--shadow-press: 1px 1px 0 var(--foreground)`, `--shadow-lg: 5px 5px 0 var(--foreground)`, `--press-shift: translate(2px,2px)`, `--dur-fast: .12s`.
- Add font families and wire them: declare `--font-sans: 'DM Sans', sans-serif;` and `--font-mono: 'IBM Plex Mono', monospace;` in `@theme inline`; set `body { font-family: var(--font-mono); }` in `@layer base`.
- Remove the inert `.dark` block and `@custom-variant dark` (light-only); replace `@utility bg-cosmic` with a paper background (or delete and rely on `bg-background`).

#### 3. Restyle existing primitives

**Files**: `src/components/ui/button.tsx`, `src/components/ui/Badge.astro`, `src/components/ui/Panel.astro`, `src/components/ui/Cta.astro`

**Intent**: Convert the existing primitives to zen's hard-border/hard-shadow/square look with the press interaction, so all consumers inherit the brand automatically.

**Contract**: `button.tsx` CVA variants (`default`/`destructive`/`outline`/`secondary`/`ghost`/`link`, sizes) restyled to 2px ink border + hard shadow + square + uppercase tracked label + `.12s` press on hover (`default` = filled accent). `Badge.astro` → zen Tag look (square/`--radius-xs`, ink border, uppercase label, accent-light fill option). `Panel.astro` → ink-bordered paper/surface card with hard shadow (no glass). `Cta.astro` → primary = filled accent, secondary = ink-bordered, both with press.

#### 4. Add core primitives

**Files**: `src/components/ui/Input.astro` (or `.tsx` as needed), `src/components/ui/Textarea.astro`/`.tsx`, `src/components/ui/Card.astro`

**Intent**: Provide reusable zen-styled form and surface primitives to replace the inline-styled inputs/textareas/cards scattered across the app, removing duplication and locking consistency.

**Contract**: `Input`/`Textarea` — paper/surface fill, 2px ink border, square, IBM Plex Mono, accent focus ring (`--ring`), placeholder in `--muted-foreground`; `Textarea` supports `resize-y` and the existing char-count usage pattern (label/counter slots). `Card` — surface fill, 2px ink border, hard shadow, configurable padding (`--pad-card`). Note where React islands need `.tsx` versions vs Astro `.astro` (auth/cards/generate islands consume React; landing/dashboard consume Astro).

#### 5. Restyle shared chrome

**Files**: `src/components/AppHeader.astro`, `src/components/AppFooter.astro`, `src/components/Banner.astro`

**Intent**: Bring the always-present chrome into the zen look so screen phases render end-to-end, keeping them server-rendered with inline SVGs (no new islands).

**Contract**: `AppHeader` — paper/ink header bar (or inverted ink header per zen's `--header-bg`), uppercase tracked nav labels, active state via accent/underline, account avatar + dropdown restyled to ink-bordered surface (drop `bg-[#0f1529]` and purple/blue gradient). `AppFooter` — ink top border, mono text, accent hover. `Banner` — replace its inline light info/warning/error styles with zen-compatible tokenized equivalents.

### Success Criteria:

#### Automated Verification:

- [ ] Linting passes: `npm run lint`
- [ ] Production build succeeds: `npm run build`
- [ ] No remaining references to `bg-cosmic` or `.dark` in `src/styles/global.css` (`grep -n "bg-cosmic\|\.dark" src/styles/global.css` returns nothing)

#### Manual Verification:

- [ ] DM Sans + IBM Plex Mono load (visible in any rendered page / Network panel)
- [ ] A page using `AppHeader`/`AppFooter` (e.g. `/cards`) shows zen chrome: paper bg, ink borders, square corners, hard shadows, purple accent
- [ ] Restyled `Button`/`Badge`/`Panel`/`Cta` and new `Input`/`Textarea`/`Card` render correctly in at least one real usage
- [ ] Hover "press" interaction works on buttons/CTAs

**Implementation Note**: After automated verification passes, pause for human confirmation of manual testing before Phase 2.

---

## Phase 2: Landing + Auth Screens

### Overview

Restyle the public entry surfaces: landing and the three auth screens.

### Changes Required:

#### 1. Landing

**File**: `src/components/Welcome.astro` (and `src/pages/index.astro` if container utilities live there)

**Intent**: Replace the cosmic dark hero with a zen light hero, removing the orbs/starfield/gradient effects entirely.

**Contract**: Remove blurred gradient orbs, starfield, `bg-cosmic`, and gradient clip-text heading. Hero on paper with DM Sans display heading + mono lead; feature cards via the restyled `Panel`/`Card`; public header CTAs via `Cta`; uppercase tracked eyebrow/labels.

#### 2. Auth pages

**Files**: `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`, `src/pages/auth/confirm-email.astro`, `src/components/auth/SignInForm.tsx`, `src/components/auth/SignUpForm.tsx`, `src/components/auth/FormField.tsx`, `src/components/auth/SubmitButton.tsx`, `src/components/auth/PasswordToggle.tsx`, `src/components/auth/ServerError.tsx`

**Intent**: Convert the glass auth cards and forms to zen: ink-bordered paper card on paper background, brand type, primitives for inputs/buttons.

**Contract**: Page containers drop `bg-cosmic`/glass card classes → paper + `Card` primitive. `FormField` uses the new `Input` primitive (accent focus ring, ink border). `SubmitButton` adopts the zen accent button (remove hardcoded `bg-purple-600`). `PasswordToggle`/`ServerError` recolored to ink/accent/zen-error tokens. Gradient titles → DM Sans ink headings.

### Success Criteria:

#### Automated Verification:

- [ ] Linting passes: `npm run lint`
- [ ] Production build succeeds: `npm run build`
- [ ] No `bg-cosmic`/`text-white`/`bg-white/`/`border-white/` left in landing + auth files (`grep`)

#### Manual Verification:

- [ ] `/`, `/auth/signin`, `/auth/signup`, `/auth/confirm-email` render fully zen (paper, ink, square, hard shadows, accent)
- [ ] Sign-in/sign-up forms still submit and show validation/server errors correctly
- [ ] Password visibility toggle works

**Implementation Note**: Pause for human manual-testing confirmation before Phase 3.

---

## Phase 3: Dashboard

### Overview

Restyle the authenticated hub.

### Changes Required:

#### 1. Dashboard screen

**File**: `src/pages/dashboard.astro`

**Intent**: Convert the cosmic hero + three glass action panels to zen.

**Contract**: Container → paper (drop `bg-cosmic`, `text-white`); hero heading → DM Sans ink with sentence case (replace gradient clip-text); the three action blocks → `Card`/`Panel` primitives with ink border + hard shadow + press, uppercase tracked labels, accent iconography; "Coming soon" via restyled `Badge`. `AppFooter` already zen from Phase 1.

### Success Criteria:

#### Automated Verification:

- [ ] Linting passes: `npm run lint`
- [ ] Production build succeeds: `npm run build`
- [ ] No `bg-cosmic`/glass/gradient utilities left in `dashboard.astro` (`grep`)

#### Manual Verification:

- [ ] `/dashboard` renders fully zen; the three actions (Learn, Cards, Create Deck disabled) look correct with hover press
- [ ] Navigation links to `/review` and `/cards` still work

**Implementation Note**: Pause for human manual-testing confirmation before Phase 4.

---

## Phase 4: My Cards

### Overview

Restyle the cards browse/edit screen, the card list island, and the floating add-card modal.

### Changes Required:

#### 1. Cards page + list

**Files**: `src/pages/cards/index.astro`, `src/components/cards/CardList.tsx`

**Intent**: Convert page container, empty/error states, and per-card rows (view/edit/delete) to zen, using primitives for cards/inputs/buttons.

**Contract**: Container → paper; headings → DM Sans ink; card rows → `Card` primitive (ink border, hard shadow); inline edit textareas → `Textarea` primitive; action buttons → zen `Button` variants (remove hardcoded `bg-purple-600`/glass); source badges → restyled `Badge` with uppercase labels.

#### 2. Add-card FAB + modal

**File**: `src/components/cards/AddCardModal.tsx`

**Intent**: Restyle the floating action button and the custom modal to zen while preserving the existing backdrop/Esc/click-outside behavior.

**Contract**: FAB → accent fill, square or `--radius-pill` per zen, hard shadow, press (drop `shadow-purple-900/40`). Modal surface → paper/`Card` with 2px ink border + hard shadow (drop `bg-[#0f1529]`); backdrop retained. Modal hosts the `CreateCard` island (styled in Phase 5).

### Success Criteria:

#### Automated Verification:

- [ ] Linting passes: `npm run lint`
- [ ] Production build succeeds: `npm run build`
- [ ] No dark/glass utilities left in `cards/index.astro`, `CardList.tsx`, `AddCardModal.tsx` (`grep`)

#### Manual Verification:

- [ ] `/cards` renders fully zen across empty, error, and populated states
- [ ] Edit / save / cancel / delete per card still work
- [ ] FAB opens the modal; backdrop click + Esc dismiss; modal looks zen

**Implementation Note**: Pause for human manual-testing confirmation before Phase 5.

---

## Phase 5: Create Flashcards (Generate + Manual)

### Overview

Restyle the consolidated creation surface: AI/Manual toggle, AI generation view, candidate review, and manual form.

### Changes Required:

#### 1. Generate page + toggle

**Files**: `src/pages/generate.astro`, `src/components/generate/CreateCard.tsx`

**Intent**: Convert page chrome and the AI/Manual tab toggle to zen.

**Contract**: Container → paper, DM Sans heading; toggle → ink-bordered segmented control, active tab = accent fill, inactive = ink/muted (drop `bg-white/5`/`bg-purple-600`), uppercase tracked tab labels.

#### 2. AI generation + candidates

**Files**: `src/components/generate/GenerateView.tsx`, `src/components/generate/CandidateCard.tsx`

**Intent**: Restyle source input, char counter, progress, candidate cards, and accept/reject actions to zen.

**Contract**: Source input → `Textarea` primitive; char counter warning/over states recolored to zen (accent / zen-error, not arbitrary amber/red glass); progress bar → ink/accent on paper; candidate cards → `Card` primitive; "edited" badge → restyled `Badge`; accept/reject → zen `Button` variants (remove hardcoded purple/glass).

#### 3. Manual form

**File**: `src/components/manual/ManualCardForm.tsx`

**Intent**: Convert the manual entry form to zen primitives.

**Contract**: Wrapper → `Card`; front/back inputs → `Textarea` primitive; save → zen accent `Button`; success/error text → zen tokens; preserve auto-refocus-after-save behavior.

### Success Criteria:

#### Automated Verification:

- [ ] Linting passes: `npm run lint`
- [ ] Production build succeeds: `npm run build`
- [ ] No dark/glass utilities left in `generate.astro`, `CreateCard.tsx`, `GenerateView.tsx`, `CandidateCard.tsx`, `ManualCardForm.tsx` (`grep`)

#### Manual Verification:

- [ ] `/generate` (and `/cards/new` redirect) render fully zen in both AI and Manual modes
- [ ] AI generation: paste text → generate → review candidates → accept/reject works; counters/progress behave
- [ ] Manual save works and refocuses for the next card
- [ ] The same `CreateCard` rendered inside the cards modal (Phase 4) also looks zen

**Implementation Note**: Pause for human manual-testing confirmation before Phase 6.

---

## Phase 6: Review Session + Final Sweep

### Overview

Restyle the spaced-repetition review screen with zen-faithful grade buttons, then do a whole-app consistency pass.

### Changes Required:

#### 1. Review screen

**Files**: `src/pages/review/index.astro`, `src/components/review/ReviewSession.tsx`

**Intent**: Convert the review container and the flip/grade flow to zen, replacing the hardcoded semantic grade colors with a zen-faithful accent+ink treatment.

**Contract**: Container → paper, DM Sans heading; question/answer card → `Card` primitive; "Show answer" → accent `Button`; **grade buttons (Again/Hard/Good/Easy)** → zen accent+ink (no red/amber/green/blue): differentiate by label + position (uppercase tracked labels, interval hint as mono sub-label), e.g. primary recommended grade = filled accent, others = ink-bordered; loading/empty/complete states recolored to zen.

#### 2. Final consistency sweep

**Files**: repo-wide `src/` (any residual offenders)

**Intent**: Catch any leftover dark/glass utilities, gradient text, or stray colors missed by per-screen phases, ensuring a uniform zen result.

**Contract**: `grep` across `src/` for `bg-cosmic`, `text-white`, `bg-white/`, `border-white/`, `from-purple`, `to-blue`, `bg-clip-text`, `text-blue-100`, `bg-[#0f1529]`, `shadow-purple` and resolve every hit. Confirm typography conventions (UPPERCASE labels, sentence-case headings) applied consistently.

### Success Criteria:

#### Automated Verification:

- [ ] Linting passes: `npm run lint`
- [ ] Production build succeeds: `npm run build`
- [ ] Repo-wide sweep clean: `grep -rn "bg-cosmic\|text-white\|bg-white/\|border-white/\|from-purple\|to-blue\|bg-clip-text\|text-blue-100\|bg-\[#0f1529\]\|shadow-purple" src/` returns nothing (or only consciously-accepted hits)

#### Manual Verification:

- [ ] `/review` renders fully zen; flip + all four grades work; grade buttons are zen-faithful and still distinguishable
- [ ] Full walkthrough of all routes shows one consistent zen look with brand fonts
- [ ] No visual regressions in any flow (auth, create, browse, review)

**Implementation Note**: Final phase — confirm the whole-app walkthrough with the human before marking the change complete.

---

## Testing Strategy

### Manual Testing Steps:

1. Load each route: `/`, `/auth/signin`, `/auth/signup`, `/auth/confirm-email`, `/dashboard`, `/cards`, `/generate`, `/review`.
2. Confirm brand fonts load (DM Sans headings, IBM Plex Mono body) and the zen look is consistent (paper, ink, 2px borders, square, hard shadows, purple accent, no glass/gradient).
3. Exercise interactive flows end-to-end: sign in/up + validation/errors; create a card (AI + manual); browse/edit/delete; FAB modal; review session with all four grades.
4. Check hover "press" interactions on buttons/CTAs/cards.

(There is no automated test runner in this project — `npm run lint` + `npm run build` are the only automated gates.)

## Performance Considerations

- Google Fonts adds a render-blocking stylesheet request; `display=swap` (already in zen's URL) avoids invisible text. `preconnect` mitigates latency. Acceptable for MVP; self-hosting is a later option.
- No JS/runtime changes; CSS-only and class swaps have negligible runtime cost.

## Migration Notes

- No data migration. This is presentation-only.
- `user-flow-improvements` decisions ("no new font", "keep cosmic utilities", "no `.dark` refactor") are consciously superseded by this change.

## References

- Research: `context/changes/ds-implementation/research.md`
- Plan brief: `context/changes/ds-implementation/plan-brief.md`
- Design system source: `.claude/skills/zen/` (tokens at `.claude/skills/zen/tokens/*.css`, components at `.claude/skills/zen/components/`, kits at `.claude/skills/zen/ui_kits/`)
- Token target: `src/styles/global.css:1-124`
- Font/shell: `src/layouts/Layout.astro`
- Prior frontend conventions: `context/changes/user-flow-improvements/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Foundation & Shared Layer

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — 44b94cd
- [x] 1.2 Production build succeeds: `npm run build` — 44b94cd
- [x] 1.3 No remaining `bg-cosmic`/`.dark` references in `src/styles/global.css` — 44b94cd

#### Manual

- [x] 1.4 DM Sans + IBM Plex Mono load on rendered pages — 44b94cd
- [x] 1.5 A chrome page (e.g. `/cards`) shows zen header/footer (paper, ink borders, square, hard shadows, accent) — 44b94cd
- [x] 1.6 Restyled + new primitives render correctly in real usage — 44b94cd
- [x] 1.7 Hover "press" interaction works on buttons/CTAs — 44b94cd

### Phase 2: Landing + Auth Screens

#### Automated

- [x] 2.1 Linting passes: `npm run lint` — 7e50b4a
- [x] 2.2 Production build succeeds: `npm run build` — 7e50b4a
- [x] 2.3 No dark/glass utilities left in landing + auth files — 7e50b4a

#### Manual

- [x] 2.4 `/`, `/auth/signin`, `/auth/signup`, `/auth/confirm-email` render fully zen — 7e50b4a
- [x] 2.5 Sign-in/sign-up submit + validation/server errors work — 7e50b4a
- [x] 2.6 Password visibility toggle works — 7e50b4a

### Phase 3: Dashboard

#### Automated

- [x] 3.1 Linting passes: `npm run lint` — cdd80f3
- [x] 3.2 Production build succeeds: `npm run build` — cdd80f3
- [x] 3.3 No dark/glass/gradient utilities left in `dashboard.astro` — cdd80f3

#### Manual

- [x] 3.4 `/dashboard` renders fully zen; three actions correct with hover press — cdd80f3
- [x] 3.5 Navigation to `/review` and `/cards` works — cdd80f3

### Phase 4: My Cards

#### Automated

- [x] 4.1 Linting passes: `npm run lint` — 86f64c4
- [x] 4.2 Production build succeeds: `npm run build` — 86f64c4
- [x] 4.3 No dark/glass utilities left in `cards/index.astro`, `CardList.tsx`, `AddCardModal.tsx` — 86f64c4

#### Manual

- [x] 4.4 `/cards` renders fully zen across empty/error/populated states — 86f64c4
- [x] 4.5 Edit/save/cancel/delete per card work — 86f64c4
- [x] 4.6 FAB opens modal; backdrop + Esc dismiss; modal looks zen — 86f64c4

### Phase 5: Create Flashcards (Generate + Manual)

#### Automated

- [x] 5.1 Linting passes: `npm run lint` — 7ebd7e7
- [x] 5.2 Production build succeeds: `npm run build` — 7ebd7e7
- [x] 5.3 No dark/glass utilities left in generate/create files — 7ebd7e7

#### Manual

- [x] 5.4 `/generate` (+ `/cards/new` redirect) render fully zen in AI and Manual modes — 7ebd7e7
- [x] 5.5 AI generate → review → accept/reject works; counters/progress behave — 7ebd7e7
- [x] 5.6 Manual save works and refocuses for next card — 7ebd7e7
- [x] 5.7 `CreateCard` inside the cards modal also looks zen — 7ebd7e7

### Phase 6: Review Session + Final Sweep

#### Automated

- [x] 6.1 Linting passes: `npm run lint`
- [x] 6.2 Production build succeeds: `npm run build`
- [x] 6.3 Repo-wide dark/glass/gradient sweep clean across `src/`

#### Manual

- [x] 6.4 `/review` renders fully zen; flip + all four grades work; grade buttons zen-faithful and distinguishable
- [x] 6.5 Full walkthrough of all routes shows one consistent zen look with brand fonts
- [x] 6.6 No visual regressions in any flow
