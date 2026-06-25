---
date: 2026-06-25T20:35:54+0200
researcher: lukaszblonski
git_commit: f96ef65f4f17897d3cd18bc6ca55f8a222b68b82
branch: master
repository: 10xcards
topic: "AI code review built on OpenRouter Agent SDK with promptfoo evals"
tags: [research, codebase, code-review, openrouter, agent-sdk, promptfoo, ci-cd]
status: complete
last_updated: 2026-06-25
last_updated_by: lukaszblonski
last_updated_note: "Locked the 5 PR acceptance criteria + Model B (average ≥7 with security/correctness veto <5) from conversation"
---

# Research: AI code review built on OpenRouter Agent SDK with promptfoo evals

**Date**: 2026-06-25T20:35:54+0200
**Researcher**: lukaszblonski
**Git Commit**: f96ef65f4f17897d3cd18bc6ca55f8a222b68b82
**Branch**: master
**Repository**: 10xcards

## Research Question

Build a NEW AI code-review system on the **OpenRouter Agent SDK** (`@openrouter/agent`) living in `packages/code-reviewer/`, scored on concrete acceptance criteria, wired into CI/CD on PRs to `master`, and backed by **promptfoo** evals that test the same review prompt across multiple OpenRouter models against a planted-flaw fixture (React 16→19 migration diff) with LLM-as-judge + static assertions.

Seed artifacts: `.claude/prompts/m5l3-requirements.md` (reviewer requirements), `.claude/prompts/m5l3-promptfoo.md` (eval requirements), `.claude/prompts/m5l3-cicd.md` (CI/CD requirements).

## Summary

- This is a **second, independent reviewer**, distinct from the existing `claude-code-action` / `10x-impl-review-ci` plan-vs-implementation reviewer. It scores generic code quality (criteria 1–N, 1–10 each), posts a PR comment, and applies `ai-cr:passed` / `ai-cr:failed` labels with an `ai-cr:review` retry label. No collision with the existing reviewer if names/markers/labels stay distinct (§4).
- The **OpenRouter Agent SDK exists** (`@openrouter/agent`, **beta**, **ESM-only**, pin the version). It provides `callModel` (auto agent loop), `tool()` (Zod-typed tools), stop conditions, streaming. For a reviewer the agent loop only earns its keep if we give the model **tools** (e.g. read full file beyond the diff, fetch PR metadata); a pure diff→JSON scoring call could use the lighter Client SDK. Decision deferred — see Open Questions (§7).
- The repo **already integrates OpenRouter** via plain `fetch` in `src/lib/services/openrouter.ts`, and **already declares `OPENROUTER_API_KEY` / `OPENROUTER_MODEL`** as server secrets in `astro.config.mjs`. The new reviewer runs as a **standalone Node script in CI** (not inside Astro), so it reads `process.env.OPENROUTER_API_KEY` directly — which is exactly what `@openrouter/agent`'s `OpenRouter` client does by default.
- `packages/code-reviewer/` exists but is **empty**. `package.json` has **no `workspaces`** field and **no unit-test runner** (only Playwright e2e). The repo is `type: module` (ESM) — aligns with the ESM-only Agent SDK. A new workspace package needs its own `package.json` + `tsconfig.json`; ESLint/Prettier already apply repo-wide.
- **promptfoo** cleanly supports the eval requirements: `openrouter:<model>` providers for the multi-model matrix, `file://` fixtures for the diff, `llm-rubric` (with `threshold`) for planted-flaw detection, `javascript`/`is-json` static assertions for the "review must fail the PR" check, and a **custom JS/TS provider** to eval the *actual* agent (not just a raw prompt). CI gates on exit code `100`.

## Detailed Findings

### 1. OpenRouter Agent SDK (`@openrouter/agent`) — external docs

Source: https://openrouter.ai/docs/agent-sdk (+ `.md` / `overview.mdx`), npm `@openrouter/agent` (published 2026-04-01), GitHub `OpenRouterTeam/typescript-agent`.

