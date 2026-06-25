# AI Code Reviewer (OpenRouter Agent SDK + promptfoo) Implementation Plan

## Overview

Build a **new, independent AI code-review system** in `packages/code-reviewer/`, built on the **OpenRouter Agent SDK** (`@openrouter/agent`, beta, ESM-only). It runs as a standalone Node script in CI on every PR to `master`, reads the diff + PR title + PR description, gives the model a `read_file` tool for extra context, scores the change on **5 criteria (1–10)**, applies **decision model B** (equal-weighted average ≥7 → pass, with correctness & security each a hard `<5` veto), and emits a stable JSON contract. CI turns that JSON into a PR comment, `ai-cr:passed`/`ai-cr:failed` labels, and a committed `reviews/ai-cr.md` report. A **promptfoo** eval harness regression-tests the same review prompt across three OpenRouter models against a planted-flaw React 16→19 migration diff, with a neutral LLM judge and a static "the review must fail" assertion.

This is the **second** reviewer in the repo, complementary to the existing `claude-code-action` / `10x-impl-review-ci` plan-vs-implementation reviewer. All GitHub identifiers stay distinct (workflow file, name, concurrency group, labels, comment marker, report path, status — no shared state).

## Current State Analysis

- **`packages/code-reviewer/` is empty** (only a stray `.DS_Store`). Greenfield package.
- Root `package.json` is `"type": "module"`, **has no `workspaces`** field, name `10x-astro-starter`. Scripts cover dev/build/lint/format and Playwright e2e only — **no unit-test runner** (no vitest/jest).
- Node pinned to **22.14.0** (`.nvmrc`); CI uses node 22.
- The repo **already declares** `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` as server secrets (`astro.config.mjs:17-24`) and has a `fetch`-based OpenRouter service (`src/lib/services/openrouter.ts`) using `response_format: { type: "json_object" }` — a good shape to mirror, but the reviewer runs **outside Astro** and reads `process.env.OPENROUTER_API_KEY` directly.
- An **existing reviewer** lives in `.github/workflows/review.yml` ("AI Code Review", `claude-code-action` → `/10x-impl-review-ci`) with a merge gate via the `impl-review-ci/verdict` commit status and an `impl-review-override` bypass label. The new reviewer must not collide with any of its identifiers.
- `.github/workflows/ci.yml` runs lint+build (`ci` job) + local-Supabase Playwright (`e2e` job).

### Key Discoveries:

- **Agent SDK current API** (verified live against `OpenRouterTeam/typescript-agent` README): `const client = new OpenRouter({ apiKey })` from `@openrouter/sdk`; `callModel(client, { model, input, instructions, tools: [...] as const, stopWhen })`; `tool({ name, description, inputSchema, outputSchema, execute })`; stop conditions `stepCountIs(n)`, `maxCost($)`, `maxTokensUsed(n)`, `hasToolCall(name)`; results via `await result.getText()` and `await result.getResponse()` (which exposes `.usage` incl. `cost`). Tools support `requireApproval` (bool or predicate) — use it to sandbox `read_file`.
- **Verified model slugs** (live OpenRouter catalog): `z-ai/glm-5.2` ✓, `anthropic/claude-sonnet-4.6` ✓, `qwen/qwen3-max` (no "3.7 max" is served — `qwen3-max` is the current top Qwen-max). Neutral judge: `openai/gpt-5.2` (not in the matrix, avoids self-grading bias).
- **Decision model B locked** (research, agreed in conversation): 5 criteria × equal 20% weight, average ≥7 passes; correctness & security each veto with `<5` regardless of average.
- **promptfoo** supports the whole eval contract natively: `openrouter:<slug>` providers, `file://` diff fixtures, `llm-rubric` (with `threshold`) for planted-flaw detection, `is-json` + `javascript` static assertions for the must-fail check, exit code `100` = test failed (CI gate signal).
- `tsconfig.json` root `include: ["**/*"]` would otherwise type-check the new package under Astro's strict config — the package needs **its own isolated `tsconfig.json`** and the root must **exclude `packages/**`**.

## Desired End State

