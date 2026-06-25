# Automatic AI Code Review on PRs — Plan Brief

> Full plan: `context/changes/code-review/plan.md`

## What & Why

Set up **automatic AI code review on every pull request to `master`**. A new workflow runs the off-the-shelf `anthropics/claude-code-action@v1`, which invokes the `10x-impl-review-ci` skill on the Sonnet model, posts a formal GitHub Review, and blocks merge when the review fails its Definition of Done. Goal: a consistent quality gate before merge, set up safely and step-by-step for a beginner.

## Starting Point

`ci.yml` already runs lint/build/e2e on PRs to `master` (good template to mirror). But `.claude/skills/` is **fully gitignored** ("never push to GitHub"), and the `10x-impl-review-ci` skill **doesn't exist yet** — it ships in 10xDevs lesson **M5L3** and is installed via `npx @przeprogramowani/10x-cli get m5l3`. `gh` is authed as `Luke213-app`.

## Desired End State

A PR to `master` touching code/config auto-triggers an "AI Code Review" run; Claude posts a formal review + an `ai-cr:passed`/`ai-cr:failed` label; a failed review turns the job red and (as a required status check) **blocks merge**. Docs-only PRs skip review (no cost). Only `10x-impl-review-ci` is committed under `.claude/skills/`; all other local skills stay ignored.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Where the skill lives | gitignore exception for `.claude/skills/10x-impl-review-ci/` | Keeps it a real, runner-visible skill while other skills stay local | Plan |
| Skill source | Install via 10x-cli (`get m5l3`) | The `-ci` skill is course-delivered, not hand-written | Plan |
| Output form | Formal GitHub Review | More official than a plain comment, visible in PR Reviews | Plan |
| Blocking | Required status check (job red on `ai-cr:failed`) | Reliable, standard CI gate | Plan |
| Which PRs | Same `paths:` as `ci.yml` (code/config) | No API cost on docs-only PRs | Plan |
| Model | Sonnet (`claude-sonnet-4-6`) | Cheap/fast, enough for diff review | Plan |
| Trigger | `pull_request` `opened, synchronize` → `master` | Re-review on every push to the PR | Pre-set by user |

## Scope

**In scope:** install skill + gitignore exception; `ANTHROPIC_API_KEY` repo secret; `review.yml` workflow (Sonnet, formal review, `ai-cr:*` labels, merge-gate step); sandbox-PR test; branch-protection required check.

**Out of scope:** changing `ci.yml`; committing other skills; the hand-built SDK/Composite-Action reviewer M5L3 also teaches; Opus; reviewing docs-only PRs.

## Architecture / Approach

New `.github/workflows/review.yml` runs alongside `ci.yml`. On a code/config PR it: `actions/checkout` → `claude-code-action@v1` (reads `ANTHROPIC_API_KEY`, `prompt: /10x-impl-review-ci ...`, `--model claude-sonnet-4-6`, scoped `--allowedTools`) → Claude posts a formal review + label → a gate step turns `ai-cr:failed` into a red job. Branch protection makes that job required, blocking merge.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Install skill | Skill committed; only it un-ignored | gitignore negation gotcha (parent dir excluded — must use `.claude/skills/*` + negation) |
| 2. API key secret | `ANTHROPIC_API_KEY` repo secret | Leaking the key into a tracked file |
| 3. Workflow | `review.yml` added & committed | Gate signal must match the skill's real output contract |
| 4. Sandbox PR test | Proven end-to-end, no gate yet | Distinguishing a real fail from infra flake / bad prompt |
| 5. Merge gate | Required status check on `master` | Branch-protection scope; false-positive blocks |

**Prerequisites:** repo-admin rights (secret + branch protection); Anthropic API key from console.anthropic.com; `gh` authed (done); 10x-cli authed (done).
**Estimated effort:** ~1–2 sessions across 5 small phases.

## Open Risks & Assumptions

- The exact review contract (formal review vs labels vs verdict file, and the `/10x-impl-review-ci` args) is confirmed by **reading `SKILL.md` in Phase 1**; the gate in Phase 3 wires to whatever it actually emits.
- The M5L3 install may also touch `CLAUDE.md`/add a rule — staged consciously, not blindly.
- `claude-code-action@v1`'s exit code reflects Claude errors, not the verdict — blocking needs the explicit gate step.
- GitHub App via `/install-github-app` is **optional** for this pattern; the hard requirement is the `ANTHROPIC_API_KEY` secret.

## Success Criteria (Summary)

- A code/config PR to `master` auto-gets a formal Claude review + `ai-cr:*` label.
- A failing review blocks merge; a passing one allows it.
- Docs-only PRs skip the review; only `10x-impl-review-ci` is committed under `.claude/skills/`.
