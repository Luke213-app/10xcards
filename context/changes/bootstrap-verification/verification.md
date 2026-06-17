---
bootstrapped_at: 2026-06-17T19:56:07Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: 10xcards
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

Verbatim copy of `context/foundation/tech-stack.md`.

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10xcards
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

### Why this stack

A solo builder shipping an AI-flashcard MVP after-hours in 3 weeks needs a battle-tested, agent-friendly starter that delivers auth, a database, and deploy out of the box so the time goes to the product, not the plumbing. 10x Astro Starter (Astro + React + TypeScript + Supabase + Cloudflare) is the recommended default for `(web, js)` and clears all four agent-friendly gates. Supabase auth covers the email/password accounts (FR-001/002); Supabase Postgres with row-level security gives server-side, cross-device persistence and satisfies the user-data-isolation and no-data-loss guardrails; TypeScript with Zod boundaries suits validating LLM output into candidate cards (has_ai). Payments, realtime, and background jobs are out of scope per the PRD non-goals. The Cloudflare edge runtime constrains long-running tasks, so the AI generation flow should stream or chunk progress — which the >2s progress-feedback NFR already anticipates. Deployment lands on Cloudflare Pages (starter default); CI runs on GitHub Actions with auto-deploy-on-merge, the shape the starter ships with. Bootstrapper confidence is first-class — expect mostly-smooth scaffolding with occasional manual steps.

## Pre-scaffold verification

| Signal      | Value                                                              | Severity | Notes                                                    |
| ----------- | ------------------------------------------------------------------ | -------- | -------------------------------------------------------- |
| npm package | not run                                                            | —        | `cmd_template` starts with `git clone`; no `create-*` CLI to check |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-05-17T10:33:39Z | fresh    | from card.docs_url; ~1 month before run (within 3 months) |

No stale signals. Proceeded without warning.

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 19
**Conflicts (.scaffold siblings)**: CLAUDE.md → CLAUDE.md.scaffold
**.gitignore handling**: moved silently (cwd had no .gitignore)
**.bootstrap-scaffold cleanup**: deleted (cloned `.git/` removed before move-up so upstream history did not leak)

Files moved up into cwd: `.husky`, `wrangler.jsonc`, `node_modules`, `astro.config.mjs`, `supabase`, `README.md`, `public`, `.prettierrc.json`, `.gitignore`, `package-lock.json`, `package.json`, `.nvmrc`, `.github`, `components.json`, `tsconfig.json`, `eslint.config.js`, `.env.example`, `.vscode`, `src`.

Preserved untouched in cwd (not shipped by scaffold): `.claude/`, `context/`, `idea-notes.md`. The scaffold shipped no `context/`, so the context-drop rule did not need to fire.

## Post-scaffold audit

**Tool**: `npm audit --json` (exit code 1 — non-zero because advisories exist; not treated as a halt)
**Summary**: 0 CRITICAL, 4 HIGH, 11 MODERATE, 3 LOW (total 18)
**Direct vs transitive**: 0/0/0/0 direct of total 0/4/11/3 — every finding is transitive. No direct dependency carries an advisory.
**Dependency tree**: 895 total (449 prod, 316 dev, 131 optional).

#### CRITICAL findings

(none)

#### HIGH findings

- **astro** (`<=7.0.0-alpha.1`) — transitive; fix available. Reflected XSS via unescaped slot name (GHSA-8hv8-536x-4wqp); XSS via unescaped attribute names in spread props (GHSA-jrpj-wcv7-9fh9); host-header SSRF in prerendered error page fetch (GHSA-2pvr-wf23-7pc7); esbuild chain.
- **devalue** (`5.6.3 - 5.8.0`) — transitive; fix available. DoS via sparse array deserialization (GHSA-77vg-94rm-hx3p).
- **vite** (`7.0.0 - 7.3.3`) — transitive; fix available. launch-editor NTLMv2 hash disclosure via UNC path handling on Windows (GHSA-v6wh-96g9-6wx3); `server.fs.deny` bypass on Windows alternate paths (GHSA-fx2h-pf6j-xcff).
- **ws** (`8.0.0 - 8.20.1`) — transitive; fix available via `wrangler@4.63.0` (semver-major). Uninitialized memory disclosure (GHSA-58qx-3vcg-4xpx); memory-exhaustion DoS from tiny fragments/data chunks (GHSA-96hv-2xvq-fx4p).

