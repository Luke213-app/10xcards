---
project: 10xCards
researched_at: 2026-06-17
recommended_platform: Cloudflare Workers
runner_up: Render
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 (+ React 19 islands)
  runtime: Cloudflare Workers (workerd edge)
---

## Recommendation

**Deploy on Cloudflare Workers.**

The stack was scaffolded with the `@astrojs/cloudflare` adapter, the developer is already comfortable with Cloudflare, and the platform passes all five agent-friendly criteria (CLI-first via `wrangler`, fully managed/serverless, `llms.txt`-published docs, deterministic `wrangler deploy`/`rollback`, and GA MCP servers). At MVP traffic (low QPS, ~10k–100k req/month) it runs at **$0** on the free tier. Crucially, Workers bills *CPU* time, not wall-clock — so awaiting a slow OpenRouter LLM call does **not** consume the request budget, which removes the function-timeout problem that handicaps the serverless alternatives (Netlify 10 s, Vercel Hobby 60 s) for this app's AI-generation flow.

## Platform Comparison

Hard filter applied: Q1 = "no persistent connections" drops nothing (the PRD has no realtime/background jobs); every candidate runs Astro 6 SSR via its respective adapter, so no platform is filtered on runtime. Interview weights then break the ties: Cloudflare familiarity (Q3) + the already-installed adapter pull strongly toward Cloudflare; single-region (Q4) neutralizes — but does not penalize — Cloudflare's edge advantage; external Supabase + OpenRouter (Q5) makes every platform's co-located database irrelevant, erasing the main advantage of Railway / Render / Fly.

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Net |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass | Pass | Pass | Pass | Pass | **5 Pass** |
| **Render** | Pass | Pass | Pass | Pass | Pass | **5 Pass** |
| **Vercel** | Pass | Pass | Pass | Pass | Partial (MCP public beta) | 4.5 |
| **Netlify** | Partial (rollback is UI-only) | Pass | Pass | Pass | Pass | 4.5 |
| **Railway** | Partial (no CLI rollback) | Pass | Pass | Pass | Partial (MCP WIP) | 4 |
| **Fly.io** | Partial (no rollback cmd) | Partial (Dockerfile + machine sizing) | Partial (no llms.txt) | Pass | Partial (MCP experimental) | 3.5 |

Per-platform notes (all statuses checked 2026-06-17):

