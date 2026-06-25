<!-- ai-cr:marker -->
# AI Quality Review

**Verdict:** ✅ PASS &nbsp;·&nbsp; **Average:** 8.20 / 10

## Scores

| Criterion | Score |
| --- | --- |
| Correctness | 8/10 |
| Security | 8/10 |
| Idiomaticity | 9/10 |
| Complexity | 8/10 |
| Test coverage | 8/10 |

## Findings

- **[medium] correctness** — In the 'Apply verdict labels' workflow step, `gh pr edit --remove-label $REMOVE` will fail on first run when the opposite label (ai-cr:passed or ai-cr:failed) is not yet on the PR, potentially breaking the step without a `|| true` guard. (`.github/workflows/ai-cr.yml`)
- **[low] correctness** — `extractJson` uses `lastIndexOf('}')` as the end anchor, which can produce invalid slices when the model output contains a trailing `}` inside a string value or comment after the real JSON object ends. (`packages/code-reviewer/src/review.ts`)
- **[low] security** — PR title and description are interpolated directly into shell arguments (`--title "$PR_TITLE"`) in the composite action; a PR body containing `"` or `$()` could cause unexpected shell behavior despite quoting. (`.github/actions/ai-cr/action.yml`)
- **[low] correctness** — The `checks.ts` sandbox test uses a hardcoded non-existent root `/repo/root`, so the symlink-resolution branch of `resolveInRepo` is never exercised (the `realpathSync` always throws and is silently skipped). (`packages/code-reviewer/scripts/checks.ts`)
- **[low] testCoverage** — The first-run label-removal failure path in the workflow (removing a label that doesn't exist yet) is not covered by any test or smoke-test checklist item. (`.github/workflows/ai-cr.yml`)
- **[info] idiomaticity** — The `format-report.mjs` duplicates the CRITERIA list and SEVERITY_ORDER that are already defined in `contract.ts`; importing from the contract (even in a .mjs) would keep them in sync. (`.github/actions/ai-cr/format-report.mjs`)

---
_Advisory only — this review does not block merge. Model: `anthropic/claude-sonnet-4.6`. · [Run details](https://github.com/Luke213-app/10xcards/actions/runs/28202380050)_
