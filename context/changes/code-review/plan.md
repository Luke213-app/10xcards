# Automatic AI Code Review on PRs — Implementation Plan

## Overview

Set up an **automatic AI code review** that runs on every pull request to `master`. A new GitHub Actions workflow (`.github/workflows/review.yml`) invokes the off-the-shelf `anthropics/claude-code-action@v1`, which runs the **`10x-impl-review-ci`** skill (installed from 10xDevs lesson **M5L3**) on the Sonnet model. Claude reads the PR diff, posts a **formal GitHub Review**, and the workflow **blocks merge** when the review fails its Definition of Done (signalled by the `ai-cr:failed` label) via a **required status check**.

This plan is written for a beginner ("builder, not engineer"). Every step that **installs**, **commits**, or **touches GitHub settings** is gated behind an explicit confirmation, and is its own phase so nothing happens all at once.

## Current State Analysis

- **CI already exists.** `.github/workflows/ci.yml` runs `lint + build` (job `ci`) and `e2e` on `pull_request` to `master`, filtered to code/config paths (`src/**`, `e2e/**`, `supabase/**`, configs). It uses repo secrets `SUPABASE_URL` / `SUPABASE_KEY`. The new review workflow lives **beside** it as a separate file — it does not modify `ci.yml`.
- **`.claude/skills/` is fully gitignored** (`.gitignore:` `# local-only agent skills — never push to GitHub` → `.claude/skills/`). The recent commit `5eaf8f1` stopped tracking the directory. **The CI runner can only see a skill that is committed to git** — so the gitignore must carve out an exception for `10x-impl-review-ci`.
- **The skill does not exist yet** locally or globally. It is delivered by 10x-cli lesson **M5L3** ("Code Review w erze AI: standardy, DoD i Agent w pipeline"). Install: `npx @przeprogramowani/10x-cli get m5l3`. The lesson standardizes a merge gate using `ai-cr:passed` / `ai-cr:failed` labels.
- **`10x-impl-review` (no `-ci`) is interactive** — it runs triage rounds and asks the human questions. That variant cannot run headless in CI; the `-ci` variant is the non-interactive one we install.
- **Tooling is ready.** `gh` is authenticated as `Luke213-app`; remote is `https://github.com/Luke213-app/10xcards.git`. 10x-cli is on disk (`npx @przeprogramowani/10x-cli`, v1.9.0) and authenticated.
- **Relevant prior lessons** (`context/foundation/lessons.md`): the `$GITHUB_ENV` quoting rule (strip quotes when piping `KEY="value"` into `$GITHUB_ENV`) applies to any env wiring this workflow adds.

## Desired End State

When this plan is complete:

- Opening (or pushing to) a PR to `master` that touches code/config automatically triggers a **"AI Code Review"** workflow run.
- Claude reviews the diff and posts a **formal GitHub Review** on the PR, plus an `ai-cr:passed` or `ai-cr:failed` label.
- If the review **fails** its Definition of Done, the review job is **red** and — because it is a **required status check** on `master` — the PR **cannot be merged** until addressed.
- Docs-only PRs (markdown, `context/**`) **skip** the review entirely (no API cost).
- The only committed skill under `.claude/skills/` is `10x-impl-review-ci`; all other local skills stay ignored.

**Verification:** a throwaway PR with a trivial `src/**` change shows the review running, a review comment appearing, the correct label applied, and (after Phase 5) the merge button blocked when the check is red.

### Key Discoveries

- `.github/workflows/ci.yml:8-20` — the exact `paths:` filter to mirror for "same paths as CI".
- `.gitignore` — `.claude/skills/` ignores the whole directory; **git cannot re-include a subdirectory of an excluded directory** (gitignore rule). The parent pattern must become `.claude/skills/*` before a negation works.
- `claude-code-action@v1` reads `anthropic_api_key`, a `prompt`, and `claude_args` (`--model`, `--allowedTools`); required `permissions:` are `contents: read`, `pull-requests: write`, `id-token: write` (add `issues: write` for label writes). The action checks out the PR branch and Claude posts via `gh pr ...` / inline-comment tools.
- 10x-cli install ref for the skill: **`m5l3`**.

## What We're NOT Doing

