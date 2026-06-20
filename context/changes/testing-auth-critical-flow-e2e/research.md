---
date: 2026-06-20T20:59:42+0200
researcher: lukaszblonski
git_commit: d752e28271fb972f8e8d7497ea3f454f7c72c64f
branch: master
repository: 10xcards
topic: "Auth & critical-flow e2e — oracle for R#5, R#4, R#1 (e2e), and the Playwright harness"
tags: [research, codebase, auth, middleware, generate, rls, idor, playwright, e2e, test-plan-phase-3]
status: complete
last_updated: 2026-06-20
last_updated_by: lukaszblonski
---

# Research: Auth & critical-flow e2e (Test-plan Phase 3)

**Date**: 2026-06-20T20:59:42+0200
**Researcher**: lukaszblonski
**Git Commit**: d752e28271fb972f8e8d7497ea3f454f7c72c64f
**Branch**: master
**Repository**: 10xcards

## Research Question

Ground the **oracle** (what the code *should* do, from sources — not copied from the
implementation) for Phase 3 of the test rollout: Auth & critical-flow e2e. Three risks:

- **R#5** — auth gate / availability: an unauthenticated request reaches a protected
  route/API, or a real user cannot log in / sign up.
- **R#4** — no progress feedback: a generation past 2s leaves the user unsure, with no
  terminal state.
- **R#1 (end-to-end)** — cross-user access / IDOR-RLS at the browser level.

Scope locked with the user (both forks → option 1):
1. **Include harness setup** — also ground how Playwright authenticates (test-user
   seeding, local-vs-remote Supabase, CSRF Origin, workerd dev server).
2. **Explicit per-risk verdict** — for each risk, state whether it genuinely needs a
   browser (e2e) or should be redirected to integration / `/10x-tdd`.

## Summary

The codebase is **well-built for these risks** — most of the protective behavior already
exists and is internally documented. The research's main job here is to separate *what a
browser test can actually observe* from *what only an API/DB test can prove*, and to flag
one source discrepancy.

Headline findings:

1. **R#5 auth gate is two independent mechanisms, not one.** Pages are gated by the
   middleware (302 → `/auth/signin`). API routes are **not** in `PROTECTED_ROUTES` — each
   API route guards itself with an inline `context.locals.user` check returning **401
   JSON**. This is exactly the "protected pages ⇒ protected APIs too" challenge from the
   test plan: the two gates can drift independently, so both must be asserted *separately*.
2. **R#4 always reaches a terminal state — by single-response, not streaming.** Despite
   the tech-stack's "stream/chunk on the edge" guidance, `/api/generate` returns a
   **single JSON blob** after the LLM finishes. The React island has five states
   (idle / generating / review / empty / error) and **every** failure path (HTTP error,
   parse error, empty candidates, workerd ~30s abort) lands on a terminal state. There is
   **no prompt-ack** — the user sees a spinner while the one request is in flight. The
   oracle is "always terminal," not "streamed progress."
3. **R#1 cross-user protection is real but lives in Postgres RLS, not in app code, and is
   largely invisible to a browser.** The service always uses the request-scoped cookie
   client (RLS in force); there is **no service_role/admin client** anywhere. No code-level
   ownership check exists — RLS makes another user's row invisible, so update/delete/review
   return **404** (deliberately, to avoid leaking existence). Critically, **there is no
   `GET /api/flashcards/[id]` endpoint** and the UI only ever lists the logged-in user's
   own cards, so a browser cannot navigate to User B's card. **Verdict: redirect R#1 to
   integration / `/10x-tdd`** (raw cross-user API calls), not e2e.
4. **No test infra exists at all** — no Playwright, no Vitest, no `test` script, no spec
   files. Phase 3 bootstraps the runner from zero.
5. **Source discrepancy resolved:** one trace inferred "no CSRF" from the *absent*
   `security.checkOrigin` setting in `astro.config.mjs`. That inference is **wrong** — Astro
   6 SSR defaults the origin check **on**, and the memory note records an empirically
   observed **403** on form POSTs without a matching `Origin`. **Empirical evidence wins:
   the CSRF origin check is active.** Any programmatic (non-browser) POST in the harness
   must set the `Origin` header.

## Detailed Findings

### R#5 — Auth gate / availability