- **Cloudflare Workers** — `wrangler deploy` / `wrangler rollback [version-id]` / `wrangler tail` cover the full ops loop. Docs publish `llms.txt` + `llms-full.txt`. GA managed MCP servers. Free tier: 100k req/**day**, 10 ms CPU/request; paid $5/mo lifts CPU to 30 s–5 min. Caveats: **Astro 6 is beta**; `@astrojs/cloudflare` **dropped Pages support** (Workers-only now) and **removed `Astro.locals.runtime`**; `nodejs_compat` + `compatibility_date ≥ 2024-09-23` required; 3 MB gzipped bundle cap (free) / 10 MB (paid).
- **Render** — the "boring Node" hedge: Astro runs as a native Node web service via `@astrojs/node` (no Dockerfile), so none of workerd's runtime quirks apply. **Mature CLI with real `rollback`**, GA MCP server (Aug 2025, 20+ tools), official Claude agent skills (`render-oss/skills`). Free tier spins down after 15 min (~50–60 s cold start) → budget the **$7/mo Starter** for honest performance. Requires `HOST=0.0.0.0`. No serverless function timeout — long AI calls are fine.
- **Vercel** — best raw DX, **first-class streaming** explicitly recommended for LLM output. But **Hobby tier forbids commercial use** → a monetizable product needs **Pro $20/mo**; serverless caps duration (Hobby 60 s); MCP is **public beta**. WebSockets unsupported (irrelevant here).
- **Netlify** — official MCP, `llms.txt`, draft-by-default deploys (`--prod` required — a safe default). Two real frictions: **rollback is a UI-only action** (no first-class CLI command), and a **10 s function timeout** (streaming buys time-to-first-byte but the 10 s cap still applies) — the tightest constraint against AI-generation latency. Lambda compatibility mode deprecated (sunset 2027-07-01).
- **Railway** — Railpack auto-detects Astro, `llms.txt` docs, git-push simplicity. But **no CLI rollback** (dashboard-only) and the MCP server is "work in progress." Free tier removed; ~$5–8/mo always-on (scale-to-zero is opt-in and adds cold starts).
- **Fly.io** — strongest at persistent VMs (not needed here). **Requires a Dockerfile** (`fly launch` auto-generates one, but it's container ops this research won't author), manual machine sizing, **no rollback command** (roll back via `fly deploy --image <ref>`), docs are HTML with no `llms.txt`. Free tier removed (Oct 2024); ~$2–5/mo. Highest solo-dev operational burden of the six.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Won on a clean 5/5 plus the two decisive weights: the developer's existing Cloudflare familiarity and the fact that the project's adapter is already `@astrojs/cloudflare`. The CPU-time billing model (vs wall-clock) is a structural fit for an app whose slowest operation is waiting on an external LLM — it sidesteps the function-timeout ceiling that constrains both serverless runners-up. Zero cost at MVP scale.

#### 2. Render

The deliberate hedge against Cloudflare's one structural risk — workerd ≠ Node. On Render, Astro runs in plain Node, so any spaced-repetition library (OQ-1) or Supabase SSR edge case "just works" the way it does locally. It also has the most complete *CLI* story of the six (real rollback) and a GA MCP server. The gap vs Cloudflare: ~$7/mo always-on to avoid cold starts, single-region only (fine per Q4), and no existing familiarity. This is the platform to swap to if workerd compatibility bites during implementation.

#### 3. Vercel

Excellent DX and the cleanest streaming story for the AI-generation NFR. It falls to third on two specifics: the **Hobby commercial-use prohibition** (10xCards is a product, so realistically $20/mo Pro) and serverless duration caps — neither fatal, but both cost more (money or architecture) than Cloudflare for the same MVP.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **Astro 6 is beta and the adapter moves fast.** `@astrojs/cloudflare` dropped Pages support and removed `Astro.locals.runtime` (now `cloudflare:workers` imports). Most online tutorials/SO answers reference the old APIs and will lead an agent down dead ends.
2. **workerd rejects CommonJS-only / Node-built-in-dependent packages.** The still-unchosen spaced-repetition library (OQ-1, FR-010) may depend on Node APIs that `nodejs_compat` only partially polyfills — discovered at *runtime in production*, not at build time.
3. **10 ms CPU/request on the free tier.** Wall-clock LLM waiting doesn't count, but *synchronous* work does — Zod-validating a large candidate-card payload from a big pasted text can trip opaque CPU-limit errors (forces the $5 plan; harder to trace).
4. **Supabase SSR cookie auth** (`@supabase/ssr`) must behave under workerd's request model, not Node — an edge-case class a solo dev can't fully vet in a 3-week budget.
5. **3 MB gzipped bundle cap (free) / 10 MB (paid).** React 19 + dependencies leaves less headroom than expected.

### Pre-Mortem — How This Could Fail

The team shipped 10xCards on Workers in week 3; it deployed clean. Then the spaced-repetition library they picked (OQ-1) turned out to lean on a Node timers/crypto API that workerd only partly polyfills — review sessions threw *at runtime, not build*, so CI was green and production was red. Swapping the SR library late ate the slim budget. The AI endpoint streamed fine under `astro dev` (Node/Vite) but diverged under workerd, and big pasted texts occasionally tripped the 10 ms CPU limit during Zod validation, returning opaque `1102` errors. Because Astro 6 was beta, half the blog answers referenced the removed `Astro.locals.runtime` or `wrangler pages deploy`, sending the agent down dead ends. Two evenings vanished into environment-parity debugging — exactly the "plumbing not product" time this stack was chosen to avoid. The deeper mistake: trusting dev-server fidelity for a runtime that diverges from Node in precisely the libraries an MVP hasn't vetted.

### Unknown Unknowns

- **`astro dev` runs on Node/Vite, not workerd.** Local dev does not fully reproduce production despite the adapter; the `platformProxy` helps but isn't identical — parity bugs surface only after deploy.
- **CPU time ≠ wall-clock (counterintuitive good news).** Awaiting OpenRouter does not burn the CPU budget, so long LLM calls are genuinely fine on Workers — this app does *not* have the serverless function-timeout problem.
- **The tech-stack hint `deployment_target: cloudflare-pages` is now stale.** The current `@astrojs/cloudflare` path is **Workers** via `wrangler deploy`, not `wrangler pages deploy`. The scaffold's assumption needs correcting.
- **Three secret mechanisms to keep straight:** `.env` (Node-side `astro dev`), `.dev.vars` (local workerd/proxy), and `wrangler secret put` (production). Easy to misconfigure across them.
- **`nodejs_compat` flag + `compatibility_date ≥ 2024-09-23` are mandatory** or Node-API imports fail — config the agent must get right up front.

## Operational Story

- **Preview deploys**: `wrangler versions upload` produces a preview URL (a non-production version) without promoting it; promote with `wrangler versions deploy`. Git-connected Workers Builds also generate per-branch/PR previews. Preview URLs are public — gate sensitive previews with Cloudflare Access if needed.
- **Secrets**: production secrets via `wrangler secret put SUPABASE_URL` / `SUPABASE_KEY` / `OPENROUTER_API_KEY` (stored in Cloudflare, not in the repo); local dev reads `.dev.vars` (gitignored) and Node-side `astro dev` reads `.env` (gitignored). `astro:env/server` is the in-code access path. Rotation = re-run `wrangler secret put`; redeploy not strictly required for the next invocation to pick it up.
- **Rollback**: `wrangler rollback [version-id]` (defaults to the immediately previous version); time-to-revert is seconds. Caveat: this reverts *code only* — Supabase schema migrations do not roll back with it, so forward-fix DB changes rather than relying on rollback.
- **Approval**: an agent may deploy, tail logs, and roll back unattended. Human-only: rotating the Supabase service key or OpenRouter key, deleting the Worker/project, and any destructive Supabase operation (drop table, destructive migration). Use a Cloudflare API token scoped to **Workers for this project only** — no DNS, no billing, no unrelated Workers Secrets.
- **Logs**: `wrangler tail` for live runtime logs (`--status error`, `--format json` for filtering/structured parsing); the Cloudflare MCP server (GA) exposes observability tools for structured queries when CLI parsing gets noisy.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Chosen spaced-repetition library (OQ-1) depends on Node APIs workerd doesn't polyfill; fails at runtime, not build | Pre-mortem / Devil's advocate | M | H | Vet the SR library against workerd *before* committing: prototype FR-010 on Workers early; prefer pure-ESM, dependency-light libs; keep Render (Node) as the documented fallback |
| `astro dev` (Node) ≠ workerd parity — bugs appear only after deploy | Unknown unknowns | M | M | Smoke-test on a Workers preview URL (`wrangler versions upload`) before every merge, not just locally; treat the preview as the source of truth |
| 10 ms free-tier CPU limit tripped by Zod validation of large pasted-text payloads | Devil's advocate | M | M | Bound source-text length (resolves OQ-2); if hit, upgrade to the $5/mo paid plan (30 s CPU) — cheap and removes the cap |
| Stale Astro-6 / Pages tutorials mislead the agent (removed `Astro.locals.runtime`, `wrangler pages deploy`) | Devil's advocate / Unknown unknowns | H | M | Pin to current `@astrojs/cloudflare` + `wrangler` docs (llms.txt); use Workers deploy path only; ignore any guidance referencing Pages or `Astro.locals.runtime` |
| Supabase SSR cookie auth misbehaves under workerd request model | Devil's advocate | L | H | Test the full signin/signup/signout + middleware flow on a Workers preview early; `@supabase/ssr` is workerd-compatible but verify cookie handling end-to-end |
| Astro 6 beta ships a breaking change mid-build | Research finding | L | M | Pin exact Astro + adapter versions in `package.json`; don't auto-upgrade during the 3-week window |
| React 19 + deps exceed 3 MB gzipped free bundle cap | Devil's advocate | L | M | Monitor bundle size on build; paid plan raises the cap to 10 MB if needed |
| Secrets misconfigured across `.env` / `.dev.vars` / `wrangler secret` | Unknown unknowns | M | L | Document the three-surface mapping in CLAUDE.md; verify `astro:env/server` reads resolve in a deployed preview before launch |

## Getting Started

Versions matter — these reflect the `@astrojs/cloudflare` (Workers-only) path current as of 2026-06-17, *not* the legacy Pages flow some tutorials still show.

1. **Confirm the adapter + runtime config.** Ensure `astro.config.mjs` uses `@astrojs/cloudflare` with `output: "server"`, and that `wrangler.toml`/`wrangler.jsonc` sets `compatibility_flags = ["nodejs_compat"]` and `compatibility_date = "2024-09-23"` (or later). Use Node 22+ locally (Astro 6 requirement).
2. **Install/auth Wrangler.** `npm i -D wrangler@latest` then `npx wrangler login` (or set a project-scoped `CLOUDFLARE_API_TOKEN` for CI). Confirm with `npx wrangler whoami`.
3. **Wire secrets.** Local: create `.dev.vars` with `SUPABASE_URL`, `SUPABASE_KEY`, `OPENROUTER_API_KEY` (gitignored). Production: `npx wrangler secret put SUPABASE_URL` (repeat per secret). Keep `.env` for the Node-side `astro dev` loop.
4. **Build and deploy to Workers** (not Pages): `npm run build` then `npx wrangler deploy`. For a preview without promoting: `npx wrangler versions upload`.
5. **Verify on the deployed runtime, not just locally.** Tail logs with `npx wrangler tail --status error`, exercise the auth flow and an AI-generation request on the Workers URL, and confirm `astro:env/server` resolves the secrets. Roll back if needed with `npx wrangler rollback`.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (GitHub Actions auto-deploy-on-merge is noted in the stack but not designed here)
- Production-scale architecture (multi-region, HA, DR)