#### MODERATE findings

- **@astrojs/check** (`>=0.9.3`) — transitive; fix via `@astrojs/check@0.9.2` (semver-major); via @astrojs/language-server.
- **@astrojs/language-server** (`>=2.14.0`) — transitive; via volar-service-yaml.
- **@cloudflare/vite-plugin** (`>=0.0.7`) — transitive; fix available; via miniflare/wrangler/ws.
- **js-yaml** (`<=4.1.1`) — transitive; fix available. Quadratic-complexity DoS in merge-key handling via repeated aliases (GHSA-h67p-54hq-rp68).
- **miniflare** (`3.20250204.0 - 4.20260518.0`) — transitive; fix via `wrangler@4.63.0` (semver-major); via ws.
- **supabase** (`1.1.6 - 2.98.2`) — transitive; fix available; via tar.
- **tar** (`<=7.5.15`) — transitive; fix available. PAX size-override file-smuggling parser differential (GHSA-vmf3-w455-68vh).
- **volar-service-yaml** (`<=0.0.70`) — transitive; via yaml-language-server.
- **wrangler** (`>=3.108.0`) — transitive; fix via `wrangler@4.63.0` (semver-major); via esbuild/miniflare.
- **yaml** (`2.0.0 - 2.8.2`) — transitive; fix available. Stack overflow via deeply nested YAML collections (GHSA-48c2-rrv3-qjmp).
- **yaml-language-server** — transitive; via yaml.

#### LOW / INFO findings

- **@astrojs/cloudflare** (`>=13.2.0`) — transitive; fix via `@astrojs/cloudflare@13.1.10` (semver-major); via wrangler.
- **@babel/core** (`<=7.29.0`) — transitive; fix available. Arbitrary file read via sourceMappingURL comment (GHSA-4x5r-pxfx-6jf8).
- **esbuild** (`0.27.3 - 0.28.0`) — transitive; fix via `wrangler@4.63.0` (semver-major). Arbitrary file read when running the dev server on Windows (GHSA-g7r4-m6w7-qqqr).

Note: several fixes are flagged semver-major (`npm audit fix --force`) and cluster around the `wrangler` / `@astrojs/check` upgrade lines. Bootstrapper does not auto-fix — applying these is the user's call per project risk tolerance. None are direct dependencies; many are dev/Windows-only surfaces.

## Hints recorded but not acted on

| Hint                    | Value           |
| ----------------------- | --------------- |
| team_size               | solo            |
| deployment_target       | cloudflare-pages |
| ci_provider             | github-actions  |
| ci_default_flow         | auto-deploy-on-merge |
| bootstrapper_confidence | first-class     |
| path_taken              | standard        |
| quality_override        | false           |
| self_check_answers      | null            |
| has_auth                | true            |
| has_payments            | false           |
| has_realtime            | false           |
| has_ai                  | true            |
| has_background_jobs     | false           |

These were read from the hand-off but not acted on in v1 (no CI generation, no agent-context files, no feature-flag-driven scaffolding). `bootstrapper_confidence: first-class` and `quality_override: false` required no compensating action.

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history. The cloned starter's `.git/` was deleted on purpose, so this repo has no history yet.
- Review `CLAUDE.md.scaffold` against your existing `CLAUDE.md` (`diff CLAUDE.md CLAUDE.md.scaffold`) and merge anything from the starter you want to keep.
- Copy `.env.example` to `.env` and fill in Supabase + Cloudflare credentials before running the app.
- Configure Supabase row-level security early (the card's gotcha: "RLS must be configured early or auth gaps creep in").
- Address audit findings per your project's risk tolerance — full breakdown above. All findings are transitive; none are direct.
