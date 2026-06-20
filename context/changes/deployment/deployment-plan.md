# First Deployment — Cloudflare Workers (10xCards)

## Context

10xCards is scaffolded from `10x-astro-starter` and has never been deployed. `context/foundation/infrastructure.md` selected **Cloudflare Workers** (runner-up: Render) as the MVP platform, and the scaffold already wired the `@astrojs/cloudflare` adapter and a Workers-shaped `wrangler.jsonc`. The goal of this change is to take the app from "builds locally" to "live on a `*.workers.dev` URL with auth working", and to make every subsequent push auto-deploy.

This plan covers the **first deploy of the auth shell only** — the product features (AI generation, flashcard CRUD, SR integration) don't exist yet, so `OPENROUTER_API_KEY` and app DB tables are explicitly out of scope here. We deploy the foundation (Astro SSR + Supabase auth) so the platform is proven before features land.

**Decisions locked with the user:**
- Supabase: **create a new Supabase Cloud project** (local Supabase is unreachable from Workers).
- Cloudflare auth: `wrangler login` for the local first deploy; **auto-deploy is handled by Cloudflare Workers Builds** via its GitHub app connection — **no GitHub Actions deploy job and no Cloudflare API token in CI**.
- Scope: **manual first deploy + auto-deploy-on-push driven by Cloudflare Workers Builds** (requires `git init` + a GitHub remote, then connecting the repo in the Cloudflare dashboard).
- Worker name: **keep `10x-astro-starter`** (the scaffold default in `wrangler.jsonc`).

> The existing `.github/workflows/ci.yml` stays as a **lint + build check only** — it gets **no** deploy step. Deploy is owned entirely by Cloudflare Workers Builds.

---

## Already done by the scaffold (verify, don't redo)

- [x] `@astrojs/cloudflare` v13.5 adapter + `output: "server"` — `astro.config.mjs`
- [x] `wrangler.jsonc` is **Workers-shaped** (correct, not the legacy Pages flow): `main: "@astrojs/cloudflare/entrypoints/server"`, `compatibility_flags: ["nodejs_compat"]`, `compatibility_date: "2026-05-08"` (≥ required 2024-09-23), `assets` binding → `./dist`, `observability.enabled: true`
- [x] `wrangler@4.90.0` installed as a devDependency
- [x] `astro:env/server` schema declares `SUPABASE_URL` / `SUPABASE_KEY` as **optional** server secrets; `src/lib/supabase.ts` returns `null` when they're missing → the app deploys and runs even before secrets are wired (auth simply disabled)
- [x] `.gitignore` already excludes `.env`, `.env.production`, `.dev.vars`, `.wrangler/`, `dist/`
- [x] `.nvmrc` = 22.14.0 (Astro 6 needs Node 22+; local is v26 — fine)

**Net:** infra config is essentially ready. The real work is **accounts/secrets/git/CI**, not Astro config. The one stale artifact is `tech-stack.md`'s `deployment_target: cloudflare-pages` hint — ignore it; we deploy to **Workers** via `wrangler deploy`.

---

## Phase 0 — Persist this plan
- [x] Create `context/changes/deployment/` and write this document to `context/changes/deployment/deployment-plan.md`

## Phase 1 — Pre-flight & accounts (manual gates — human-only)
- [x] Confirm Cloudflare account exists (sign up if not) — **manual**
- [x] Run `npx wrangler login` for local interactive deploys; confirm with `npx wrangler whoami` (also prints the **Account ID** `6e435730…`) — **manual**
- [x] On first deploy Cloudflare will prompt to **register a `workers.dev` subdomain** if you have none — accept it — **manual** (registered `01-lukaszblonski.workers.dev`)

## Phase 2 — Create & configure Supabase Cloud project (external integration)
- [x] Create a new project at supabase.com; pick a region close to users — **manual** (`doybynzbluvexgzyzils`)
- [x] Copy **Project URL** and **anon public key** from Project Settings → API (this is the `SUPABASE_KEY` the starter uses client-side-safe via SSR cookies; do **not** use the service-role key here) — **manual** (used new-format `sb_publishable_…` key)
- [x] Confirm email/password auth provider is enabled (default on) — **manual**
- [x] Auth redirect URLs are configured in **Phase 6** once we know the live Worker URL (deferred deliberately) — done in Phase 6

## Phase 3 — Local configuration
- [x] Create `.env` (Node-side `astro dev`): `SUPABASE_URL=...`, `SUPABASE_KEY=...` (gitignored)
- [x] Create `.dev.vars` (local workerd via `wrangler dev`): same two keys (gitignored)
- [x] Update `.env.example` to document both keys (currently `###` placeholders) — keep it committed
- [x] Add convenience scripts to `package.json`: `"deploy": "astro build && wrangler deploy"`, `"preview:remote": "astro build && wrangler versions upload"`, `"cf-typegen": "wrangler types"`
- [ ] (Optional) `npx wrangler dev` to smoke-test the **workerd** runtime locally before any cloud deploy — this catches workerd-vs-Node parity bugs `astro dev` hides *(skipped — validated directly on the deployed Worker instead)*

