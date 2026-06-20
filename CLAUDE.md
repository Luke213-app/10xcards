# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: 10xCards

> The block above is managed by `@przeprogramowani/10x-cli` (tracked by content hashes in `.claude/.10x-cli-manifest.json`). Do not edit between its BEGIN/END markers — changes there will conflict with the tool. Add project-specific guidance below this line only.

**Product (from `idea-notes.md`, written in Polish):** 10xCards is an MVP web app for AI-generated study flashcards feeding a spaced-repetition workflow. Core MVP scope: AI flashcard generation from pasted text, manual flashcard CRUD, user accounts, and integration with an existing (off-the-shelf) spaced-repetition algorithm. Explicit non-goals: a custom SR algorithm, multi-format import (PDF/DOCX), sharing decks between users, third-party integrations, and mobile apps. Success criteria: ≥75% of AI-generated cards accepted by users, and ≥75% of all cards created via AI.

**Status:** scaffolded from `10x-astro-starter` via `/10x-bootstrapper`. The starter ships auth + a sample protected dashboard only — none of the product features (AI generation, flashcard CRUD, SR integration) exist yet. Foundation docs (PRD, tech-stack hand-off, bootstrap verification log) live in `context/foundation/` and `context/changes/`. `CLAUDE.md.scaffold` is the starter's original rules file, kept as a `.scaffold` sibling — diff or delete it once you've absorbed anything useful.

## Commands

- `npm run dev` — dev server (runs on the Cloudflare `workerd` runtime via `@astrojs/cloudflare`, not plain Node)
- `npm run build` — production SSR build
- `npm run preview` — preview the production build
- `npm run lint` / `npm run lint:fix` — ESLint (flat config, type-checked rules)
- `npm run format` — Prettier (with `prettier-plugin-astro` + `prettier-plugin-tailwindcss`)
- **No test runner is configured** — there is no `test` script and no test files. Add one (e.g. Vitest) before writing tests; do not assume `npm test` works.
- Pre-commit: husky + lint-staged auto-runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.
- Local Supabase: `npx supabase start` (requires Docker); Studio at `http://localhost:54323`. Deploy: `npm run build` then `npx wrangler deploy`.

## Architecture

Astro 6 **server-side-rendered** app (`output: "server"` in `astro.config.mjs`) with React 19 islands, Tailwind 4, and Supabase auth, deployed to **Cloudflare Workers**. The edge runtime constrains long-running tasks, so the planned AI-generation flow must stream or chunk progress rather than block.

- **Pages are server-rendered by default; API routes must `export const prerender = false`.** API routes use uppercase `GET`/`POST` exports and validate input with zod.
- **Secrets**: `SUPABASE_URL` / `SUPABASE_KEY` are declared as server-only secrets in `astro.config.mjs` `env.schema` and read via `astro:env/server` — never hardcode them or expose them to the client. Locally they go in `.env` (Node) and `.dev.vars` (Cloudflare local dev); both are gitignored.
- **Auth flow spans four layers** — to change auth, trace all of them: `src/lib/supabase.ts` (cookie-based SSR client via `@supabase/ssr`) → `src/middleware.ts` (runs every request, resolves the user into `context.locals.user`, redirects unauthenticated users away from `PROTECTED_ROUTES`) → `src/pages/api/auth/{signin,signup,signout}.ts` (endpoints) → `src/pages/auth/*.astro` (forms). **Gate a new route by adding its path to `PROTECTED_ROUTES` in `src/middleware.ts`.**
- **Database**: Supabase migrations live in `supabase/migrations/` named `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS with granular per-operation, per-role policies on new tables. Currently only Supabase Auth's built-in `auth.users` is used — no app tables yet.
- **CI**: `.github/workflows/ci.yml` runs lint + build on every push/PR to `master`; needs `SUPABASE_URL` / `SUPABASE_KEY` repository secrets.

### Conventions

- **Path alias** `@/*` → `./src/*`.
- **Astro components** for static content/layout; **React** only where interactivity is needed (no Next.js directives like `"use client"`; extract hooks to `src/components/hooks/`).
- **Tailwind class merging**: use `cn()` from `@/lib/utils` (clsx + tailwind-merge) — never concatenate class strings manually.
- **shadcn/ui** ("new-york" variant) lives in `src/components/ui/`; add components with `npx shadcn@latest add [name]`.
- **Shared types** (entities, DTOs) go in `src/types.ts`; extracted business logic goes in `src/lib/services/`.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 4

Prepare for a harder implementation stream with the **research-backed planning chain**:

```
internal research (/10x-research) + external research (exa.ai, Context7) -> /10x-plan -> /10x-implement -> success
```

The lesson focus is distinguishing internal from external research and using evidence to back planning decisions.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Internal research (lesson focus)** | |
| `/10x-research <change-id>` | You need evidence from the existing codebase — patterns, conventions, integration points, or existing implementations. Runs parallel sub-agents over the repo and writes structured findings to `research.md`. |
| **External research (lesson focus)** | |
| exa.ai | You need AI-native web search for library comparisons, best practices, or ecosystem context that the codebase cannot answer. |
| Context7 (`resolve-library-id` → `get-library-docs`) | You need live, current documentation for a specific library or framework. Resolves a library ID first, then fetches relevant doc pages. |
| **Framing spare wheel** | |
| `/10x-frame <change-id>` | The plan won't converge, the plan doesn't deliver expected results, or persistent drift keeps breaking the implementation. Use as an escape hatch on a separate problem (demonstrated on Space Explorers example), not as pre-research ritual. |
| **Planning and execution** | |
| `/10x-plan <change-id>` / `/10x-implement <change-id> phase <n>` | Use the same planning and execution chain from Lesson 2, now with upstream research evidence feeding the plan. |

### Research discipline

- Internal research (`/10x-research`) answers "what does our codebase already do?" — patterns, schemas, conventions, integration points.
- External research (exa.ai, Context7) answers "what should we do?" — library capabilities, API docs, ecosystem best practices.
- Combine both as evidence-backed input to `/10x-plan`. A plan without research evidence on a non-trivial stream is a guess.
- Agent-friendly docs (`llms.txt`, markdown-for-agents, `/md` endpoints) are a quality signal for library selection — libraries that publish agent-readable docs integrate faster.

### `/10x-frame` as spare wheel

Three triggers for reaching for `/10x-frame`:
1. The plan won't converge — research keeps opening more questions instead of narrowing to a contract.
2. The plan doesn't deliver — implementation repeatedly fails to meet success criteria.
3. Persistent drift — the implementation keeps diverging from the plan in ways that suggest the problem was mis-framed.

Demonstrated on a Space Explorers example, not the SRS path. It is an escape hatch, not a mandatory step.

### Paths used by this lesson

- `context/changes/<change-id>/research.md` - internal research output
- `context/changes/<change-id>/frame.md` - framing output when needed
- `context/changes/<change-id>/plan.md` - evidence-backed implementation contract
- `context/foundation/lessons.md` - recurring rules and pitfalls

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