- **Not** modifying or replacing the existing `ci.yml` (lint/build/e2e) — review is additive.
- **Not** committing any other local skill — only `10x-impl-review-ci` gets a gitignore exception.
- **Not** building the hand-rolled SDK/Composite-Action reviewer that M5L3 also teaches — we use the off-the-shelf `claude-code-action@v1` path, per decision.
- **Not** enabling branch protection until the review has been proven on a throwaway PR (Phase 5 is last on purpose).
- **Not** running review on docs-only PRs.
- **Not** hardcoding the API key anywhere — it lives only as the `ANTHROPIC_API_KEY` repo secret.
- **Not** using Opus (Sonnet chosen for cost/speed).

## Implementation Approach

Five small, independently-verifiable phases, each pausing for confirmation before any install/commit/settings change:

1. Install the skill and make **only it** committable (gitignore exception).
2. Provision the `ANTHROPIC_API_KEY` repo secret.
3. Add the `review.yml` workflow.
4. Prove it on a throwaway PR — **no merge gate yet**.
5. Turn on the merge gate (required status check) once the review is trusted.

## Critical Implementation Details

- **gitignore negation gotcha (load-bearing).** Git "cannot re-include a file if a parent directory of that file is excluded." The current `.claude/skills/` line excludes the whole directory, so a bare `!.claude/skills/10x-impl-review-ci/` will silently do nothing. The parent must first be changed to ignore *contents* (`.claude/skills/*`), then the one subdirectory re-included. Required shape:
  ```gitignore
  # local-only agent skills — never push to GitHub, EXCEPT the committed CI review skill
  .claude/skills/*
  !.claude/skills/10x-impl-review-ci/
  ```
  Verify with `git check-ignore -v .claude/skills/10x-impl-review-ci/SKILL.md` (should print nothing / be un-ignored) **and** `git check-ignore .claude/skills/zen` (should still be ignored).
- **The merge gate is a separate step, not the action's exit code.** `claude-code-action`'s exit code reflects whether Claude *errored*, not the review verdict. Blocking must come from an explicit gate: read the PR's labels after the review step and `exit 1` when `ai-cr:failed` is present. Wire the gate against the **actual contract the installed M5L3 skill emits** (labels and/or a verdict file) — confirm it in Phase 3 by reading `.claude/skills/10x-impl-review-ci/SKILL.md` rather than assuming.
- **`$GITHUB_ENV` quoting** (`context/foundation/lessons.md`): if any step pipes `KEY="value"` output into `$GITHUB_ENV`, strip the wrapping quotes. The review workflow should avoid that pattern; prefer reading values via `gh ... --json` + `jq` in-step.
- **GitHub App is optional for this pattern.** Auto-review on `pull_request` works with the default `GITHUB_TOKEN` + the `permissions:` block + the `ANTHROPIC_API_KEY` secret. `/install-github-app` is only needed for the interactive `@claude` mention trigger; it is a convenient way to set the secret but not a hard requirement here. Phase 2 treats the secret as the requirement and `/install-github-app` as an optional path.

---

## Phase 1: Install the `10x-impl-review-ci` skill and make it committable

### Overview

Fetch the skill from lesson M5L3, carve the gitignore exception so only this skill is tracked, and commit it. After this phase the CI runner will be able to see the skill once the workflow checks out the repo.

### Changes Required

#### 1. Install the skill via 10x-cli

**Intent**: Bring `10x-impl-review-ci/` into `.claude/skills/` from the course registry. This is a local mutation — confirm before running.

**Contract**: `npx @przeprogramowani/10x-cli get m5l3`. After it runs, inspect `git status` and the printed change report: the install may also touch `CLAUDE.md` (10x-cli manifest block) or add a `CLAUDE-m5l3` rule. Decide consciously what to stage; the skill directory is the only must-have for this plan.

#### 2. gitignore exception

**File**: `.gitignore`

**Intent**: Allow exactly `10x-impl-review-ci` to be committed while every other skill under `.claude/skills/` stays ignored.

**Contract**: Replace the single `.claude/skills/` line with the `.claude/skills/*` + `!.claude/skills/10x-impl-review-ci/` pair shown in Critical Implementation Details. Confirm with `git check-ignore -v` on both the included skill and a still-ignored sibling (e.g. `zen`).