A reviewer that, on any PR to `master`, posts a clear comment + colored pass/fail label + committed `reviews/ai-cr.md`, scoring 5 criteria with the B decision model — **advisory only** (does not block merge). A `packages/code-reviewer/` workspace package that can be run locally on a diff, and a `promptfoo` eval (`npm run eval` in the package) that proves the prompt catches all 3 planted flaws across the 3 models and that the verdict is `fail`. Verify by: opening a test PR and seeing the comment/labels/report appear; running the eval locally and seeing the matrix + a green pass-rate.

## What We're NOT Doing

- **Not** making `ai-cr:failed` block merge (no required status check). Advisory only — labels + comment + report.
- **Not** touching or sharing any identifier with the existing `review.yml` reviewer (no shared labels, marker, concurrency group, or status context).
- **Not** adding a unit-test runner (vitest/jest) to the repo. The "review must fail" check lives in promptfoo, not a new test framework.
- **Not** routing the reviewer through `astro:env/server` or the Workers runtime — it is a standalone Node ESM CI script.
- **Not** scoring business alignment or architectural fit (parked in the seed — need broader context).
- **Not** building a separate lockfile / standalone install — the package joins the repo via npm workspaces.

## Implementation Approach

Four phases, each independently verifiable. Phase 1 lays the package + the shared JSON contract everything depends on. Phase 2 builds the runnable agent (with its one `read_file` tool and the B decision logic). Phase 3 proves the prompt offline with promptfoo. Phase 4 ships it into CI as a composite action + advisory workflow that posts comment/labels/report. The JSON output schema is designed **once** in Phase 1 and shared by the agent (Phase 2), the eval assertions (Phase 3), and the CI gate (Phase 4).

## Critical Implementation Details

- **`read_file` tool must be sandboxed.** It reads repo files for extra context, so it must resolve paths against the repo root and reject anything escaping it (path traversal / absolute paths / symlinks). Use the tool's `requireApproval` predicate or an in-`execute` guard that rejects resolved paths outside `process.cwd()`. Bound the agent loop with `stopWhen: [stepCountIs(…), maxCost(…)]` so a misbehaving model can't read the whole tree or run up cost.
- **Bot commit must not retrigger the workflow.** Phase 4 commits `reviews/ai-cr.md` to the PR branch; the commit message must include `[skip ci]` and the workflow's own push must not re-enter the review (guard on actor / `[skip ci]`), mirroring the existing reviewer's loop-avoidance.
- **`$GITHUB_ENV` quoting + CI flake lessons apply** (see `context/foundation/lessons.md`): if any step pipes `KEY="value"` into `$GITHUB_ENV`, strip the quotes; treat first-run infra flakes as false negatives, not regressions.
- **Structured output is the contract.** The agent must return parseable JSON matching the Phase-1 schema. Set `temperature: 0`; instruct the model to emit only the JSON object; parse defensively (zod) and never crash CI on a malformed model response — fall back to a `fail`-with-reason verdict.

## Phase 1: Workspace Scaffold + Output Contract

### Overview

Create the `packages/code-reviewer/` package, wire it into the repo via npm workspaces with an isolated tsconfig, and define the shared review-result JSON schema + the B decision-model function that every later phase consumes.

### Changes Required:

#### 1. npm workspaces wiring

**File**: `package.json` (root)

**Intent**: Make the new package installable/buildable with the repo's single `npm install`, without disturbing the Astro app.

**Contract**: Add `"workspaces": ["packages/*"]`. No change to existing scripts.

#### 2. Isolate the package from Astro's type-check

**File**: `tsconfig.json` (root)

**Intent**: Stop the root's `**/*` include from type-checking package files under Astro's strict config.

**Contract**: Add `"exclude": ["packages/**"]` (preserving any existing excludes).

#### 3. Package manifest + isolated tsconfig

**File**: `packages/code-reviewer/package.json`, `packages/code-reviewer/tsconfig.json`

**Intent**: Stand up an ESM package targeting Node 22 with its own scripts and a **pinned** beta Agent SDK.