**The gate is two separate mechanisms.**

- **Pages** — middleware prefix-match gate.
  - `src/middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard", "/generate", "/cards", "/review"]`.
  - `src/middleware.ts:22` — `PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))` (prefix match, so `/cards/new`, `/cards/index` are all covered).
  - `src/middleware.ts:24` — unauthenticated → `return context.redirect("/auth/signin")` → **HTTP 302, `Location: /auth/signin`, empty body**.
  - Authenticated users hitting `/`, `/auth/signin`, `/auth/signup` are bounced to `/dashboard` (logged-in redirects).
- **API routes** — *not* covered by the middleware; each route self-guards.
  - `/api/*` paths are absent from `PROTECTED_ROUTES`, so the middleware never blocks them.
  - Each protected API returns **401 JSON `{"error":"Unauthorized"}`** via an inline check:
    - `src/pages/api/flashcards.ts:15-17` (POST)
    - `src/pages/api/generate.ts:15-17` (POST)
    - `src/pages/api/flashcards/[id].ts:16-18` (PATCH), `:54-56` (DELETE)
    - `src/pages/api/flashcards/[id]/review.ts:18-20` (POST)

**Oracle (R#5):**
- Unauthenticated `GET` of any protected page → **302 → `/auth/signin`**.
- Unauthenticated request to a protected API → **401 + `{"error":"Unauthorized"}`** (JSON, no redirect).
- Successful **signin** (`POST /api/auth/signin`, form-encoded `email`+`password`) → **302 → `/dashboard`** (`src/pages/api/auth/signin.ts:19`); failure → **302 → `/auth/signin?error=...`** (`:16`).
- Successful **signup** (`POST /api/auth/signup`) → **302 → `/auth/confirm-email`** (`src/pages/api/auth/signup.ts:19`). Email confirmation is required in PROD; `src/pages/auth/confirm-email.astro:5` auto-confirms only in DEV (`import.meta.env.DEV`). **Signup does not yield a logged-in session** — so it is not a viable programmatic test-user path; use the admin API (see Harness).

**The key challenge this risk exists to catch:** because page-gate and API-gate are
*independent code paths*, a UI-only test that confirms the page redirect says **nothing**
about the API gate. Both must be asserted separately. Anti-pattern to avoid (from the test
plan): "UI-only check that skips the API gate."

### R#4 — No progress feedback / terminal state

**Single response, not streamed.**
- `src/pages/api/generate.ts:40-41` — `const payload: GenerateResponse = { candidates }; return json(payload, 200);` — one JSON blob, returned after the LLM call completes.
- `src/lib/services/openrouter.ts:35-49` — `fetch()` to OpenRouter is fully awaited before parsing. No SSE / chunking.
- This contradicts the tech-stack note ("the planned AI-generation flow must stream or chunk"). **The oracle is what the code does for the user — always reach a terminal state — not the aspirational streaming design.** (Streaming is a future change, not a Phase-3 test target.)

**Five UI states** in `src/components/generate/GenerateView.tsx` (state var `status`, line 27):

| State | Lines | Trigger | User-visible |
|-------|-------|---------|--------------|
| idle | 104-156 | initial | textarea `#source` + "Generate" button |
| generating | 104-156 (`status==="generating"`) | click → `setStatus("generating")` (:37) | textarea disabled; `Loader2 animate-spin` + "Generating…" (:136-137); progress bar + "Working on your cards — this can take a few seconds…" (:149-152) |
| review | 159-195 | candidates.length > 0 (:58-63) | `ul.space-y-4` of `CandidateCard`; "Start over" |
| empty | 198, 215-242 | candidates.length === 0 (:58-59) | "No usable cards from this text" + manual card form |
| error | 201-210 | catch (:64-66) | `border-destructive`, AlertCircle, "Something went wrong while generating. Your text is still here." + "Retry" |

**Every failure path is terminal** (no hang exists):
- `!res.ok` → throw → catch → `error` state (`GenerateView.tsx:45-47, 64-66`).
- `res.json()` parse failure → catch → `error`.
- Empty candidates → `empty` state (:58-59).
- Malformed LLM output → `openrouter.ts:70-72` throws → `api/generate.ts:42-44` returns **502** → client `error`.
- Garbage candidates → `src/lib/schemas/flashcards.ts:55-65` `llmCandidatesSchema.catch([])` → `{candidates:[]}` → `empty`.
- workerd ~30s timeout (no explicit `maxDuration`/`AbortSignal` anywhere) → fetch aborts → 502 → `error`.

**No prompt-ack.** The UI shows the spinner *optimistically* on click; there is no
intermediate 202/ack from the server. So the "acknowledged promptly" half of the oracle is
satisfied **client-side** (spinner appears on click, before any server response), and the
"always terminal" half is satisfied by the exhaustive catch/empty handling above.

**Oracle (R#4):** on submit, a loading indicator appears immediately (client-side), and the
flow *always* lands in review / empty / error — never an indefinite spinner. Anti-patterns
(from test plan): asserting a hang exists; brittle timing assertions.

**Stable-ish selectors (no `data-testid` yet — a gap the plan should consider):**
- textarea: `#source` (`:113`)
- generate button: text "Generate" / "Generating…"
- spinner: `button svg.animate-spin`
- progress: text "Working on your cards"
- review list: `ul.space-y-4`
- empty: text "No usable cards from this text"
- error: text "Something went wrong while generating" / "Retry"

### R#1 (e2e) — Cross-user access / IDOR-RLS

**Protection is real, but it is pure RLS and largely invisible to a browser.**

- **Client:** request-scoped cookie client only; **no service_role/admin client exists**.
  - `src/lib/supabase.ts:5-24` — `createServerClient` bound to request cookies (user JWT → RLS in force).
  - `src/lib/services/flashcards.ts:14-17` (comment) — "Every function takes the request-scoped authenticated client … row-level security is always in force."
- **No app-layer ownership check** — by design, RLS does it:
  - create: `flashcards.ts:39-49` — no `user_id` set; DB default `auth.uid()` + INSERT policy.
  - list: `flashcards.ts:51-55` — bare `.select()`, no `.eq('user_id', …)`.
  - get-by-id: `flashcards.ts:57-61` — `.eq("id", id).maybeSingle()`; **exported but unused by any route**.
  - update: `flashcards.ts:63-79` + route `api/flashcards/[id].ts:43-46` → **404 "Flashcard not found"** when RLS hides the row.
  - delete: `flashcards.ts:81-88` + route `:69-72` → **404**.
  - review/grade: `flashcards.ts:171-191` + route `api/flashcards/[id]/review.ts:45-48` → **404**.
  - Intentional 404-not-403 (no missing-vs-forbidden distinction) to avoid leaking ownership — `api/flashcards/[id].ts:12-14` (comment).
- **RLS policies** — `supabase/migrations/20260619185620_create_flashcards.sql:27-53`: four granular per-operation policies (SELECT/INSERT/UPDATE/DELETE), each `to authenticated` and scoped `auth.uid() = user_id`; `user_id uuid not null default auth.uid()` (:15). `anon` gets nothing.

**Oracle (R#1):** a request authenticated as User A that targets a card owned by User B
must **not** read/modify/delete it — the API answers **404** (not 200, not a silent
success), and B's row is unchanged.

**Verdict: REDIRECT R#1 to integration / `/10x-tdd` — do not write it as e2e.** Reasons:
1. **No browser path to another user's card.** There is no `GET /api/flashcards/[id]`
   endpoint, and the `/cards` UI only ever renders the logged-in user's own cards
   (`src/pages/cards/index.astro:14-17` → `listFlashcards` is RLS-scoped). A browser as
   User A simply has no UI affordance or URL that surfaces B's card.
2. **The boundary is observable only via raw cross-user API calls** (log in as A, capture
   cookie; `PATCH`/`DELETE`/`review` B's known card id; assert 404 + B's row intact). That
   is an integration test against the route with two user contexts — a browser adds no
   signal and cannot even reach the assertion.
3. This matches the test plan's own "likely cheapest layer" for R#1: **Integration (two
   user contexts)** — §2 Risk Response Guidance.

E2E *can* still add a thin guard: assert the `/cards` page for User A never renders B's
content (negative UI check). That is a nice-to-have, not the actual IDOR boundary.

### E2E harness (setup grounding)

**No test infra exists (verified):** no `*.test.*` / `*.spec.*`, no `playwright.config.*`
/ `vitest.config.*`, no `e2e/`/`tests/` dirs, no `test` npm script, no Playwright/Vitest
deps. Only relevant existing dep: `supabase` CLI (devDep). Phase 3 starts from zero.

**Verified signin contract (what the fixture must match):**
- `POST /api/auth/signin`, **form-encoded** (`await context.request.formData()` — *not*
  JSON), fields exactly `email` + `password`.
- Success → 302 → `/dashboard`, and `@supabase/ssr` `setAll` writes session cookies via
  `context.cookies.set` on that response — those `Set-Cookie` headers are what
  `storageState` captures.
- **CSRF: must send a matching `Origin` header or Astro returns 403** (Astro 6 default
  origin check; no `security.checkOrigin:false` override in `astro.config.mjs`). Empirically
  confirmed by the memory note's curl recipe.

**Current Playwright API (Context7 `/microsoft/playwright.dev`):**
- `webServer: { command, url|port, reuseExistingServer, timeout, env }` + `use.baseURL`.
- Auth pattern: a `setup` project (`testMatch: /.*\.setup\.ts/`) that logs in once via the
  `request` (`APIRequestContext`) fixture and `request.storageState({ path })`; browser
  projects load it via `use.storageState` + `dependencies:['setup']`. Per-call `headers`
  on `request.post` is where the `Origin` header goes. Opt a spec out of auth (for the
  anonymous-redirect test) with `test.use({ storageState: { cookies: [], origins: [] } })`.

**Recommended harness blueprint (for the plan to ratify):**
- **Auth:** programmatic API login in a `setup` project (`POST /api/auth/signin` with
  `Origin` header) → `storageState` → reused by browser projects. Keep **one** UI-login
  spec so `SignInForm` itself stays covered. Don't pay UI-login cost per test.
- **Supabase target: local re-pointed** (`http://127.0.0.1:54321`), never remote — the
  remote project is **production** (memory note); e2e there would pollute prod + the success
  metrics. Local gives service_role for seeding + `supabase db reset` for cleanup.
- **Env wiring:** prefer `webServer.env` (set `SUPABASE_URL`/`SUPABASE_KEY` for the
  Playwright-launched dev server) over mutating the developer's `.dev.vars`.
- **Test users: admin API only** — `POST /auth/v1/admin/users` with service_role +
  `email_confirm:true` (signup leaves users unconfirmed). Seed flashcards with
  **service_role + explicit `user_id`** (service_role bypasses RLS and `auth.uid()` is null,
  so the NOT-NULL default would otherwise fail).
- **workerd quirks:** `astro dev` picks a free port (often 4321, may bump) — **pin the port**
  (`npm run dev -- --port 4321` or `server.port`) so `baseURL` is deterministic; keep
  `webServer.timeout` generous (~120s) because workerd startup is heavy.
- **CI vs ad-hoc:** cheap deterministic specs (anonymous-redirect, UI login, authed
  dashboard render) are CI candidates *once CI provisions local Supabase + Docker*; the
  seeded/stateful flows can stay **ad hoc** per the test plan's stance (§ test-plan Quality
  Gates / §4). Current `.github/workflows/ci.yml` is lint+build only — wiring e2e is a
  deliberate separate decision.
- **.gitignore gap:** `playwright/.auth/`, `test-results/`, `playwright-report/` are **not**
  ignored today — the plan must add them so captured session cookies never get committed.

## Code References

- `src/middleware.ts:4,22,24` — `PROTECTED_ROUTES`, prefix match, 302 → `/auth/signin`.
- `src/pages/api/auth/signin.ts:5-7,16,19` — form-encoded signin contract + redirects.
- `src/pages/api/auth/signup.ts:19` — signup → `/auth/confirm-email`.
- `src/pages/auth/confirm-email.astro:5` — DEV auto-confirm only.
- `src/pages/api/flashcards.ts:15-17` — API 401 self-guard (representative of all routes).
- `src/pages/api/generate.ts:15-17,40-41,42-44` — auth guard, single-JSON response, 502 on failure.
- `src/components/generate/GenerateView.tsx:27,37,45-47,58-66,104-210` — state machine + terminal handling.
- `src/lib/services/openrouter.ts:35-49,70-78` — awaited fetch, parse/throw.
- `src/lib/schemas/flashcards.ts:55-65` — `llmCandidatesSchema.catch([])`.
- `src/lib/services/flashcards.ts:14-17,39-49,51-61,63-79,81-88,171-191` — RLS-only, no app-layer ownership check.
- `src/pages/api/flashcards/[id].ts:12-14,43-46,69-72` — 404 (not 403) on not-owned.
- `src/pages/api/flashcards/[id]/review.ts:45-48` — review 404 on not-owned.
- `supabase/migrations/20260619185620_create_flashcards.sql:15,27-53` — `user_id default auth.uid()` + four RLS policies.
- `src/lib/supabase.ts:5-24` — request-scoped cookie client (no admin client).
- `astro.config.mjs:11,16` — `output:"server"`, `cloudflare()`; **no** `security.checkOrigin` (→ default ON).

## Architecture Insights

- **Defense-in-depth, intentional and documented.** Auth is enforced twice (page
  middleware + per-API guard) and ownership is enforced by RLS with no leaky 403/404
  distinction. The inline source comments are the design intent — a useful oracle sanity
  check, but the *expected behavior* is grounded in PRD Access Control / Guardrails, not in
  those comments.
- **"Streaming on the edge" is aspirational, not current.** Tests must assert the *actual*
  contract (single response, always terminal), not the tech-stack's future intent.
- **RLS is the security boundary, not app code.** This is exactly why R#1 belongs at the
  integration layer (the test plan warns: "RLS enabled ⇒ ownership holds" is a claim to
  *challenge*, because a privileged client could bypass RLS — here there is no privileged
  client in app code, which is itself worth pinning with a test).

## Per-risk e2e-vs-redirect verdict (the boundary)

| Risk | Genuinely needs a browser? | Layer | Why |
|------|----------------------------|-------|-----|
| **R#5** auth gate | **Partly e2e** | e2e (page redirect + UI login round-trip) **+ integration (API 401 gate)** | Page redirect & login form are browser-observable; the API 401 gate is a *separate* code path a browser can't fully prove — assert it via direct request. |
| **R#4** progress/terminal | **Yes — e2e** | e2e (loading → terminal) | The state machine is in a React island; only a browser exercises click → spinner → review/empty/error. Stub the network to force empty/error deterministically. |
| **R#1** cross-user | **No — redirect** | integration / `/10x-tdd` (two user contexts) | No browser path to another user's card; the boundary is only observable via raw cross-user API calls returning 404. Optional thin e2e negative check that A's `/cards` never shows B's data. |

## Historical Context (from prior changes)

- `context/foundation/lessons.md` — "Wypychaj migracje na zdalny projekt": migrations that
  pass locally but are never pushed to remote cause prod 500s. Relevant because the e2e
  suite should target **local** Supabase (so migrations are guaranteed present via
  `supabase migration up --local`), and because R#6 (the deploy gate) is Phase 4, not here.
- Memory `manual-testing-authed-flows.md` — the empirical recipe behind the harness
  findings: local re-point, admin-API confirmed users, service_role seeding with explicit
  `user_id`, and the **CSRF `Origin` 403** that resolves the discrepancy in this research.
  Also: the remote project is production — do not point e2e at it.

## Related Research

- `context/foundation/test-plan.md` §2 Risk Response Guidance (R#1/R#4/R#5 rows), §3 Phase 3,
  §4 Stack (Playwright row), §7 (don't test external services).

## Open Questions

1. **Add `data-testid` hooks?** R#4 selectors currently rely on text/utility-class
   matching, which is brittle. The plan should decide whether to add stable test ids to
   GenerateView's key states or accept text-based locators.
2. **How to force R#4 empty/error deterministically?** Real OpenRouter output is
   nondeterministic. Options: Playwright route interception (`page.route` to stub
   `/api/generate` with `[]` / 502), or a controllable test seam. Plan decision.
3. **CI scope for e2e** — does CI provision local Supabase + Docker to run Playwright, or
   stay ad-hoc/local? (Biggest cost driver.)
4. **Env-injection mechanism** — `webServer.env` vs `.dev.vars.test` vs backup/rewrite.
5. **R#5 API-gate layer** — confirm whether the 401-API assertions live in the e2e suite
   (via `request`) or move to a Phase-1/2 integration suite to avoid duplicating harness.
