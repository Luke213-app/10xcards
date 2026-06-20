# Auth & Critical-Flow E2E Implementation Plan

## Overview

Stand up the project's first end-to-end test harness (Playwright, against a local
Supabase) and use it to protect three rollout-Phase-3 risks: the auth gate (**R#5**),
generation progress/terminal-state (**R#4**), and cross-user data isolation (**R#1**).
The full suite runs in CI on every push/PR.

## Current State Analysis

- **No test infrastructure exists.** No Playwright/Vitest deps, no `test` script, no
  `*.spec.*`/`*.test.*` files, no `playwright.config.*`. Only the `supabase` CLI (devDep)
  is present. This change is greenfield for testing. (research.md → "E2E harness")
- **Auth is two independent gates.** Pages are gated by `src/middleware.ts:4,22,24`
  (`PROTECTED_ROUTES = ["/dashboard","/generate","/cards","/review"]`, prefix match,
  302 → `/auth/signin`). API routes are **not** in `PROTECTED_ROUTES`; each self-guards
  with an inline `context.locals.user` check returning **401 JSON** (`api/flashcards.ts:15-17`,
  `api/generate.ts:15-17`, `api/flashcards/[id].ts:16-18,54-56`, `api/flashcards/[id]/review.ts:18-20`).
- **Signin contract:** `POST /api/auth/signin`, **form-encoded** (`formData()`), fields
  `email`+`password`; success → 302 → `/dashboard` (`signin.ts:19`); failure → 302 →
  `/auth/signin?error=...` (`:16`). **Astro's CSRF origin check is on by default** — a
  form POST without a matching `Origin` header returns **403** (empirically confirmed in
  the memory note; no `security.checkOrigin:false` in `astro.config.mjs`).
- **Signup** → 302 → `/auth/confirm-email` (`signup.ts:19`); confirmation auto-passes only
  in DEV (`confirm-email.astro:5`, `import.meta.env.DEV`). Signup does not create a logged-in
  session — programmatic test users must be created via the Supabase admin API.
- **Generate is single-response, not streamed.** `api/generate.ts:40-41` returns one JSON
  blob `{ candidates }`; `openrouter.ts:35-49` fully awaits the LLM. `GenerateView.tsx`
  (state var `status`, line 27) has five states: idle/generating/review/empty/error
  (`:104-210`); every failure path is terminal (`:45-47,58-66`; schema `flashcards.ts:55-65`
  `llmCandidatesSchema.catch([])`; API 502 at `generate.ts:42-44`). No prompt-ack; spinner
  is shown optimistically on click (`:37`). **No stable test selectors today** (text/utility
  classes only).
- **Cross-user isolation is pure RLS.** `flashcards.ts` always uses the request-scoped
  cookie client (`supabase.ts:5-24`); **no service_role/admin client exists in app code**.
  No app-layer ownership check — RLS hides another user's row, so update/delete/review
  return **404** (`api/flashcards/[id].ts:43-46,69-72`; `review.ts:45-48`). There is **no
  `GET /api/flashcards/[id]` endpoint**, and `/cards` only lists the caller's own rows
  (`cards/index.astro:14-17`) — so a browser cannot reach User B's card. RLS policies:
  `supabase/migrations/20260619185620_create_flashcards.sql:15,27-53` (four per-operation
  policies, `to authenticated`, `auth.uid() = user_id`; `user_id default auth.uid()`).
- **Local Supabase ports** (`supabase/config.toml`): API 54321, DB 54322, Studio 54323,
  inbucket 54324. The remote project is **production** — never target it from tests.

## Desired End State

`npx playwright test` runs a chromium e2e suite against a freshly-seeded local Supabase and
passes, covering: anonymous→redirect on every protected page, anonymous→401 on every
protected API, UI login + signup round-trips, the generate state machine (loading → review
/ empty / error), and cross-user 404 isolation. The same suite runs in GitHub Actions on
every push/PR (CI provisions Docker + Supabase + migrations + test users). `test-plan.md`
§5 marks the e2e gate enforced and §6.3 documents the cookbook pattern.

### Key Discoveries:

- Two independent auth gates → R#5 must assert page-redirect **and** API-401 separately
  (`middleware.ts:22-24` vs the inline checks). A UI-only test is insufficient.
- `Origin` header is mandatory on programmatic (`request`-fixture) POSTs or Astro 403s.
- Generate always reaches a terminal state; the oracle is "always terminal," not "streamed."
- R#1 is invisible to a browser → implement as Playwright **API-level** test (`request`
  fixture, two user contexts), not a browser spec and not a separate Vitest runner.

## What We're NOT Doing

- **Not** testing OpenRouter, Supabase, or Cloudflare themselves (test-plan §7) — the LLM
  is stubbed via `page.route`; Supabase is exercised only as our RLS boundary.
- **Not** building streaming/SSE for generate (the code is single-response; streaming is a
  future change, not a test target here).
- **Not** bootstrapping Vitest — R#1 runs under Playwright's `request` fixture. (Phase 1 of
  the test-plan, the Vitest unit/integration runner, remains separate and unstarted.)