- **Install**: `npm install @openrouter/agent` — auto-includes the Client SDKs (`@openrouter/sdk`). **Beta**: "pin to a specific version in your `package.json`." **ESM-only** (CommonJS must `await import('@openrouter/agent')`).
- **Two call styles appear in the docs** (API drift between doc versions — verify against the installed version):
  - Standalone: `await callModel({ model, messages: [...], tools: [...] })`.
  - Client-based (npm README, current): `const client = new OpenRouter({ apiKey }); callModel(client, { model, input, tools: [...] as const })`. The `OpenRouter` client reads `process.env.OPENROUTER_API_KEY` automatically.
- **`callModel`** runs the inference loop: sends messages → if tool calls, executes them via the tool's `execute` → appends results → repeats until a stop condition or no more tool calls. Returns a result with `await result.getText()` and `result.getTextStream()` (streaming).
- **`tool()` helper** — Zod-typed:
  ```typescript
  import { tool } from '@openrouter/agent';
  import { z } from 'zod';
  const readFile = tool({
    name: 'read_file',
    description: 'Read full contents of a repo file for extra context',
    inputSchema: z.object({ path: z.string() }),
    outputSchema: z.object({ content: z.string() }),
    execute: async ({ path }) => ({ content: await fs.readFile(path, 'utf8') }),
  });
  ```
  Three tool types: **regular** (auto-executed), **generator** (stream progress via `eventSchema`), **manual** (reported to model, not auto-executed — human-in-the-loop). Type helpers: `InferToolInput/Output/Event`. `maxToolRounds: 0` returns tool calls without executing.
- **Stop conditions**: `stepCountIs(n)`, `maxCost(usd)`, `hasToolCall(...)` passed via `stopWhen: [...]`. Critical for a CI reviewer to bound cost/latency.
- **Model IDs** are OpenRouter slugs: `anthropic/claude-sonnet-4`, `openai/gpt-4o`, `z-ai/glm-4.6`, `deepseek/...` etc.
- **Official agent skill** available: `gh skill install OpenRouterTeam/skills openrouter-typescript-sdk` (or Claude Code plugin `marketplace add OpenRouterTeam/skills` → `plugin install openrouter@openrouter`). Worth installing before implementation for live SDK knowledge.
- **Structured output for scoring**: the Client SDK in this repo already uses `response_format: { type: "json_object" }` (`src/lib/services/openrouter.ts:41`). The Agent SDK's final text can be constrained the same way (or via a Zod `outputSchema` tool / parsing `getText()`).

### 2. Existing OpenRouter integration + env/secrets/package conventions (internal)

- **`src/lib/services/openrouter.ts`** — current pattern to mirror:
  - Endpoint `https://openrouter.ai/api/v1/chat/completions` (`:8`), `Authorization: Bearer ${opts.apiKey}` (`:38`), `Content-Type: application/json`.
  - Body: `{ model, response_format: { type: "json_object" }, messages: [{role:"system",...},{role:"user",...}] }` (`:35-48`).
  - Parses `payload.choices[0].message.content` (`:65-68`); custom `OpenRouterError` (`:20-25`) wraps network/non-2xx/parse/shape failures.
  - Signature `generateCandidates(sourceText, { apiKey, model })` (`:32`) — apiKey/model injected, not read from env inside the service. Good reuse shape for the reviewer.
