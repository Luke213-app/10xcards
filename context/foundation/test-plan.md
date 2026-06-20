# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-20 (Phase 3 complete — testing-auth-critical-flow-e2e; e2e gate enforced in CI)

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in <area>"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/`.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario)                                                                                       | Impact | Likelihood | Source (evidence — not anchor)                                                                        |
|---|---------------------------------------------------------------------------------------------------------------|--------|------------|------------------------------------------------------------------------------------------------------|
| 1 | Cross-user access (IDOR/RLS gap): User A reads, edits, or deletes a card owned by User B                       | High   | Medium     | PRD Guardrails (user-data isolation), Access Control; interview Q1; hot-spot dirs `src/lib/services/`, `src/pages/api/flashcards/` |
| 2 | Silent save loss on bulk accept: user accepts N generated candidates, some never persist, no error surfaced   | High   | Medium     | PRD Guardrails (no data loss), US-01; interview Q1; hot-spot dir `src/components/generate/`           |
| 3 | AI generation pipeline fails: malformed/empty LLM output crashes the flow instead of degrading cleanly        | High   | Medium     | PRD US-01/FR-003; interview Q1 + Q3; hot-spot dirs `src/components/generate/`, `src/lib/services/`    |
| 4 | No progress feedback: a generation past 2s leaves the user unsure the app is working (no terminal state)       | Medium | Medium     | PRD NFR (prompt ack + continuous progress >2s); interview Q1; tech-stack.md (Cloudflare edge long-task constraint) |
| 5 | Auth gate / availability: unauthenticated request reaches a protected route/API, or a real user cannot log in / sign up | High   | Medium     | PRD Access Control; interview Q1; hot-spot `src/middleware.ts` (5 commits/30d), `src/pages/api/auth/` |
| 6 | Schema drift local→remote: a migration passes locally but is never pushed to the remote project → prod DB 500s, undetected | High   | High       | `context/foundation/lessons.md`; interview Q2                                                          |
| 7 | Server-side validation parity / unbounded input: server trusts the client, or an unbounded paste drives cost/quality failure | Medium | Medium     | PRD FR-003 + Open Question OQ-2; tech-stack.md (Zod boundaries); abuse lens                            |

**Impact × Likelihood rubric.** Both axes are coarse High / Medium / Low.
R6 is the only High × High row — it has already happened once
(`lessons.md`) and its blast radius is "every DB read/write 500s in prod."
Its correct response is a deployment gate, not a test (see §3 Phase 4 and
the Risk Response Guidance below).

### Risk Response Guidance

| Risk | What would prove protection                                                                                   | Must challenge                                                                                   | Context `/10x-research` must ground                                                                | Likely cheapest layer                | Anti-pattern to avoid                                              |
|------|---------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------|--------------------------------------|-------------------------------------------------------------------|
| #1   | A request authenticated as User A cannot read/edit/delete a card owned by User B (404/forbidden, not silent success) | "Logged-in ⇒ authorized"; "RLS enabled ⇒ ownership holds" (a privileged client can bypass RLS)  | Which Supabase client the service uses; whether ownership is checked at the API layer or only by RLS | Integration (two user contexts)      | Happy-path-only — only ever exercising the owner                  |
| #2   | Every accepted candidate is persisted, or the user sees a failure — never a silent partial save               | "Returned 200 ⇒ all saved"; "payload array length ⇒ rows written"                               | The bulk-accept persistence path; partial-failure handling; client behavior on error               | Integration (API)                    | Asserting count from the request payload instead of persisted state |
| #3   | Malformed/empty LLM output yields a clean typed degrade (explanatory empty state), not a 500                  | "Provider returns valid JSON"; testing OpenRouter itself (out of scope — see §7)                | Our parse/validate/error-translation boundary; the empty-result contract                            | Unit (boundary, provider mocked)     | Over-mocking past our own code; oracle copied from the parser     |
| #4   | A generate request is acknowledged promptly and always reaches a terminal state (result / empty / error)      | "Spinner shown ⇒ progress working"; that a "hang" is itself directly testable                    | Streaming/ack shape on the edge runtime; UI terminal-state transitions                              | e2e (loading → terminal)             | Asserting a hang exists; brittle timing assertions                |
| #5   | Unauthenticated request to a protected route/API is redirected or 401'd; a valid signup + login round-trips    | "Login form renders ⇒ auth works"; "protected pages ⇒ protected APIs too"                       | `PROTECTED_ROUTES` coverage; whether API routes gate independently of pages                         | e2e (auth) + integration (API gate)  | UI-only check that skips the API gate                             |
| #6   | A migration not applied to the remote project blocks or flags the deploy before a user hits a 500             | "Passes `supabase db reset` locally ⇒ shipped"                                                   | The deploy pipeline; where a remote-schema check could run                                          | **CI / deploy gate (not a test)**    | Writing a unit test for what is a deployment-gate failure         |
| #7   | The server rejects invalid or oversized input regardless of the client; the input cap is enforced server-side  | "Client validates ⇒ server can trust it"                                                         | Server-side Zod usage on `/api/generate` and `/api/flashcards`; the OQ-2 cap default               | Integration (API)                    | Testing client-side validation only                              |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name                       | Goal (one line)                                                              | Risks covered | Test types                       | Status      | Change folder |
|---|----------------------------------|-----------------------------------------------------------------------------|---------------|----------------------------------|-------------|---------------|
| 1 | Runner bootstrap + store write-path | Stand up Vitest and prove isolation + no-silent-loss on the card store    | #1, #2        | unit + integration               | not started | —             |
| 2 | AI generation boundary           | Malformed/empty LLM output degrades cleanly; server validates input         | #3, #7        | unit (provider mocked) + integration | not started | —         |
| 3 | Auth & critical-flow e2e         | Auth gate holds; signup/login round-trips; generate→accept→save→browse shows progress + terminal state | #5, #4, #1 (end-to-end) | e2e          | complete | context/changes/testing-auth-critical-flow-e2e/ |
| 4 | Quality-gates wiring             | Lint/typecheck/unit+integration in CI; remote-schema drift can't ship silently | #6         | gates                            | not started | —             |

