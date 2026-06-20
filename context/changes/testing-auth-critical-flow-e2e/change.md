---
change_id: testing-auth-critical-flow-e2e
title: Auth & critical-flow e2e — Phase 3 of the test rollout
status: implementing
created: 2026-06-20
updated: 2026-06-20
archived_at: null
---

## Notes

Rollout Phase 3 of `context/foundation/test-plan.md`: "Auth & critical-flow e2e".

Risks covered:
- **R#5** (auth gate / availability) — an unauthenticated request reaches a protected route/API, or a real user cannot log in / sign up.
- **R#4** (no progress feedback) — a generation past 2s leaves the user unsure, with no terminal state.
- **R#1 end-to-end** (cross-user access / IDOR-RLS at the browser level).

Test types planned: e2e (Playwright), with API-level integration redirected to `/10x-implement` or `/10x-tdd` where a browser adds no signal.

Risk response intent:
- **R#5**: prove an unauthenticated request to a protected route/API is redirected or 401'd, and a valid signup + login round-trips. Challenge "login form renders ⇒ auth works" and "protected pages ⇒ protected APIs too." Cheapest layer is e2e (auth) + integration (API gate).
- **R#4**: prove a generate request is acknowledged promptly and always reaches a terminal state (result / empty / error). Challenge "spinner shown ⇒ progress working" and that a hang is itself directly testable. Cheapest layer is e2e (loading → terminal). Avoid asserting a hang exists or brittle timing assertions.
- **R#1 (e2e)**: prove a request authenticated as User A cannot read/edit/delete a card owned by User B. Challenge "logged-in ⇒ authorized." Avoid happy-path-only (only exercising the owner).