- **Env wiring** — `astro.config.mjs:17-24` declares `SUPABASE_URL/KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` as `envField.string({ context:"server", access:"secret", optional:true })`. In-Astro access: `import { OPENROUTER_API_KEY } from "astro:env/server"` (`src/pages/api/generate.ts:2`). **A standalone Node script reads `process.env.OPENROUTER_API_KEY`** (pattern: `e2e/support/local-supabase.ts:12` uses `process.env.*`). Local secrets live in `.env` (Node) + `.dev.vars` (workerd), both gitignored; prod via `wrangler secret put`.
- **`package.json`**: `type: module` (`:3`), **NO `workspaces`**, name `10x-astro-starter`. Scripts: `dev, build, preview, astro, deploy, preview:remote, cf-typegen, lint, lint:fix, format, test:e2e, test:e2e:install`. Deps incl. TypeScript `^5.9.3`, Zod `^4.4.3`, Astro `^6.3.1`, Playwright `^1.61.0`. **No vitest/jest** — only Playwright e2e.
- **`tsconfig.json`** extends `astro/tsconfigs/strict`, `include: ["**/*"]`, path alias `@/* → ./src/*`. A `packages/code-reviewer/` package should get **its own `tsconfig.json`**; note root's `**/*` would otherwise try to type-check package files under Astro's config — keep the package isolated (own tsconfig, possibly exclude `packages/**` from root).
- **ESLint** flat config (`eslint.config.js`) applies repo-wide via `.gitignore` exclusions; would lint `packages/**/*.ts` by default (no React/Astro rules unless added). **Prettier** (`.prettierrc.json`) applies globally. **Node** pinned `.nvmrc` 22.14.0; CI uses node 22.
- **`packages/code-reviewer/`** confirmed **empty**.

### 3. promptfoo eval harness (external)

Source: promptfoo.dev docs (config guide, providers/openrouter, model-graded, deterministic, custom-api, ci-cd, github-action). Add `# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json`; run `promptfoo validate config`.

- **Config**: top-level `prompts`, `providers`, `tests`, `defaultTest`. Matrix = every prompt × provider × test. Prompt from `file://prompts/code-review.txt` with Nunjucks `{{diff}}`.
- **Multi-model matrix** (the core requirement) — list providers:
  ```yaml
  providers:
    - id: openrouter:z-ai/glm-4.6        # verify exact slug vs live catalog
      config: { temperature: 0, max_tokens: 4000 }
    - id: openrouter:deepseek/deepseek-v3.2
    - id: openrouter:anthropic/claude-haiku-4.5
  ```
  Needs `OPENROUTER_API_KEY` in env; OpenAI-format; default base `https://openrouter.ai/api/v1` (override via `config.apiBaseUrl`). `showThinking: false` strips reasoning tokens from graded output.
- **LLM-as-judge**: `llm-rubric` (returns `{reason, score, pass}`, supports `threshold`). Embed the planted-flaw list as a test `var` and require all are caught:
  ```yaml
  defaultTest: { options: { provider: openrouter:openai/gpt-5.4 } }   # neutral strong grader
  tests:
    - vars:
        diff: file://fixtures/react-migration.diff
        planted_flaws: |
          1. ... 2. ... 3. ...
      assert:
        - type: llm-rubric
          threshold: 0.8
          value: |
            The review must identify ALL planted flaws: {{ planted_flaws }}
            Review output: {{ output }}
  ```
  Grader scope precedence: per-assertion `provider` > per-test `options.provider` > global `defaultTest.options.provider` > `--grader` CLI. Use a **third, neutral model** as judge.
- **Static assertions** (the "verify the review actually fails" requirement): `is-json` (+ JSON schema), `regex`, and `javascript` that parses the structured output and gates on `verdict`/`score`:
  ```yaml
  assert:
    - type: is-json
      value: { required: [verdict, score, findings], type: object, properties: { verdict: {type: string, enum: [pass, fail]}, score: {type: number} } }
    - type: javascript
      value: |
        const r = JSON.parse(output);
        return { pass: r.verdict === 'fail' && r.score < 50, score: r.score/100, reason: `verdict=${r.verdict}` };
  ```