#### 3. Commit the skill

**Intent**: Land the skill (and the gitignore change) on a feature branch so it reaches GitHub. Confirm before committing.

**Contract**: Stage only the intended paths (`.gitignore`, `.claude/skills/10x-impl-review-ci/**`, and any deliberately-accepted `CLAUDE.md`/rule change). Work on a branch (not directly on `master`). Commit message describes the skill install. Do **not** push/open a PR yet unless desired — Phase 4 owns the test PR.

### Success Criteria

#### Automated Verification

- Skill present: `test -f .claude/skills/10x-impl-review-ci/SKILL.md`
- Skill is tracked (not ignored): `git check-ignore .claude/skills/10x-impl-review-ci/SKILL.md` prints nothing (exit 1)
- A sibling skill is still ignored: `git check-ignore .claude/skills/zen` prints the path (exit 0)
- Working tree staged as intended: `git status --porcelain` shows only the deliberately-staged paths

#### Manual Verification

- The 10x-cli change report was reviewed; any `CLAUDE.md`/rule edits were a conscious accept (not blindly committed)
- The committed skill contains no secrets / API keys
- Read `SKILL.md` to learn its review contract: how it reports (formal review? `ai-cr:*` labels? verdict file?) and what args it expects — this informs Phases 3 and 5

**Implementation Note**: After automated checks pass, pause for human confirmation that the skill install + gitignore exception look right before moving to Phase 2.

---

## Phase 2: Provision the `ANTHROPIC_API_KEY` repo secret

### Overview

Make the Anthropic API key available to GitHub Actions as a repository secret. This is a GitHub-settings change — confirm before acting, and never paste the key into a file.

### Changes Required

#### 1. Create the `ANTHROPIC_API_KEY` repository secret

**Intent**: Give the workflow credentials to call the Anthropic API, stored only in GitHub's encrypted secrets — never committed.

**Contract**: Repo secret named exactly `ANTHROPIC_API_KEY`, value from console.anthropic.com. Two acceptable routes (user chooses):
- **Manual (recommended, minimal):** GitHub → repo **Settings → Secrets and variables → Actions → New repository secret**. Or `gh secret set ANTHROPIC_API_KEY` (the CLI prompts for the value so it never lands in shell history files — confirm before running).
- **Via `/install-github-app`:** also wires the secret and installs the Claude GitHub App (needed only for future `@claude` mention usage). Requires repo-admin rights.

The key requirement is the secret; the GitHub App is optional for the auto-review-on-PR pattern.

### Success Criteria

#### Automated Verification

- Secret exists: `gh secret list` includes `ANTHROPIC_API_KEY`

#### Manual Verification

- The key was taken from console.anthropic.com and entered only into GitHub's secret UI / `gh secret set` prompt — never into a tracked file
- No key value appears in shell history, the repo, or any commit

**Implementation Note**: Pause for confirmation that the secret is set before adding the workflow that depends on it.

---

## Phase 3: Add the review workflow (`.github/workflows/review.yml`)

### Overview

Add a new workflow that runs the skill via `claude-code-action@v1` on the same paths as CI, on the Sonnet model, posting a formal GitHub Review and applying the `ai-cr:*` label. Include the merge-gate step but keep it informative until Phase 5 enables branch protection (the job can be red without blocking anything until the check is marked required).

### Changes Required

#### 1. New workflow file

**File**: `.github/workflows/review.yml`

**Intent**: Define the automatic review job. Start from any `review.yml` template the M5L3 skill shipped under its `references/` (adapt it) rather than writing from scratch; reconcile it with the decisions below.