- **Not** the remote-schema drift gate (R#6) — that is test-plan Phase 4.
- **Not** a multi-browser matrix — chromium-only for MVP speed/stability.
- **Not** testing visual/presentation polish (test-plan §7).

## Implementation Approach

Build the harness first (Phase 1) so every later phase has a working runner + an
authenticated session. Authenticate **programmatically** once in a `setup` project
(`POST /api/auth/signin` with the `Origin` header) and persist via `storageState`; browser
specs reuse it, while anonymous specs opt out with an empty storageState. Target a
**local** Supabase, wired through Playwright's `webServer.env` (never mutating the
developer's `.dev.vars`), with a pinned dev port (4321) so `baseURL` is deterministic. Test
users are created via the Supabase admin API (`email_confirm:true`); flashcards are seeded
with the service_role key + explicit `user_id` (service_role bypasses RLS and `auth.uid()`
is null). Force R#4's empty/error branches deterministically with `page.route` stubs of
`/api/generate`. Add `data-testid` hooks to `GenerateView` so R#4 selectors are stable.

## Critical Implementation Details

- **CSRF Origin (load-bearing):** every `request`-fixture POST (`auth.setup.ts` login, R#1's
  cross-user calls) must send `headers: { Origin: <baseURL> }` or Astro returns 403. Real
  browser navigation carries Origin automatically; only programmatic calls need it set.
- **RLS seeding:** seed User A's card with the **service_role** client and an **explicit
  `user_id`** — under service_role `auth.uid()` is null, so the `user_id` NOT NULL default
  would fail; the anon key would be blocked by RLS entirely.
- **Two auth gates:** R#5 must hit protected **API** routes with an *unauthenticated*
  `request` context (empty storageState) to observe the 401 — these checks live in each
  route, not the middleware, so they can drift independently of the page gate.
- **DEV-only auto-confirm:** the signup round-trip relies on `confirm-email.astro:5`
  auto-confirming in DEV; the dev server must run in dev mode (it does under `astro dev`).

## Phase 1: Harness Bootstrap

### Overview

Install and configure Playwright against a local Supabase so an authenticated chromium
suite can run locally and a trivial smoke spec passes.

### Changes Required:

#### 1. Playwright dependency + scripts

**File**: `package.json`

**Intent**: Add `@playwright/test` (devDep) and npm scripts to run the suite and (one-time)
install browsers.

**Contract**: New scripts `test:e2e` (`playwright test`) and `test:e2e:install`
(`playwright install --with-deps chromium`). No change to existing scripts.

#### 2. Playwright config

**File**: `playwright.config.ts` (new)

**Intent**: Define the chromium project, a `setup` project that authenticates and writes
storageState, the local dev `webServer` with env wiring, and a deterministic baseURL.

**Contract**: `defineConfig` with: `use.baseURL = 'http://localhost:4321'`; `projects`:
`{ name:'setup', testMatch:/.*\.setup\.ts/ }` and `{ name:'chromium', use:{...devices['Desktop Chrome'], storageState:'e2e/.auth/user.json'}, dependencies:['setup'] }`;
`webServer: { command:'npm run dev -- --port 4321', url:'http://localhost:4321',
reuseExistingServer:!process.env.CI, timeout:120_000, env:{ SUPABASE_URL:'http://127.0.0.1:54321', SUPABASE_KEY:<local anon key from env> } }`.
Test dir `e2e/`.

#### 3. Test-user + seed helper

**File**: `e2e/support/seed.ts` (new)

**Intent**: Create the confirmed test users (A and B) via the Supabase admin API and expose
a service_role helper to seed/read flashcards for R#1. Idempotent (safe to re-run).

**Contract**: Exports `ensureTestUsers()` → POSTs `http://127.0.0.1:54321/auth/v1/admin/users`
with the service_role bearer + `{email,password,email_confirm:true}` for the two fixed test
accounts; exports `seedFlashcard(userId, {...})` and `getFlashcard(id)` using a
service_role supabase-js client with explicit `user_id`. Credentials/keys read from env
(service_role + anon from `supabase status -o env`).

#### 4. Auth setup (storageState capture)

**File**: `e2e/auth.setup.ts` (new)

**Intent**: Ensure users exist, then log in User A programmatically and persist the session
cookies for reuse by browser specs.

**Contract**: A `setup('authenticate')` test that calls `ensureTestUsers()`, then
`request.post('/api/auth/signin', { form:{ email, password }, headers:{ Origin: baseURL } })`,
asserts the 302→`/dashboard`, and `request.storageState({ path: 'e2e/.auth/user.json' })`.

#### 5. Smoke spec

**File**: `e2e/smoke.spec.ts` (new)

**Intent**: Prove the runner + dev server + auth wiring work before writing real specs.

**Contract**: Authenticated `page.goto('/dashboard')` renders (not redirected to signin).

#### 6. Ignore + lint scoping

**File**: `.gitignore`, ESLint flat config (`eslint.config.*`)

**Intent**: Never commit captured session cookies or reports; keep lint from choking on spec
globals.

**Contract**: Add `e2e/.auth/`, `test-results/`, `playwright-report/`, `.playwright/` to
`.gitignore`; scope/ignore `e2e/**` appropriately in the ESLint config.

### Success Criteria:

#### Automated Verification:

- Browsers install: `npm run test:e2e:install`
- Lint passes: `npm run lint`
- Smoke spec passes (auth + dev server work): `npm run test:e2e -- smoke.spec.ts`
- `git status` shows no `e2e/.auth/` or report dirs tracked

#### Manual Verification:

- `npx supabase start` running locally; `supabase migration up --local` applied
- `e2e/.auth/user.json` is created and contains session cookies after the setup project runs
- Dev server comes up on the pinned port 4321 under workerd without manual intervention

**Implementation Note**: After this phase and all automated checks pass, pause for manual
confirmation before proceeding.

---

## Phase 2: R#5 — Auth Gate

### Overview

Prove the two independent gates: protected pages redirect anonymous users, protected APIs
401 anonymous callers, and real signup+login round-trip.

### Changes Required:

#### 1. Anonymous page-redirect spec

**File**: `e2e/auth/anonymous-redirect.spec.ts` (new)

**Intent**: Each protected page, hit without a session, redirects to the signin page.

**Contract**: `test.use({ storageState: { cookies: [], origins: [] } })`; parameterized over
`/dashboard`, `/generate`, `/cards`, `/review` (+ one nested path e.g. `/cards/new` to prove
prefix match); assert final URL is `/auth/signin` (302 → signin).

#### 2. Anonymous API-gate spec

**File**: `e2e/auth/api-gate.spec.ts` (new)

**Intent**: Protected API routes reject unauthenticated callers with 401 JSON — the separate
gate a UI test can't see.

**Contract**: Uses the `request` fixture with no storageState; asserts `POST /api/generate`,
`POST /api/flashcards`, `PATCH`/`DELETE /api/flashcards/<id>`, `POST /api/flashcards/<id>/review`
each return **401** with body `{"error":"Unauthorized"}`. (Use a syntactically-valid dummy id;
the auth check precedes lookup.)

#### 3. Login + signup round-trip spec

**File**: `e2e/auth/login-roundtrip.spec.ts` (new)

**Intent**: The real auth forms work end-to-end (the one place we drive the UI login rather
than the fast programmatic path).

**Contract**: Anonymous context; drive `SignInForm` with User A's credentials → assert
redirect to `/dashboard` and an authed-only element renders. Add a signup case: submit a
unique email via the signup form → assert redirect to `/auth/confirm-email`, then (DEV
auto-confirm) sign in with that account successfully. Clean up the created user in teardown.

### Success Criteria:

#### Automated Verification:

- Auth specs pass: `npm run test:e2e -- auth/`
- Lint passes: `npm run lint`

#### Manual Verification:

- Redirect target and authed-render look correct when run headed (`--headed`)
- Signup→confirm→login path works against the local DB end to end

**Implementation Note**: Pause for manual confirmation before the next phase.

---

## Phase 3: R#4 — Generation Progress / Terminal State

### Overview

Add stable test hooks to the generate UI, then prove the flow always reaches a terminal
state (review / empty / error) and shows immediate loading feedback.

### Changes Required:

#### 1. Stable test hooks on the generate states

**File**: `src/components/generate/GenerateView.tsx`

**Intent**: Add `data-testid` attributes to the key elements/states so e2e selectors don't
depend on copy or utility classes. No behavior change.

**Contract**: Add `data-testid` to: source textarea (`generate-source`), submit button
(`generate-submit`), loading indicator (`generate-loading`), review list (`generate-review`),
empty state (`generate-empty`), error state (`generate-error`), retry button
(`generate-retry`). Map to the existing markup at `GenerateView.tsx:104-210`.

#### 2. Generate terminal-state spec

**File**: `e2e/generate/terminal-state.spec.ts` (new)

**Intent**: Drive the React island through every terminal branch deterministically by
stubbing the network.

**Contract**: Authenticated `page.goto('/generate')`. Cases via `page.route('**/api/generate', ...)`:
(a) **loading** — fulfill after a short delay; assert `generate-loading` visible immediately
after submit; (b) **review** — fulfill 200 `{candidates:[…]}`; assert `generate-review`
shows the candidates; (c) **empty** — fulfill 200 `{candidates:[]}`; assert `generate-empty`;
(d) **error** — fulfill 502; assert `generate-error` + `generate-retry` visible. No timing
assertions on a "hang."

### Success Criteria:

#### Automated Verification:

- Generate specs pass: `npm run test:e2e -- generate/`
- Type check passes: `npm run build` (or `astro check`)
- Lint passes: `npm run lint`

#### Manual Verification:

- Headed run shows the loading indicator on click and the correct terminal screen per case
- `data-testid` hooks do not alter the visible UI

**Implementation Note**: Pause for manual confirmation before the next phase.

---

## Phase 4: R#1 — Cross-User Isolation (API-level)

### Overview

Prove User A cannot read/modify/delete User B's flashcard — observable only via raw
cross-user API calls returning 404, with the target row left unchanged.

### Changes Required:

#### 1. Cross-user isolation spec

**File**: `e2e/isolation/cross-user.spec.ts` (new)

**Intent**: With two real authenticated contexts, confirm RLS-backed 404 (not 200, not
silent success) and that B's row is untouched.

**Contract**: In setup, `seedFlashcard(userB.id, {...})` (service_role + explicit `user_id`)
→ capture `cardId`. Build an authenticated `request` context for User A (log in with Origin
header, reuse cookies). Assert as A: `PATCH /api/flashcards/<cardId>` → 404
`{"error":"Flashcard not found"}`; `DELETE /api/flashcards/<cardId>` → 404; `POST
/api/flashcards/<cardId>/review` → 404. Then `getFlashcard(cardId)` (service_role) confirms
the row still exists with original `front`/`back`. Optional thin browser check: A's `/cards`
page never renders B's content.

### Success Criteria:

#### Automated Verification:

- Isolation spec passes: `npm run test:e2e -- isolation/`
- Lint passes: `npm run lint`

#### Manual Verification:

- Confirm 404 (not 403/200) and that B's row is unchanged after A's attempts (check Studio)

**Implementation Note**: Pause for manual confirmation before the next phase.

---

## Phase 5: CI Wiring + Documentation

### Overview

Run the full e2e suite in GitHub Actions on every push/PR (provisioning local Supabase),
and record the gate + cookbook in the test plan.

### Changes Required:

#### 1. CI e2e job

**File**: `.github/workflows/ci.yml`

**Intent**: After lint+build, start local Supabase, apply migrations, seed users, install
chromium, and run the suite on push/PR to `master`.

**Contract**: Add an `e2e` job (or steps): `supabase start` (Docker available on
ubuntu-latest runners), `supabase migration up --local`, export local `SUPABASE_URL`/anon +
service_role into the job env, `npm run test:e2e:install`, `npm run test:e2e`; upload
`playwright-report/` as an artifact on failure. `setup` project seeds users via the admin
API. Keep the existing lint+build job.

#### 2. Test-plan gate + cookbook update

**File**: `context/foundation/test-plan.md`

**Intent**: Mark the e2e gate enforced and fill the e2e cookbook so the next contributor can
add specs.

**Contract**: §5 — flip "e2e on critical flows" to enforced (post-Phase-3); §6.3 — replace
the TBD with the concrete pattern (local Supabase target, `setup`+storageState auth, the
`Origin` requirement, `page.route` stubbing for terminal states, service_role seeding for
cross-user); §3 Phase 3 status → `complete`; §6.6 — a 2–3 line note on what the rollout
taught (single-response generate; two independent auth gates; R#1 done at API level).

### Success Criteria:

#### Automated Verification:

- CI workflow is valid and the e2e job runs green on a push/PR (full suite passes in CI)
- Local full run passes: `npm run test:e2e`
- Lint passes: `npm run lint`

#### Manual Verification:

- The CI run provisions Supabase and completes the suite without manual steps
- `test-plan.md` §5/§6 reflect the shipped gate and pattern

**Implementation Note**: Final phase — confirm the CI run is green before closing.

---

## Testing Strategy

### E2E / API Tests (this change):

- Anonymous page redirects (R#5) — parameterized over protected routes incl. a nested path.
- Anonymous API 401 (R#5) — every protected route via the `request` fixture.
- UI login + signup round-trip (R#5).
- Generate terminal states (R#4) — loading / review / empty / error via `page.route`.
- Cross-user 404 isolation (R#1) — two contexts, row-unchanged assertion.

### Edge cases explicitly covered:

- Prefix-match protected route (`/cards/new`), not just the bare prefix.
- Empty-candidate generate (terminal "empty", not a hang).
- 502 generate (terminal "error" + retry).
- Cross-user 404 must be indistinguishable from "missing" (no ownership leak).

### Manual Testing Steps:

1. `npx supabase start` + `supabase migration up --local`.
2. `npm run test:e2e:install` then `npm run test:e2e -- --headed` to watch the flows.
3. Inspect Studio (`:54323`) to confirm B's row survives A's attempts.

## Performance Considerations

E2E is inherently slow; chromium-only + programmatic auth (storageState) keeps it lean.
workerd dev-server startup is heavy — `webServer.timeout` is 120s and the port is pinned to
avoid flakiness. CI runs the full suite (user's choice); upload the HTML report on failure
to triage flakes.

## Migration Notes

No schema changes. Test users persist in the local DB across runs; reset with `supabase db
reset` when needed. Seeding uses service_role + explicit `user_id` (RLS bypass).

## References

- Research: `context/changes/testing-auth-critical-flow-e2e/research.md`
- Test plan: `context/foundation/test-plan.md` §2 (R#1/R#4/R#5), §3 Phase 3, §4, §5, §6.3
- Memory: `manual-testing-authed-flows.md` (local re-point, admin users, Origin/CSRF 403)
- Auth gate: `src/middleware.ts:4,22,24`; API guards `src/pages/api/**` (401)
- Signin contract: `src/pages/api/auth/signin.ts:5-7,16,19`
- Generate states: `src/components/generate/GenerateView.tsx:27,37,45-66,104-210`
- RLS: `supabase/migrations/20260619185620_create_flashcards.sql:15,27-53`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Harness Bootstrap

#### Automated

- [x] 1.1 Browsers install: `npm run test:e2e:install`
- [x] 1.2 Lint passes: `npm run lint`
- [x] 1.3 Smoke spec passes: `npm run test:e2e -- smoke.spec.ts`
- [x] 1.4 No `e2e/.auth/` or report dirs tracked in `git status`

#### Manual

- [x] 1.5 Local Supabase running + migrations applied
- [x] 1.6 `e2e/.auth/user.json` created with session cookies
- [x] 1.7 Dev server comes up on pinned port 4321 under workerd

### Phase 2: R#5 — Auth Gate

#### Automated

- [ ] 2.1 Auth specs pass: `npm run test:e2e -- auth/`
- [ ] 2.2 Lint passes: `npm run lint`

#### Manual

- [ ] 2.3 Redirect target + authed render correct (headed)
- [ ] 2.4 Signup→confirm→login path works against local DB

### Phase 3: R#4 — Generation Progress / Terminal State

#### Automated

- [ ] 3.1 Generate specs pass: `npm run test:e2e -- generate/`
- [ ] 3.2 Type check passes: `npm run build`
- [ ] 3.3 Lint passes: `npm run lint`

#### Manual

- [ ] 3.4 Headed run shows loading + correct terminal screen per case
- [ ] 3.5 `data-testid` hooks do not alter visible UI

### Phase 4: R#1 — Cross-User Isolation (API-level)

#### Automated

- [ ] 4.1 Isolation spec passes: `npm run test:e2e -- isolation/`
- [ ] 4.2 Lint passes: `npm run lint`

#### Manual

- [ ] 4.3 404 (not 403/200) and B's row unchanged (verified in Studio)

### Phase 5: CI Wiring + Documentation

#### Automated

- [ ] 5.1 CI e2e job runs green on push/PR (full suite passes in CI)
- [ ] 5.2 Local full run passes: `npm run test:e2e`
- [ ] 5.3 Lint passes: `npm run lint`

#### Manual

- [ ] 5.4 CI provisions Supabase + completes suite without manual steps
- [ ] 5.5 `test-plan.md` §5/§6 reflect the shipped gate and pattern