- **File fixtures**: `diff: file://fixtures/react-migration.diff` loads raw text into `{{diff}}`. Paths relative to config.
- **CI gating**: `promptfoo eval -c promptfooconfig.yaml`. Exit code **`100`** = a test failed or pass-rate below `PROMPTFOO_PASS_RATE_THRESHOLD`; `1` = other error. `-o results.json` + `jq` for custom thresholds. Cache `~/.cache/promptfoo` via `actions/cache@v4`. The `promptfoo/promptfoo-action@v1` is OpenAI-first; for OpenRouter, prefer a plain `npx promptfoo@latest eval` `run:` step with `OPENROUTER_API_KEY` in env.
- **Custom provider** (eval the *real* agent, not a raw prompt): `id: file://providers/codeReviewerAgent.ts` exporting a class with `id()` + `callApi(prompt, context)`; pull `context.vars.diff`, call the agent, return `{ output, tokenUsage, cost }`. Lets us A/B the agent vs. plain prompts in one matrix. `.ts` supported; run from project root for path aliases.

### 4. Existing review + CI machinery, and how to coexist (internal)

- **`.github/workflows/review.yml`** ("AI Code Review"): PR→master, `types: [opened, synchronize, reopened, labeled, unlabeled]`, paths filter on `src/** e2e/** supabase/**` + config (`:32-42`). Fork guard `head.repo.full_name == github.repository` (`:50`). Concurrency `ai-code-review-${PR}` (`:52`). Permissions `contents/pull-requests/statuses/id-token: write` (`:55-65`). Runs `anthropics/claude-code-action@v1` with `--model claude-sonnet-4-6 --max-turns 60` (`:165-168`) invoking `/10x-impl-review-ci`.
  - **Merge gate** = manual commit status `impl-review-ci/verdict` (`:266`) POSTed to the bot SHA; parses `- **Verdict**: REJECTED|APPROVED|NEEDS ATTENTION` (`:300-302`) from the committed report; bypass via **`impl-review-override`** label (`:327-334`). Bot commit must carry `[skip ci]` + report must start with `<!-- IMPL-REVIEW-REPORT -->` (`:219-239`).
- **`.github/workflows/ci.yml`**: `ci` job (lint+build, secrets `SUPABASE_URL/KEY`) + `e2e` job (local Supabase + Playwright). No status posting.
- **`10x-impl-review-ci` skill**: plan-vs-implementation review, 7 dimensions, verdict APPROVED/NEEDS ATTENTION/REJECTED, writes `context/changes/<id>/reviews/impl-review.md`, posts a summary comment + inline comments (marker `<!-- impl-review-ci:marker -->`).
- **Collision-avoidance for the new reviewer** (all must be distinct):

  | Item | Existing | New reviewer should use |
  |---|---|---|
  | Workflow file | `review.yml` | `code-review.yml` (or `ai-cr.yml`) |
  | Workflow name | `AI Code Review` | e.g. `AI Quality Review` |
  | Concurrency group | `ai-code-review-${PR}` | `ai-cr-${PR}` |
  | Status context | `impl-review-ci/verdict` | `ai-cr/verdict` (if a gate is wanted) |
  | Labels | `impl-review-override` | `ai-cr:passed`, `ai-cr:failed`, `ai-cr:review` (per requirements) |
  | Comment marker | `<!-- impl-review-ci:marker -->` | `<!-- ai-cr:marker -->` |
  | Report path (if any) | `reviews/impl-review.md` | `reviews/ai-cr.md` |

  Safe to share: paths filter, fork guard, event types, secrets pattern. **New secret needed**: `OPENROUTER_API_KEY` repo secret (the existing reviewer uses `ANTHROPIC_API_KEY`).

### 5. Requirements decoded (from the M5L3 prompt seeds)