**Contract**: A workflow with:
- **Trigger**: `pull_request:` `types: [opened, synchronize]`, `branches: [master]`, with the **same `paths:` filter as `ci.yml:10-20`** (`src/**`, `e2e/**`, `supabase/**`, `astro.config.mjs`, `tsconfig.json`, `eslint.config.js`, `playwright.config.ts`, `package.json`, `package-lock.json`) — plus `.github/workflows/review.yml` so the workflow can review changes to itself.
- **`permissions:`** `contents: read`, `pull-requests: write`, `issues: write`, `id-token: write`.
- **Steps**: `actions/checkout@v4` (with `fetch-depth` adequate for diffing the PR), then `anthropics/claude-code-action@v1` with:
  - `anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}`
  - `prompt:` passing `REPO: ${{ github.repository }}` + `PR NUMBER: ${{ github.event.pull_request.number }}` and invoking the skill: `/10x-impl-review-ci` (with whatever args its `SKILL.md` documents — confirmed in Phase 1). Instruct it to post a **formal GitHub Review** and apply the `ai-cr:passed`/`ai-cr:failed` label per the skill's DoD.
  - `claude_args:` `--model claude-sonnet-4-6` and an `--allowedTools` allowlist scoped to review actions: reading the diff (`Bash(gh pr diff:*)`, `Bash(gh pr view:*)`, `Read`, `Grep`, `Glob`), posting (`Bash(gh pr comment:*)`, `Bash(gh pr review:*)`), and labeling (`Bash(gh pr edit:*)` or `Bash(gh label:*)`), plus `mcp__github_inline_comment__create_inline_comment` if inline notes are wanted. Match the allowlist to what the skill actually calls.

  If the skill's own template already encodes the prompt/tools, prefer it and only override `--model` and the `paths:` filter.

#### 2. Merge-gate step (wired, not yet enforced)

**Intent**: Turn the review verdict into a pass/fail job result, so Phase 5 can mark it a required check. Until Phase 5, a red job is visible but does not block merge.

**Contract**: A final step that determines the verdict from the skill's real output (confirmed in Phase 1): read the PR labels (`gh pr view "$PR" --json labels`) and `exit 1` when `ai-cr:failed` is present (or read the skill's verdict file if that is its contract). Avoid piping `KEY="value"` into `$GITHUB_ENV` (lessons.md). If the M5L3 skill/template already fails the job on its DoD, use that instead of a hand-rolled gate.

#### 3. Commit the workflow

**Intent**: Land `review.yml` on the feature branch. Confirm before committing.