## Phase 4 — Wire production secrets + first manual deploy
- [x] `npm run build` — confirm clean SSR build into `dist/`
- [x] Set production secrets (stored in Cloudflare, never in repo): `npx wrangler secret put SUPABASE_URL` then `npx wrangler secret put SUPABASE_KEY`
- [x] `npx wrangler deploy` → live URL `https://10x-astro-starter.01-lukaszblonski.workers.dev`
- [x] Secrets persist on the Worker across future deploys, so this `secret put` is a **one-time** step (auto-deploys won't wipe them)

## Phase 5 — Verify on the deployed runtime (not just locally)
- [x] Open the live URL; confirm `/` and `/dashboard` render (dashboard should redirect to `/auth/signin` when logged out — proves middleware runs) — `/`→200, `/dashboard`→302→`/auth/signin`
- [x] Exercise the full auth flow on the live URL: **signup → email confirm → signin → dashboard → signout** (`src/pages/auth/*` + `src/pages/api/auth/*`) — verified end-to-end in the browser
- [ ] `npx wrangler tail --status error --format json` in a second terminal during the test to catch runtime errors — *not run; verified via API probes instead*
- [x] Confirm `astro:env/server` actually resolves the secrets in the Worker runtime (auth working == proof) — signin API returned Supabase's *"Invalid login credentials"* (not the "Supabase is not configured" fallback), proving secrets resolve + Supabase reachable + `@supabase/ssr` works under workerd

## Phase 6 — Supabase auth URL wiring (external-integration edge case)
- [x] In Supabase → Authentication → URL Configuration: set **Site URL** to the live Worker URL and add it (with `/**`) to the **Redirect allow-list** — otherwise email-confirmation links and any redirect-based flow bounce to localhost or are rejected — **manual**
- [x] Re-test signup → email confirmation end-to-end after this change (`src/pages/auth/confirm-email.astro` is the landing page)

## Phase 7 — Git + GitHub + Cloudflare Workers Builds auto-deploy-on-push
- [x] `git init`, confirm `.gitignore` covers secrets (it does — `.env`, `.dev.vars`), make the initial commit on branch **`master`**
- [x] Create the GitHub repo and push — **manual** (or `gh repo create`) — pushed to `Luke213-app/10xcards` (private); required granting the `gh` `workflow` scope to push `ci.yml`
- [x] In the Cloudflare dashboard → the `10x-astro-starter` Worker → **Settings → Builds → Connect** (or *Workers & Pages → Create → Connect to Git*): authorize the **Cloudflare GitHub app** for this repo — **manual**. This is what grants deploy access; no API token is created or stored anywhere.
- [x] Configure the build in the dashboard: **production branch = `master`**, **build command = `npm run build`**, **deploy command = `npx wrangler deploy`** (Cloudflare runs these in its build container on every push) — **manual**
- [ ] If the build needs the Supabase values at build time, add `SUPABASE_URL` / `SUPABASE_KEY` as **build environment variables / build secrets** in the Workers Builds config — **manual**. (They're optional in the env schema, so the build also succeeds without them; runtime still uses the Worker secrets from Phase 4, which Workers Builds does **not** overwrite.)
- [ ] (Optional) Enable **non-production branch builds / preview URLs** in the Builds settings so PR branches get preview deploys — **manual**
- [x] Push a trivial change to `master` and confirm: GitHub `ci.yml` lint+build passes **and** the Cloudflare build log shows a successful auto-deploy with the live URL updated

---

## Critical files

| File | Change |
|---|---|
| `context/changes/deployment/deployment-plan.md` | **new** — this plan (Phase 0) |
| `.env`, `.dev.vars` | **new**, gitignored — local secrets (Phase 3) |
| `.env.example` | document `SUPABASE_URL` / `SUPABASE_KEY` |
| `package.json` | add `deploy` / `preview:remote` / `cf-typegen` scripts |
| `.github/workflows/ci.yml` | **no change** — stays lint+build only; deploy is owned by Cloudflare Workers Builds (configured in the dashboard, not in the repo) |
| `wrangler.jsonc` | **no change** (name kept; config already correct) |
| `astro.config.mjs` | **no change** |

---

## Edge cases & extra support steps

- **Three secret surfaces — keep them straight** (the easiest thing to misconfigure): `.env` → Node `astro dev`; `.dev.vars` → local `wrangler dev` (workerd); `wrangler secret put` → production. Same key names across all three. If auth works locally but not in prod (or vice-versa), you almost certainly set the secret on the wrong surface.
- **`astro:env` secret not resolving on Workers:** if the deployed app behaves as if `SUPABASE_URL`/`KEY` are unset, regenerate adapter types with `npx wrangler types` / `astro sync`, re-confirm the secret exists via `npx wrangler secret list`, and verify the env-schema `access: "secret"` keys match the secret names exactly. This is the runtime-parity risk flagged in infrastructure.md.
- **`astro dev` ≠ workerd:** `astro dev` runs on Node/Vite and will not reproduce workerd behavior. Use `npx wrangler dev` (local workerd) or a `wrangler versions upload` preview URL as the source of truth before trusting a flow — especially the `@supabase/ssr` cookie auth path, which is the most likely place workerd diverges.
- **Supabase email rate limits:** the default Supabase SMTP is heavily rate-limited and confirmation emails can be slow/dropped during testing. If signup confirmation stalls, confirm the user manually in the Supabase dashboard (Authentication → Users) to unblock the flow; wire a real SMTP provider only when needed (out of MVP scope).
- **Stale tutorials:** ignore any guidance referencing `wrangler pages deploy` or `Astro.locals.runtime` — the current `@astrojs/cloudflare` path is Workers-only and removed those. Deploy with `wrangler deploy` exclusively.
- **Workers Builds deploys don't set runtime secrets:** the `wrangler deploy` Cloudflare runs on each push uses the runtime secrets already stored on the Worker (Phase 4) and won't overwrite them. Build-time env vars set in the Builds config are only for `astro build`, not Worker runtime. So the Phase 4 `wrangler secret put` remains the source of truth for runtime secrets.
- **Two pipelines, distinct roles:** GitHub Actions (`ci.yml`) only lints+builds as a PR gate; Cloudflare Workers Builds is what actually deploys. A red `ci.yml` does **not** block a Cloudflare deploy (they're independent) — if you want CI to gate deploys, that's a future enhancement, out of scope here.
- **Rollback:** `npx wrangler rollback` reverts code in seconds, but **does not** roll back Supabase schema changes — forward-fix DB issues. (No DB tables exist yet, so low risk for this first deploy.)
- **Bundle cap / CPU limit:** the 3 MB free-tier bundle cap and 10 ms free-tier CPU limit are **not** expected to bite for the auth shell; they become relevant when the AI-generation flow lands. Noted, not blocking.
- **If workerd parity genuinely breaks auth:** the documented fallback is the runner-up, **Render** (plain Node) — out of scope for this deploy but the escape hatch if Phase 5 fails irrecoverably.

---

## Deploy-specific risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Secrets set on wrong surface (`.env` vs `.dev.vars` vs `wrangler secret`) | M | M | Phase 3/4 set all three explicitly; verify with `wrangler secret list` + live auth test |
| Supabase redirect URLs not updated → email confirm bounces to localhost | M | M | Phase 6 sets Site URL + allow-list before declaring auth done |
| `@supabase/ssr` cookie auth diverges under workerd | L | H | Test full auth flow on the live URL (Phase 5), not just `astro dev` |
| `astro:env` secret unresolved at runtime | L | H | `wrangler types` + `secret list`; live auth == proof |
| Workers Builds deploys from the wrong branch / on every PR | L | M | Set production branch = `master` in the Builds config; gate preview builds to non-prod branches only |
| Cloudflare GitHub app granted broader repo access than intended | L | M | Authorize the Cloudflare app for **this repo only**, not the whole org, during the connect step |

---

## Deployment Record (2026-06-18)

**Live URL:** https://10x-astro-starter.01-lukaszblonski.workers.dev
**Cloudflare account:** `6e435730c92d365c96652d8f867710e6` · **Worker:** `10x-astro-starter`
**SESSION KV namespace:** `9f9bfd66373d4f1eb253ba553896d7e4` (pinned in `wrangler.jsonc`)
**GitHub repo:** https://github.com/Luke213-app/10xcards (private, branch `master`)
**Supabase project:** `https://doybynzbluvexgzyzils.supabase.co` (key = `sb_publishable_…`, new-format publishable key)

| Phase | Status |
|---|---|
| 0 — persist plan | ✅ done |
| 1 — CF account + auth + subdomain (`01-lukaszblonski.workers.dev`) | ✅ done |
| 2 — Supabase project + creds | ✅ done |
| 3 — local config (`.env`, `.dev.vars`, `.env.example`, npm scripts) | ✅ done |
| 4 — secrets set + first deploy | ✅ done |
| 5 — runtime verification (API-level + full browser auth walkthrough: signup → confirm → signin → dashboard → signout) | ✅ done |
| 6 — Supabase auth URL wiring (Site URL + redirect allow-list) | ✅ done |
| 7 — git init + commit + push to GitHub + Workers Builds connect (auto-deploy on push to `master`) | ✅ done |

**Hardening applied beyond the original plan:** pinned the auto-provisioned `SESSION` KV namespace in `wrangler.jsonc` so Workers Builds deploys are deterministic (commit `97e24fd`).

## Verification (definition of done)

1. `npm run build` succeeds and `npx wrangler deploy` returns a live `*.workers.dev` URL.
2. On the **live URL**: home + dashboard render, dashboard redirects when logged out, and signup → confirm → signin → dashboard → signout all work.
3. `npx wrangler tail` shows no errors during the auth walkthrough.
4. A push to `master` triggers a **Cloudflare Workers Builds** run that builds and deploys, and the change appears on the live URL (GitHub `ci.yml` independently shows lint+build green).
5. `context/changes/deployment/deployment-plan.md` exists as the audit trail.