- **`m5l3-requirements.md`**: GHA on every PR to master; **composite action** wrapping the review (keep the main workflow thin); inputs = PR **title**, PR **description** (flagged as a cost tradeoff), **git diff**. **6 criteria scored 1–10** in the seed (correctness, idiomaticity, complexity, test/risk coverage, documentation, security/safety) — *the user now wants to converge on **5** via conversation*. Parked: business alignment, architectural fit (need broader context). Side-effects: PR comment with summary + labels `ai-cr:failed`/`ai-cr:passed`. Retry on-demand when `ai-cr:review` label added.
- **`m5l3-promptfoo.md`**: introduce promptfoo within `packages/code-reviewer`; first config tests the same review prompt across **3 models** (named `z-ai/glm-5.1`, `deepseek/deepseek-v4-flash` — **verify slugs**, likely placeholders); one **complex React 16→19 migration diff with 3 impactful flaws**; **LLM-as-judge** verifies the review identifies the flaws; plus a **static test** that the review actually fails.
- **`m5l3-cicd.md`**: CI/CD workflow v1 built from the requirements file. (References placeholder change-id `ci-cd-code-review`; the real change is `code-review-2`.)

## Code References

- `src/lib/services/openrouter.ts:8,20-25,32,35-48,65-68` — OpenRouter fetch pattern, error class, parsing (reuse shape).
- `src/pages/api/generate.ts:2` — `astro:env/server` import of OpenRouter secrets.
- `astro.config.mjs:17-24` — env schema (already declares `OPENROUTER_API_KEY`/`OPENROUTER_MODEL`).
- `package.json:3` — `type: module`; no `workspaces`; no unit-test runner.
- `tsconfig.json` — extends astro strict, `**/*` include, `@/*` alias.
- `eslint.config.js`, `.prettierrc.json`, `.nvmrc` (22.14.0) — repo-wide lint/format/node.
- `packages/code-reviewer/` — empty stub.
- `.github/workflows/review.yml:32-42,50,52,55-65,165-168,266,300-302,327-334` — existing reviewer trigger/gate/labels.
- `.github/workflows/ci.yml` — lint/build/e2e jobs.
- `.claude/prompts/m5l3-{requirements,promptfoo,cicd}.md` — requirement seeds.

## Architecture Insights

- **Standalone Node package, not Astro code.** The reviewer runs in CI as a Node ESM script reading `process.env`. Don't route it through `astro:env/server`. This keeps it independent of the Workers runtime and edge constraints noted in CLAUDE.md.
- **Agent SDK vs Client SDK is a real fork.** A pure "diff → JSON scores" reviewer is a single structured call — the Client SDK suffices and is cheaper/simpler. The Agent SDK earns its place only if the reviewer gets **tools** (read full files beyond the diff, fetch PR metadata, look up sibling files for idiomaticity checks). The user chose the Agent SDK, so the design should give it ≥1 meaningful tool to justify the loop, and bound it with `stopWhen: [stepCountIs(...), maxCost(...)]`.
- **Cost discipline.** Inputs include the full diff (and optionally PR description). Stop conditions + `temperature: 0` + a cap on diff size are needed so CI cost stays bounded. The seed itself flags PR-description inclusion as a cost tradeoff.
- **Structured output is the contract.** Both the PR-comment side-effect and the pass/fail label depend on a stable JSON shape (`{ verdict, score|scores, findings }`). promptfoo's `is-json` + `javascript` assertions enforce that same contract in evals — design the schema once, share it between the agent, the CI gate, and the eval.
- **Two reviewers, two purposes.** Existing = plan-vs-implementation adherence (Claude). New = generic code-quality scoring (OpenRouter, multi-criteria). They are complementary signals; keep all GH identifiers distinct (§4 table).
- **Evals gate the prompt, CI gates the PR.** promptfoo proves the *prompt/agent* reliably catches known flaws across models (offline, fixture-driven). The CI reviewer scores *real* PRs. Same prompt artifact feeds both — promptfoo regression-tests prompt changes before they ship.

## Historical Context (from prior changes)