**Contract**: Stage and commit only `.github/workflows/review.yml` (and Phase 1's skill if not yet committed). Branch, not `master`.

### Success Criteria

#### Automated Verification

- Workflow file exists and parses: `test -f .github/workflows/review.yml` and a YAML lint / `actionlint` (if available) passes
- Trigger paths match CI: the `paths:` list mirrors `.github/workflows/ci.yml`
- No secret literals in the file: `grep -RniE 'sk-ant|ANTHROPIC_API_KEY:\s*\S*sk' .github/workflows/review.yml` finds nothing (only `${{ secrets.ANTHROPIC_API_KEY }}`)

#### Manual Verification

- The `prompt:` invokes `/10x-impl-review-ci` with the args its `SKILL.md` documents
- `--model claude-sonnet-4-6` is set; `--allowedTools` matches the skill's actual tool calls
- The gate step's pass/fail signal matches the skill's real output contract (label or verdict file)

**Implementation Note**: Pause for confirmation. The next phase actually exercises this against GitHub — do not enable any branch protection yet.

---

## Phase 4: Prove it on a throwaway PR (no merge gate yet)

### Overview

Run the whole thing end-to-end on a disposable PR before it can block real work. Watch the workflow, read the review, fix anything, and only then move to enforcement.

### Changes Required

#### 1. Open a sandbox PR

**Intent**: Trigger the review on a real-but-trivial change that matches the path filter, so we observe the full flow without risk.

**Contract**: A throwaway branch off `master` (e.g. `chore/test-ai-review`) carrying the Phase 1 + Phase 3 commits **plus** a trivial `src/**` change (e.g. a comment) so the `paths:` filter fires. Open a PR to `master` via `gh pr create`. This PR is disposable — close/delete it after.

#### 2. Observe and iterate

**Intent**: Confirm the review behaves, and tune the prompt/allowlist/model if needed.

**Contract**: Watch the run (`gh run watch` / `gh run view --log`). Confirm: the "AI Code Review" workflow triggered, the action authenticated (secret works), Claude posted a formal review + correct label, and the gate step computed pass/fail. Iterate on `review.yml` (new commits) until green-path and fail-path both behave (force a `fail` by introducing an obvious problem on a second test commit, then revert). Recall the `supabase start` CI-flake lesson: a red job from infra noise is a false negative — check the log before treating a failure as real.

### Success Criteria

#### Automated Verification

- The workflow ran on the PR: `gh run list --workflow=review.yml` shows a run for the test branch
- The run reached the action step (not failing on missing secret/permissions): `gh run view <id> --log` shows the action executing

#### Manual Verification

- A formal GitHub Review from Claude appears on the test PR
- The correct label (`ai-cr:passed` / `ai-cr:failed`) is applied
- A deliberately-bad change produces `ai-cr:failed` + a red job; a clean change produces `ai-cr:passed` + green
- Review quality is reasonable (Sonnet output is useful, not noisy) — adjust prompt if not
- The throwaway PR/branch is closed and deleted after verification

**Implementation Note**: Only proceed to Phase 5 once both pass-path and fail-path are confirmed on the sandbox PR.

---

## Phase 5: Turn on the merge gate (required status check)

### Overview

Make the review job a **required status check** on `master` so a failed review blocks merge. This is a GitHub-settings change — confirm before acting, and do it last.

### Changes Required

#### 1. Enable branch protection requiring the review check

**Intent**: Block merging a PR whose AI review job is red. This realizes the "block on critical findings" decision.

**Contract**: On `master`, require status checks to pass before merging, and select the review job (the check name GitHub shows for `review.yml`, observed in Phase 4) as **required**. Route: GitHub → **Settings → Branches → Add branch ruleset / protection rule** for `master`, or `gh api` on the branch-protection endpoint (confirm before running). Optionally also require the existing `ci` checks while here (separate decision — flag it, don't silently expand scope). Because direct pushes to `master` skip PR checks (noted in `ci.yml`), consider also requiring PRs.

### Success Criteria

#### Automated Verification

- Protection is set: `gh api repos/Luke213-app/10xcards/branches/master/protection` (or the rulesets endpoint) shows the review check required

#### Manual Verification

- On a fresh PR with a failing review, the merge button is blocked until resolved
- On a PR with a passing review, merge is allowed
- The block comes from the intended review check (not an unrelated one)

**Implementation Note**: This is the final phase. After it, the feature is live on `master`.

---

## Testing Strategy

### Manual Testing Steps

1. **Phase 1:** `git check-ignore -v .claude/skills/10x-impl-review-ci/SKILL.md` (un-ignored) and `git check-ignore .claude/skills/zen` (still ignored).
2. **Phase 2:** `gh secret list` shows `ANTHROPIC_API_KEY`.
3. **Phase 4 (core test):** open the throwaway PR; confirm the review runs, posts a formal review + label, and the gate computes pass/fail. Force a failing review on one commit, a passing one on another.
4. **Phase 5:** confirm a red review blocks merge and a green one allows it.

### Edge Cases To Verify

- Docs-only PR (markdown / `context/**`) does **not** trigger the review (path filter).
- A second push to an open PR (`synchronize`) re-runs the review on the new diff.
- Missing/invalid secret fails clearly at the action step (seen if the secret is wrong) — distinguishes auth failure from a real review fail.
- Infra flake vs real fail: a red job from runner/infra noise is a false negative — read the log before trusting it (`lessons.md`).

## Performance / Cost Considerations

- Sonnet keeps per-PR cost and latency low. Cost scales with PR frequency × diff size; `opened + synchronize` means every push to an open PR is a billable run — the path filter (code/config only) is the main cost control.
- If cost becomes a concern later, options (out of scope now): switch trigger to `opened` only, or gate behind an `ai-review` label.

## Migration / Rollback Notes

- **Rollback is easy and isolated:** delete `.github/workflows/review.yml` (stops all reviews) and/or remove the required-check from branch protection (stops blocking). Neither touches `ci.yml` or app code.
- The gitignore exception and committed skill can stay or be reverted independently.

## References

- Existing CI pattern: `.github/workflows/ci.yml`
- Recurring rules: `context/foundation/lessons.md` (`$GITHUB_ENV` quoting; `supabase start` CI flake / false-negative trap)
- Action docs: `anthropics/claude-code-action@v1` — `docs/solutions.md` (Automatic PR Code Review), `docs/custom-automations.md` (`claude_args`)
- Skill source: 10xDevs lesson **M5L3**, installed via `npx @przeprogramowani/10x-cli get m5l3`
- Change identity: `context/changes/code-review/change.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Install the `10x-impl-review-ci` skill and make it committable

#### Automated

- [x] 1.1 Skill present: `test -f .claude/skills/10x-impl-review-ci/SKILL.md` — db46f7a
- [x] 1.2 Skill is tracked (not ignored): `git check-ignore` prints nothing — db46f7a
- [x] 1.3 Sibling skill still ignored: `git check-ignore .claude/skills/zen` prints the path — db46f7a
- [x] 1.4 Working tree staged only as intended: `git status --porcelain` — db46f7a

#### Manual

- [x] 1.5 10x-cli change report reviewed; any CLAUDE.md/rule edits a conscious accept — db46f7a
- [x] 1.6 Committed skill contains no secrets / API keys — db46f7a
- [x] 1.7 `SKILL.md` read; review contract (formal review / `ai-cr:*` labels / verdict file / args) understood — db46f7a

### Phase 2: Provision the `ANTHROPIC_API_KEY` repo secret

#### Automated

- [x] 2.1 Secret exists: `gh secret list` includes `ANTHROPIC_API_KEY` — e2772f9

#### Manual

- [x] 2.2 Key from console.anthropic.com entered only into GitHub secret UI / `gh secret set` prompt — e2772f9
- [x] 2.3 No key value in shell history, repo, or any commit — e2772f9

### Phase 3: Add the review workflow (`.github/workflows/review.yml`)

#### Automated

- [x] 3.1 Workflow exists and parses (YAML lint / `actionlint` if available) — 5edb508
- [x] 3.2 Trigger `paths:` mirror `.github/workflows/ci.yml` — 5edb508
- [x] 3.3 No secret literals in the file (only `${{ secrets.ANTHROPIC_API_KEY }}`) — 5edb508

#### Manual

- [x] 3.4 `prompt:` invokes `/10x-impl-review-ci` with documented args — 5edb508
- [x] 3.5 `--model claude-sonnet-4-6` set; `--allowedTools` matches skill's tool calls — 5edb508
- [x] 3.6 Gate step pass/fail signal matches skill's real output contract — 5edb508

### Phase 4: Prove it on a throwaway PR (no merge gate yet)

#### Automated

- [x] 4.1 Workflow ran on the test PR: `gh run list --workflow=review.yml` — c094091
- [x] 4.2 Run reached the action step: `gh run view <id> --log` — c094091

#### Manual

- [x] 4.3 Formal GitHub Review from Claude appears on the test PR — c094091
- [x] 4.4 Correct `ai-cr:passed` / `ai-cr:failed` label applied — c094091 (satisfied via the `impl-review-ci/verdict` commit-status = APPROVED; the label contract was superseded by the verdict-status design in Phase 3)
- [x] 4.5 Bad change → `ai-cr:failed` + red job; clean change → `ai-cr:passed` + green — both paths proven in Phase 5 on throwaway PR #18: SQL-injection commit → REJECTED → red `impl-review-ci/verdict` (run 28172696240); parameterized fix → APPROVED → green (run 28173085148). (Verdict-status contract, not `ai-cr:*` labels.) — 210f83a
- [x] 4.6 Review quality reasonable on Sonnet (prompt tuned if needed) — c094091
- [x] 4.7 Throwaway PR/branch closed and deleted — PRs #13 & #15 closed, branches deleted

### Phase 5: Turn on the merge gate (required status check)

#### Automated

- [x] 5.1 Branch protection shows the review check required (`gh api .../branches/master/protection`) — 210f83a

#### Manual

- [x] 5.2 Failing review blocks the merge button — PR #18 REJECTED verdict → `mergeStateStatus: BLOCKED` (run 28172696240) — 210f83a
- [x] 5.3 Passing review allows merge — PR #18 after parameterized fix → APPROVED → `mergeStateStatus: CLEAN`, mergeable (run 28173085148) — 210f83a
- [x] 5.4 Block originates from the intended review check — the only status on the blocked head was `impl-review-ci/verdict=failure` — 210f83a
