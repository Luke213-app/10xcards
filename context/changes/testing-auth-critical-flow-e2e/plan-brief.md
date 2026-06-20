# Auth & Critical-Flow E2E — Plan Brief

> Full plan: `context/changes/testing-auth-critical-flow-e2e/plan.md`
> Research: `context/changes/testing-auth-critical-flow-e2e/research.md`

## What & Why

Stand up the project's first e2e test harness (Playwright) and use it to protect three
rollout-Phase-3 risks: the auth gate (R#5), generation progress/terminal-state (R#4), and
cross-user data isolation (R#1). These are the critical user flows; today nothing guards
them automatically.

## Starting Point

No test infrastructure exists at all — no Playwright/Vitest, no `test` script, no spec
files. The app's auth, generate, and RLS behavior is already built and well-formed; this
change adds the tests around it (plus small `data-testid` hooks on the generate UI).

## Desired End State

`npx playwright test` runs a chromium suite against a freshly-seeded local Supabase and
passes: anonymous users are redirected from protected pages and 401'd on protected APIs,
login/signup round-trip, the generate flow always reaches a terminal screen (review / empty
/ error), and User A gets a 404 (not silent success) against User B's card. The same suite
runs in CI on every push/PR.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| When tests run | Full suite in CI on every push/PR | User wants maximum automatic protection. | Plan |
| R#1 scope | Included now, as a Playwright **API-level** test | Browser can't reach another user's card; API-request test gives the integration signal without a second runner. | Research + Plan |
| R#4 empty/error | Stub `/api/generate` via `page.route` | Deterministic, fast, no LLM cost; we don't test OpenRouter itself. | Research + Plan |
| Selectors | Add `data-testid` to GenerateView | Stable hooks so specs don't break on copy/style changes. | Plan |
| Auth in tests | Programmatic login once → `storageState` | Faster than UI login per test; the cookie is the unit under test. | Research |
| Supabase target | Local, via `webServer.env` | Remote is production — tests must never touch it. | Research |
| Browser matrix | chromium-only | MVP speed/stability. | Plan |

## Scope

**In scope:** Playwright harness + local-Supabase wiring + test-user seeding; R#5 (page
redirect + API 401 + login/signup round-trip); R#4 (loading → terminal states); R#1
(cross-user 404, API-level); CI job; test-plan §5/§6 update.

**Out of scope:** Vitest runner; streaming generate; remote-schema drift gate (R#6 / Phase
4); multi-browser matrix; testing external services; visual polish.

## Architecture / Approach

Build the harness first so later phases have a runner + an authed session. A `setup`
project logs in programmatically (`POST /api/auth/signin` **with the `Origin` header** — Astro
403s otherwise) and saves cookies via `storageState`; browser specs reuse it, anonymous
specs opt out. Tests target local Supabase (pinned dev port 4321 via `webServer.env`); test
users come from the Supabase admin API (`email_confirm:true`); cross-user seeding uses
service_role + explicit `user_id` (RLS bypass). R#4 forces empty/error with `page.route`
stubs.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Harness bootstrap | Playwright + local-Supabase + auth fixture + smoke spec | workerd dev-server startup / port flakiness |
| 2. R#5 auth gate | Anonymous redirect + API 401 + login/signup round-trip | Forgetting the `Origin` header → spurious 403 |
| 3. R#4 generate states | `data-testid` hooks + loading/review/empty/error specs | Brittle selectors if hooks are skipped |
| 4. R#1 isolation | Cross-user 404 + row-unchanged (API-level) | RLS seeding pitfall (service_role + explicit user_id) |
| 5. CI + docs | Full suite in GitHub Actions + test-plan update | CI provisioning Supabase/Docker; flaky CI runs |

**Prerequisites:** local `npx supabase start` (Docker) + `supabase migration up --local`;
service_role + anon keys from `supabase status -o env`.
**Estimated effort:** ~3-4 sessions across 5 phases.

## Open Risks & Assumptions

- CI must provision Docker + Supabase + seed users — the biggest setup cost (user opted for
  full-CI; expect slower, costlier builds and possible flakiness).
- Signup round-trip relies on DEV auto-confirm (`confirm-email.astro:5`).
- E2E flakiness is inherent; chromium-only + storageState + report-on-failure mitigate it.

## Success Criteria (Summary)

- Anonymous users can't reach protected pages (redirect) or APIs (401); real login/signup work.
- Generation always lands on a terminal screen — never an indefinite spinner.
- User A cannot read/edit/delete User B's card (404, row intact) — proven, not assumed.