- `context/changes/ai-card-generation/` (plan.md, plan-brief.md) — introduced the first OpenRouter integration via `fetch`; established `OPENROUTER_MODEL`/`OPENROUTER_API_KEY` env pattern and the zod-parse-don't-500 discipline for LLM output.
- `context/changes/code-review/` (plan.md) — the existing `claude-code-action` reviewer + merge gate this change coexists with.
- `context/changes/testing-auth-critical-flow-e2e/research.md:111,128` — notes OpenRouter is fully awaited (no streaming) in the app; e2e stubs it via `page.route` to avoid LLM cost.
- `context/foundation/lessons.md` — CI lessons that apply: strip quotes piping `-o env` into `$GITHUB_ENV`; `supabase start` port flake is a false negative; push migrations as part of deploy. (Less directly relevant here — no DB/migration in this change — but the `$GITHUB_ENV` and CI-flake lessons matter for the new workflow.)

## Related Research

- `context/changes/ai-card-generation/research*` (OpenRouter wiring precedent).
- `context/changes/testing-auth-critical-flow-e2e/research.md` (how OpenRouter is exercised/stubbed in CI).

## Acceptance Criteria (agreed in conversation, 2026-06-25)

The 5 criteria the CI/CD reviewer agent scores, each **1–10**, **equal weight (20%)**:

1. **Correctness & reliability** — does what it claims; edge/error paths handled; no regressions. Stack-specific: API routes don't 500 the whole flow on LLM/DB/network failure (zod-parse-don't-throw discipline); respects edge-runtime constraints.
2. **Security & data safety** — secrets via `astro:env/server` (never hardcoded); RLS + auth on new routes/tables; zod-validate untrusted input; no injection; new paths added to `PROTECTED_ROUTES`.
3. **Stack idiomaticity & convention compliance** — `cn()` for classes, `@/*` alias, API routes `prerender = false` + uppercase `GET/POST` + zod, Astro for static / React for interactivity, shadcn/ui, logic in `src/lib/services/`. (Absorbs "documentation": explain the *why* of non-obvious decisions.)
4. **Simplicity / complexity** — simplest design that solves the problem; no needless abstraction; long tasks streamed/chunked rather than blocking on edge.
5. **Risk-proportional test coverage** — risky paths exercised; realistic for this repo = Playwright e2e on critical flows, not blanket unit coverage (no unit runner today).

**Decision model = B (average + hard gates):**
- **Overall**: equal-weighted **average ≥ 7/10 → `ai-cr:passed`**, else `ai-cr:failed`.
- **Hard gates (veto)**: **Correctness & reliability** and **Security & data safety** — if *either* scores **< 5/10**, the verdict is `ai-cr:failed` **regardless of the average** (one critical flaw can't be averaged away).
- The other 3 criteria (idiomaticity, complexity, test coverage) feed the average only, no veto.
- Weights stay equal; gating is a separate mechanism from weighting.

> Defaults adopted from the conversation: overall threshold **≥7**, veto floor **<5**. Revisit at plan time if real PR scoring proves these too lax/strict.

## Open Questions

1. ~~5 acceptance criteria~~ — **RESOLVED** (see "Acceptance Criteria" section above).
2. **Agent SDK vs Client SDK** — give the reviewer real tools (read-file, PR metadata) to justify `@openrouter/agent`, or accept a single structured call? Affects package shape and cost.
3. **Model slugs** — `z-ai/glm-5.1` and `deepseek/deepseek-v4-flash` from the seed must be verified against the live OpenRouter catalog (`GET /api/v1/models`); likely need updating to currently-served slugs.
4. **Gate vs. advisory** — does `ai-cr:failed` *block* merge (required status check, like the existing reviewer) or only label + comment (advisory)? Requirements imply labels + comment; whether to add a required `ai-cr/verdict` status is undecided.
5. **Workspace strategy** — add `"workspaces": ["packages/*"]` to root `package.json` (npm workspaces) vs. keep `packages/code-reviewer` fully standalone with its own lockfile. Affects how CI installs/builds it.
6. **Eval pass/judge model** — which neutral third model judges the planted-flaw rubric, and what `threshold` / pass-rate gates the eval job.
7. **Static "review must fail" test** — assert via promptfoo `javascript` on the structured verdict, or a separate vitest? (No vitest in repo today.)