**Status vocabulary** (fixed — parser literals): `not started` →
`change opened` → `researched` → `planned` → `implementing` → `complete`.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer              | Tool                                   | Version | Notes                                                                       |
|--------------------|----------------------------------------|---------|-----------------------------------------------------------------------------|
| unit + integration | Vitest                                 | none yet — see Phase 1 | Natural fit for the Astro + Vite toolchain; bootstrapped in §3 Phase 1.       |
| API / provider mocking | MSW (or per-module mock)           | none yet — see Phase 2 | Mock only the network edge (OpenRouter, Supabase REST). Decide MSW vs. fetch stub during research. |
| e2e                | Playwright                             | none yet — see Phase 3 | Critical flows: auth + generate→accept→save→browse. Runs against `npm run dev` (workerd). |
| accessibility      | (deferred)                             | n/a     | Not in scope for MVP rollout; revisit post-launch.                           |
| runtime            | Astro 6 (`^6.3.1`) / React 19 (`^19.2.6`) / @astrojs/cloudflare (`^13.5.0`) | — | SSR on Cloudflare `workerd`; tests must respect the edge runtime, not assume Node. |
| boundary types     | Zod (`^4.4.3`)                         | —       | Already the input-validation boundary; Phase 2 asserts server-side parity.   |
| data / auth        | @supabase/supabase-js (`^2.99.1`), @supabase/ssr (`^0.10.3`) | — | Local Supabase via `npx supabase start` for integration; never test Supabase itself (see §7). |

**Stack grounding tools (current session):**
- Docs: Context7 — available; not queried at plan time (tool setup is deferred to per-phase research/plan); checked: 2026-06-20
- Search: Exa.ai — available; not used at plan time; checked: 2026-06-20
- Runtime/browser: chrome-devtools MCP — available; candidate driver/verification surface for Phase 3 e2e, but Playwright is the recommended classic layer; checked: 2026-06-20
- Provider/platform: Supabase MCP — available; relevant to Phase 4 (remote-schema drift gate, R6) for verifying applied migrations against the remote project; checked: 2026-06-20

Use docs MCPs (Context7) for current Vitest/Playwright/Astro setup details
during each phase's research. Do not use MCP docs/search to infer code
failure anchors; those belong in per-phase `/10x-research`.

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate                        | Where                | Required?                  | Catches                                              |
|-----------------------------|----------------------|----------------------------|-----------------------------------------------------|
| lint + typecheck            | local + CI           | required (already wired)   | syntactic / type drift                              |
| unit + integration          | local + CI           | required after §3 Phase 1  | logic regressions; isolation + save-loss            |
| e2e on critical flows       | CI on push/PR        | required (wired in CI)     | broken auth / generate-save-browse paths            |
| remote-schema drift gate    | between merge + prod  | required after §3 Phase 4  | migration applied locally but not pushed to remote (R6) |
| pre-prod smoke              | between merge + prod  | optional                   | environment-specific failures on the edge runtime   |
| post-edit hook              | local (agent loop)    | optional                   | regressions at edit time (Module 3 Lesson 3)        |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

- TBD — see §3 Phase 2 (AI generation boundary parse/validate pattern).

### 6.2 Adding an integration test

- TBD — see §3 Phase 1 (store write-path: isolation under two user contexts; no-silent-loss on bulk accept).

### 6.3 Adding an e2e test

The Playwright harness lives in `e2e/`; run it with `npm run test:e2e`
(`npm run test:e2e:install` once to fetch chromium). It runs in CI on every
push/PR via the `e2e` job in `.github/workflows/ci.yml`.