**Contract**: `package.json` — `"type": "module"`, name e.g. `@10xcards/code-reviewer`, `private: true`, scripts `review` (run the reviewer on a diff), `eval` (run promptfoo). Dependencies: `@openrouter/agent` and `@openrouter/sdk` **pinned to exact versions** (beta), `zod` (align with repo `^4`). Dev: `promptfoo`, `tsx` (or `node --experimental-strip-types`) to run TS directly, `typescript`. `tsconfig.json` — standalone (does not extend Astro's), `module`/`moduleResolution` for NodeNext ESM, strict, `include` the package `src`.

#### 4. Shared result schema + decision model

**File**: `packages/code-reviewer/src/contract.ts`

**Intent**: Define the single source of truth for the review JSON shape and the pass/fail logic, reused by the agent, the eval assertions, and the CI gate.

**Contract**: A zod schema for the result object and exported TypeScript type. Shape:
`{ scores: { correctness, security, idiomaticity, complexity, testCoverage }, average, verdict: "pass" | "fail", findings: Array<{ criterion, severity, summary, location? }>, vetoes: string[] }`.
Plus a pure `decide(scores)` function implementing **model B**: `average = mean(all 5)`; `verdict = "fail"` if `correctness < 5` or `security < 5` (record which in `vetoes`), else `"pass"` if `average >= 7`, else `"fail"`. Each score constrained to integer 1–10.

### Success Criteria:

#### Automated Verification:

- Install resolves the workspace: `npm install` (root) creates `node_modules/@10xcards/code-reviewer` symlink
- Package type-checks in isolation: `npm run -w @10xcards/code-reviewer typecheck` (or `tsc --noEmit` in package)
- Root app still type-checks/builds: `npm run build`
- Lint passes repo-wide: `npm run lint`
- `decide()` returns `fail` when correctness or security `< 5` even if average `≥ 7` (exercised via a tiny script or the Phase 3 eval assertion)

#### Manual Verification:

- The result schema fields map 1:1 to the 5 agreed criteria and the B decision model
- No collision: package name/paths don't overlap the existing reviewer's identifiers

**Implementation Note**: After automated verification passes, pause for human confirmation before Phase 2.

---

## Phase 2: The Reviewer Agent

### Overview

Build the runnable reviewer: an Agent SDK call with a sandboxed `read_file` tool, a prompt that scores the 5 criteria, bounded cost/steps, and a defensively-parsed JSON result obeying the Phase-1 contract. Runnable locally against a diff file.

### Changes Required:

#### 1. The `read_file` tool

**File**: `packages/code-reviewer/src/tools/readFile.ts`

**Intent**: Give the model the ability to pull full file contents beyond the diff for idiomaticity/correctness context — the single tool that justifies the Agent SDK.

**Contract**: `tool({ name: "read_file", description, inputSchema: z.object({ path: z.string() }), outputSchema: z.object({ content: z.string() }), execute })`. `execute` resolves `path` against the repo root and **rejects** any resolved path outside it (return an error result, do not throw). Cap returned content size.

#### 2. Review prompt + criteria rubric

**File**: `packages/code-reviewer/src/prompt.ts`

**Intent**: Encode the 5-criteria rubric (the 1–10 anchors from `m5l3-requirements.md`) and the stack-specific guidance from the acceptance criteria (zod-parse-don't-500, secrets via `astro:env/server`, RLS/auth/`PROTECTED_ROUTES`, `cn()`/`@/*`/`prerender=false` idioms, edge-runtime streaming, risk-proportional Playwright coverage). Instruct the model to emit **only** the JSON object matching the contract.

**Contract**: Exported prompt builder `buildReviewInput({ diff, title, description })` → the `input`/`instructions` strings. The rubric text is a named export so Phase 3 reuses the exact same prompt artifact.

#### 3. The reviewer entrypoint

**File**: `packages/code-reviewer/src/review.ts` (+ a thin CLI in `src/cli.ts`)

**Intent**: Wire client + tool + prompt + stop conditions into one `reviewCode({ diff, title, description, model })` that returns a validated result object; the CLI reads a diff from a file/arg and prints the JSON for CI to consume.

**Contract**: `new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })`; `callModel(client, { model, instructions, input, tools: [readFile] as const, temperature: 0, stopWhen: [stepCountIs(N), maxCost(M)] })`; `await result.getText()` → zod-parse against the contract → run `decide()` to set `verdict`/`average`/`vetoes`. On parse failure, return a `fail` verdict with an explanatory finding (never crash). Default model from `OPENROUTER_MODEL` env, overridable. CLI flags: `--diff <file>`, `--title`, `--description`, `--model`, `--json`.

### Success Criteria:

#### Automated Verification:

- Package type-checks: `npm run -w @10xcards/code-reviewer typecheck`
- Lint passes: `npm run lint`
- CLI runs end-to-end on a sample diff and prints valid contract JSON: `npm run -w @10xcards/code-reviewer review -- --diff fixtures/sample.diff` (requires `OPENROUTER_API_KEY`)
- `read_file` rejects a path outside the repo root (unit-style assertion or eval assertion)
- Malformed model output yields a `fail` verdict, not a crash (forced via a stub/sample)

#### Manual Verification:

- On a known-bad diff the reviewer flags the real issues and the scores/verdict look sane
- Cost per review is bounded and acceptable (check `getResponse().usage.cost`)
- The model reaches for `read_file` when the diff lacks context (observed in tool stream/logs)

**Implementation Note**: After automated verification passes, pause for human confirmation before Phase 3.

---

## Phase 3: Eval Harness (promptfoo)

### Overview

Prove the review prompt offline: a planted-flaw React 16→19 migration diff with 3 impactful flaws, run across the 3 chosen models, judged by a neutral 4th model that must confirm all 3 flaws are caught, plus a static assertion that the verdict is `fail`.

### Changes Required:

#### 1. Planted-flaw fixture

**File**: `packages/code-reviewer/eval/fixtures/react-migration.diff`, `.../planted-flaws.md`

**Intent**: A realistic, non-trivial React 16→19 migration diff containing exactly **3 impactful, distinct flaws** (e.g. a removed-in-19 API still used, an unsafe lifecycle/`ReactDOM.render` → `createRoot` migration bug, and a correctness/effect-deps or key regression). `planted-flaws.md` enumerates them for the judge rubric.

**Contract**: Raw unified-diff text loadable via `file://`. The 3 flaws are individually identifiable so the judge can check each.

#### 2. promptfoo config

**File**: `packages/code-reviewer/eval/promptfooconfig.yaml`

**Intent**: Define the model matrix, the shared review prompt, the LLM-judge rubric, and the static must-fail assertions.

**Contract**: `# yaml-language-server: $schema=…` header. `providers`: `openrouter:z-ai/glm-5.2`, `openrouter:qwen/qwen3-max`, `openrouter:anthropic/claude-sonnet-4.6` (each `config: { temperature: 0 }`). `prompts`: the **same** rubric/prompt artifact from Phase 2 (via a custom provider — see #3 — so the real agent is evaluated, or a `file://` prompt that imports the rubric). `defaultTest.options.provider: openrouter:openai/gpt-5.2` (neutral judge). One test with `vars: { diff: file://fixtures/react-migration.diff, planted_flaws: file://fixtures/planted-flaws.md }`. Assertions: `llm-rubric` (`threshold` high, e.g. 1.0 / "must identify ALL 3") + `is-json` (validates the contract shape) + `javascript` (parse output, assert `verdict === "fail"`; optionally assert a veto/low correctness).

#### 3. Custom provider (eval the real agent)

**File**: `packages/code-reviewer/eval/providers/reviewerAgent.ts`

**Intent**: Make promptfoo call the **actual** `reviewCode()` (not a detached prompt) so the eval tests what ships.

**Contract**: Export a provider class with `id()` + `callApi(prompt, context)` that pulls `context.vars.diff`, calls `reviewCode({ diff, model: <provider model> })`, and returns `{ output: <JSON string>, tokenUsage, cost }`. Run from package root so imports resolve.

#### 4. Eval script

**File**: `packages/code-reviewer/package.json` (script)

**Intent**: One command to run the matrix.

**Contract**: `"eval": "promptfoo eval -c eval/promptfooconfig.yaml"`. Document that `OPENROUTER_API_KEY` must be set.

### Success Criteria:

#### Automated Verification:

- Config validates: `npx promptfoo validate -c eval/promptfooconfig.yaml`
- Eval runs and the matrix completes for all 3 models: `npm run -w @10xcards/code-reviewer eval` (requires `OPENROUTER_API_KEY`)
- The static `javascript` assertion confirms `verdict === "fail"` on the flawed diff
- The `is-json` assertion confirms every model's output matches the contract

#### Manual Verification:

- The judge confirms all 3 planted flaws are caught by the stronger model(s); the matrix shows a sensible per-model spread
- The 3 flaws are genuinely impactful and distinct (not trivially detectable)
- Pass-rate / `threshold` setting reflects the "all 3" strictness you chose

**Implementation Note**: After automated verification passes, pause for human confirmation before Phase 4.

---

## Phase 4: CI/CD (Composite Action + Advisory Workflow)

### Overview

Ship the reviewer into CI: a composite action wraps the review step (keeps the workflow thin); the workflow triggers on PRs to `master`, gathers diff+title+description, runs the reviewer, posts a comment, applies `ai-cr:passed`/`ai-cr:failed` labels, commits `reviews/ai-cr.md`, and re-runs on the `ai-cr:review` label. **Advisory only** — no required status check. All identifiers distinct from `review.yml`.

### Changes Required:

#### 1. Composite action

**File**: `.github/actions/ai-cr/action.yml`

**Intent**: Encapsulate "install package → build diff input → run reviewer → produce JSON + report" so the workflow stays readable.

**Contract**: `runs: using: composite`. Inputs: `openrouter-api-key`, `pr-title`, `pr-description`, `base-sha`/`head-sha` (or a prepared diff path), `model`. Steps: setup node 22, `npm ci`, compute the diff, invoke the package CLI, expose outputs (`verdict`, `average`, `report-path`). No secrets hardcoded.

#### 2. Advisory review workflow

**File**: `.github/workflows/ai-cr.yml`

**Intent**: Orchestrate the review on PRs without colliding with the existing reviewer.

**Contract**: Name `AI Quality Review`. Trigger `pull_request` to `master` (`opened`, `synchronize`, `reopened`) **and** `labeled` (for the `ai-cr:review` retry). Concurrency `ai-cr-${{ github.event.pull_request.number }}`. Fork guard (`head.repo.full_name == github.repository`). Permissions: `contents: write` (commit report), `pull-requests: write` (comment + labels). Job: when `labeled`, run only if label == `ai-cr:review`. Call the composite action; then post/update a PR comment (marker `<!-- ai-cr:marker -->`); apply `ai-cr:passed` (green) or `ai-cr:failed` (red) and remove the opposite; write + commit `reviews/ai-cr.md` with `[skip ci]` in the message; guard against re-triggering on the bot's own push. Secret: `OPENROUTER_API_KEY` (new repo secret).

#### 3. Labels + report marker

**File**: `.github/workflows/ai-cr.yml` (inline) / repo labels

**Intent**: Stable, distinct surfaces for the verdict.

**Contract**: Ensure-exists `ai-cr:passed` (green), `ai-cr:failed` (red), `ai-cr:review` (retry trigger). Comment carries `<!-- ai-cr:marker -->` so re-runs update in place. Report committed to `reviews/ai-cr.md` (top-level, distinct from `context/changes/**/reviews/impl-review.md`).

### Success Criteria:

#### Automated Verification:

- Workflow + action YAML are valid: `actionlint` (or `npx action-validator`) on the new files
- `npm ci` resolves the workspace in CI (job log shows the package installed)
- On a test PR the job completes and emits a verdict output (job log)

#### Manual Verification:

- Open a test PR → a single `<!-- ai-cr:marker -->` comment appears with 5 scores, average, verdict, findings
- The correct colored label (`ai-cr:passed`/`ai-cr:failed`) is applied; the opposite is removed
- `reviews/ai-cr.md` is committed to the PR branch and the commit does **not** retrigger the workflow (`[skip ci]` honored)
- Adding `ai-cr:review` re-runs the review and updates the comment/labels in place
- Merge is **not** blocked by a failing review (advisory confirmed); the existing `review.yml` reviewer still works unaffected
- New `OPENROUTER_API_KEY` repo secret is set

**Implementation Note**: After automated verification passes, pause for final human confirmation.

---

## Testing Strategy

### Unit-ish / contract tests:

- `decide()` veto logic (correctness/security `<5` overrides a `≥7` average) — asserted via a small script or the eval's `javascript` assertion.
- `read_file` path-sandbox rejection of out-of-repo paths.
- Defensive JSON parse → `fail` verdict on malformed model output.

### Eval (promptfoo) — the primary automated proof:

- Planted-flaw React 16→19 diff across 3 models; neutral judge requires all 3 flaws; static assertions on contract shape + `verdict === "fail"`.

### Manual Testing Steps:

1. Run `npm run -w @10xcards/code-reviewer review -- --diff <known-bad>.diff` and sanity-check scores/findings.
2. Run `npm run -w @10xcards/code-reviewer eval` and read the matrix.
3. Open a throwaway PR to `master`; confirm comment + label + committed report; confirm no `[skip ci]` loop; confirm merge isn't blocked.
4. Add `ai-cr:review` to re-trigger; confirm in-place update.

## Performance Considerations

- Bound cost/latency with `temperature: 0` + `stopWhen: [stepCountIs, maxCost]` and a cap on diff size and `read_file` content length. Including the PR description raises token cost (flagged in the seed) — acceptable here since this repo's diffs are small; revisit if diffs grow.

## Migration Notes

- New repo secret `OPENROUTER_API_KEY` must be added (the existing reviewer uses `ANTHROPIC_API_KEY`). Three new labels must exist. No DB/schema migration is involved.

## References

- Research: `context/changes/code-review-2/research.md`
- Requirement seeds: `.claude/prompts/m5l3-{requirements,promptfoo,cicd}.md`
- Existing OpenRouter pattern: `src/lib/services/openrouter.ts:32-68`; env schema `astro.config.mjs:17-24`
- Existing reviewer (coexistence): `.github/workflows/review.yml`
- Agent SDK API: `OpenRouterTeam/typescript-agent` `packages/agent/README.md`
- CI lessons: `context/foundation/lessons.md` (`$GITHUB_ENV` quoting, supabase port flake)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Workspace Scaffold + Output Contract

#### Automated

- [x] 1.1 `npm install` resolves the `@10xcards/code-reviewer` workspace symlink
- [x] 1.2 Package type-checks in isolation
- [x] 1.3 Root app still builds (`npm run build`)
- [x] 1.4 Repo-wide lint passes (`npm run lint`)
- [x] 1.5 `decide()` returns `fail` on correctness/security `<5` even with average `≥7`

#### Manual

- [x] 1.6 Schema fields map 1:1 to the 5 criteria + B decision model
- [x] 1.7 No identifier collision with the existing reviewer

### Phase 2: The Reviewer Agent

#### Automated

- [ ] 2.1 Package type-checks
- [ ] 2.2 Repo-wide lint passes
- [ ] 2.3 CLI prints valid contract JSON on a sample diff
- [ ] 2.4 `read_file` rejects out-of-repo paths
- [ ] 2.5 Malformed model output yields a `fail` verdict, not a crash

#### Manual

- [ ] 2.6 Reviewer flags real issues with sane scores/verdict on a known-bad diff
- [ ] 2.7 Per-review cost is bounded and acceptable
- [ ] 2.8 Model uses `read_file` when diff lacks context

### Phase 3: Eval Harness (promptfoo)

#### Automated

- [ ] 3.1 `promptfoo validate` passes on the config
- [ ] 3.2 Eval matrix completes for all 3 models
- [ ] 3.3 Static `javascript` assertion confirms `verdict === "fail"`
- [ ] 3.4 `is-json` assertion confirms contract shape for every model

#### Manual

- [ ] 3.5 Judge confirms all 3 planted flaws caught (strong model); sensible per-model spread
- [ ] 3.6 The 3 flaws are impactful and distinct
- [ ] 3.7 `threshold`/pass-rate reflects the "all 3" strictness

### Phase 4: CI/CD (Composite Action + Advisory Workflow)

#### Automated

- [ ] 4.1 Workflow + action YAML valid (`actionlint`)
- [ ] 4.2 `npm ci` resolves the workspace in CI
- [ ] 4.3 Job completes and emits a verdict output on a test PR

#### Manual

- [ ] 4.4 PR comment (single `<!-- ai-cr:marker -->`) shows 5 scores, average, verdict, findings
- [ ] 4.5 Correct colored label applied, opposite removed
- [ ] 4.6 `reviews/ai-cr.md` committed without retriggering the workflow (`[skip ci]`)
- [ ] 4.7 `ai-cr:review` label re-runs and updates in place
- [ ] 4.8 Merge not blocked (advisory); existing `review.yml` unaffected; `OPENROUTER_API_KEY` secret set
