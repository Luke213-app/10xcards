# AI Code Reviewer (OpenRouter Agent SDK + promptfoo) — Plan Brief

> Full plan: `context/changes/code-review-2/plan.md`
> Research: `context/changes/code-review-2/research.md`

## What & Why

Build a **second, independent AI code reviewer** in `packages/code-reviewer/`, on the OpenRouter Agent SDK. On every PR to `master` it scores the change on 5 criteria (1–10), gives a pass/fail verdict, and posts a comment + colored label + committed report. It complements (does not replace) the existing plan-vs-implementation reviewer — this one judges generic code quality. A promptfoo eval harness proves the review prompt reliably catches known flaws across multiple models before any prompt change ships.

## Starting Point

`packages/code-reviewer/` is empty. The repo already declares `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` and has a `fetch`-based OpenRouter service to mirror, but the reviewer runs as a standalone Node CI script (not inside Astro). An existing reviewer (`review.yml`, with a merge gate) is already live — the new one must keep every GitHub identifier distinct. No `workspaces` field and no unit-test runner exist yet.

## Desired End State

Opening a PR to `master` produces an `AI Quality Review` comment (5 scores, average, verdict, findings), a green `ai-cr:passed` or red `ai-cr:failed` label, and a committed `reviews/ai-cr.md`. The review is **advisory** — it does not block merge. Running `npm run -w @10xcards/code-reviewer eval` shows a 3-model matrix proving the prompt catches all 3 planted flaws and returns a `fail` verdict on the flawed diff.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Acceptance criteria | 5 criteria, 20% each | Correctness, security, idiomaticity, complexity, test coverage | Research |
| Decision model | B: avg ≥7 pass; correctness/security `<5` veto | One critical flaw can't be averaged away | Research |
| Reviewer "smartness" | Agent SDK + sandboxed `read_file` tool | Tool gives real context and justifies the Agent SDK choice | Plan |
| Merge gate | Advisory (comment + labels, no required check) | Matches the requirements; a beta reviewer proves itself first | Plan |
| Package wiring | npm workspaces, isolated tsconfig | One `npm install`, standard monorepo, no blast radius on Astro | Plan |
| Must-fail check | promptfoo `javascript` + `is-json` | No new test runner; same JSON contract CI uses | Plan |
| Model matrix | `z-ai/glm-5.2`, `qwen/qwen3-max`, `anthropic/claude-sonnet-4.6` | User pick; slugs verified live (no "qwen 3.7 max" served) | Plan |
| Eval judge / strictness | Neutral `openai/gpt-5.2`; must catch all 3 flaws | Avoids self-grading bias; flaws are "impactful" so bar is high | Plan |
| Reviewer input | diff + PR title + description | Intent helps score "does it do what it claims" | Plan |
| Result output | PR comment + labels **+ committed `reviews/ai-cr.md`** | Persistent history of reviews in the repo | Plan |

## Scope

**In scope:** new workspace package; Agent SDK reviewer with `read_file` tool + B decision model; shared JSON contract; promptfoo eval (fixture + matrix + judge + must-fail); composite action + advisory CI workflow (comment, labels, committed report, `ai-cr:review` retry); new `OPENROUTER_API_KEY` secret + 3 labels.

**Out of scope:** blocking merge gate; sharing any identifier with `review.yml`; a unit-test runner; routing through `astro:env/server`/Workers; business-alignment & architectural-fit criteria; a standalone lockfile.

## Architecture / Approach

Standalone Node ESM package in `packages/code-reviewer/`. The agent (`callModel` + one sandboxed `read_file` tool, bounded by `stopWhen`) returns a JSON result validated against a shared zod contract; a pure `decide()` applies decision model B. The **same** prompt artifact feeds both the live reviewer and the promptfoo eval. CI wraps the run in a composite action; an advisory workflow posts comment/labels and commits the report with `[skip ci]`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Scaffold + contract | Workspace package, isolated tsconfig, shared JSON schema + `decide()` | Root tsconfig type-checking package files |
| 2. Reviewer agent | Runnable `reviewCode()` + CLI + `read_file` tool | Beta SDK API drift; path-traversal in the tool |
| 3. Eval (promptfoo) | Planted-flaw fixture, 3-model matrix, judge, must-fail | Flaws too easy/hard; judge bias |
| 4. CI/CD | Composite action + advisory workflow, comment/labels/report | Bot-commit `[skip ci]` loop; collision with existing reviewer |

**Prerequisites:** `OPENROUTER_API_KEY` available locally and as a repo secret; install the official OpenRouter agent skill for live SDK knowledge; pin the beta SDK version.
**Estimated effort:** ~3–4 sessions across 4 phases.

## Open Risks & Assumptions

- **Beta SDK** (`@openrouter/agent`) may have breaking changes — pin the version; verify the API against the installed package at implementation time.
- `qwen/qwen3-max` is the intended Qwen model (confirmed) — substitutes for the informally-named "Qwen 3.7 max", which is not a served slug.
- Default thresholds (avg ≥7, veto `<5`) are unproven on real PRs — revisit after first real scoring.
- Committing the report risks a CI loop if `[skip ci]` / actor guard is wrong — verify on a throwaway PR.

## Success Criteria (Summary)

- A PR to `master` gets a clear advisory review (comment + label + committed report) without blocking merge, and without disturbing the existing reviewer.
- The eval proves the prompt catches all 3 planted flaws across the 3 models and returns `verdict: "fail"` on the flawed diff.
- `decide()` correctly vetoes on low correctness/security regardless of average.