- **Target LOCAL Supabase, never remote.** Run `npx supabase start` +
  `npx supabase migration up --local` first. The dev server under test is
  re-pointed at the local stack by `e2e/support/dev-vars.mjs` (it swaps
  `.dev.vars` before `astro dev` boots — workerd reads `.dev.vars`, not
  `process.env` — and `e2e/global-teardown.mjs` restores it). Never point a
  test at the production project.
- **Auth once, reuse via storageState.** The `setup` project
  (`e2e/auth.setup.ts`) logs User A in programmatically and writes
  `e2e/.auth/user.json`; the `chromium` project reuses it. Anonymous specs opt
  out with `test.use({ storageState: { cookies: [], origins: [] } })`.
- **`Origin` header is load-bearing on programmatic POSTs.** Any `request`-fixture
  form POST (login, cross-user calls) must send `headers: { Origin: baseURL }`
  or Astro's CSRF origin check returns 403. Real browser navigation sends it
  automatically; only programmatic calls need it set.
- **Force terminal states with `page.route`.** Stub `**/api/generate` to fulfill
  200 `{candidates:[…]}` / 200 `{candidates:[]}` / 502 to drive the
  review / empty / error branches deterministically (`e2e/generate/`). Assert on
  the `data-testid` hooks in `GenerateView.tsx` (`generate-loading`,
  `generate-review`, `generate-empty`, `generate-error`, `generate-retry`) — not
  on copy or utility classes. Do not assert a "hang" or use brittle timing.
- **Seed cross-user rows with service_role + explicit `user_id`.** Use
  `seedFlashcard(userId, …)` / `getFlashcard(id)` from `e2e/support/seed.ts`
  (service_role bypasses RLS; `auth.uid()` is null so the `user_id` default would
  fail without the explicit id). Test users are created idempotently via the
  admin API (`ensureTestUsers()`, `email_confirm:true`).
- **Two independent auth gates.** Pages redirect via `middleware.ts`; API routes
  401 via inline `context.locals.user` checks. Assert both separately — a UI-only
  test misses the API gate (`e2e/auth/anonymous-redirect.spec.ts` vs
  `e2e/auth/api-gate.spec.ts`).
- Keys: the committed local keys in `e2e/support/local-supabase.ts` are the
  well-known default-JWT keys (safe to commit); CI overrides them from
  `supabase status -o env`.

### 6.4 Adding a test for a new API endpoint

- TBD — see §3 Phase 1 (preferred layer: integration against the route with a real user context; mock only the external network edge).

### 6.5 Adding a server-side input-validation test

- TBD — see §3 Phase 2 (server rejects invalid/oversized input regardless of client; OQ-2 cap enforced server-side).

### 6.6 Per-rollout-phase notes

(Optional. After each phase lands, `/10x-implement` appends a 2–3 line note
here capturing anything surprising the rollout phase taught.)

**Phase 3 (Auth & critical-flow e2e), 2026-06-20.** Generate is *single-response*,
not streamed — the R#4 oracle is "always reaches a terminal state," so we stub
`/api/generate` with `page.route` rather than test a streaming/hang. Auth is
*two independent gates* (page redirect in middleware vs. inline 401 in each API
route) that can drift apart, so R#5 asserts both separately. R#1 is invisible to
a browser (no `GET /api/flashcards/[id]`, `/cards` lists only your own rows), so
it ships as a Playwright **API-level** test (`request` fixture, two contexts),
not a browser spec. The `Origin` header on programmatic POSTs and service_role +
explicit `user_id` for cross-user seeding were the two load-bearing gotchas.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **External services as subjects** — Supabase, Cloudflare Workers, and OpenRouter are boundaries to stub/mock, not subjects under test. We test *our* code at those boundaries (parsing, validation, error translation, ownership), never the vendor's behavior. Re-evaluate if we wrap one in non-trivial custom logic. (Source: Phase 2 interview Q5.)
- **The FSRS scheduling library internals** — the spaced-repetition algorithm is a ready-made dependency (PRD Non-Goals: integrate, don't build); the library is its own test. We test only our integration glue. Re-evaluate if we fork or customize it. (Source: PRD Non-Goals + Q5 rationale.)
- **Design-system / marketing-landing visual polish** — no snapshot tests on presentation churn (the bulk of recent commits); it breaks constantly and catches little. Re-evaluate if a visual regression actually ships to users. (Source: Phase 2 interview Q5 — "every *flow* is critical," not every pixel.)

> Note: "every user flow is critical" (Q5) — negative space here is about
> *external services and presentation polish*, not about pruning user
> flows. Flow coverage is deliberately broad across §3.

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-20
- Stack versions last verified: 2026-06-20
- AI-native tool references last verified: 2026-06-20

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
