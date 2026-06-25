<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Source-Text Stats Helper

- **Plan**: `context/changes/ci-review-demo/plan.md`
- **Scope**: Full plan (CI review on PR #19)
- **Date**: 2026-06-25
- **CI run**: https://github.com/Luke213-app/10xcards/actions/runs/28177202855
- **Verdict**: REJECTED
- **Findings**: 1 critical, 0 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | FAIL |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Test Coverage | PASS |
| Success Criteria | FAIL |

## Findings

### F1 — `isWithinSourceLimit` uses strict `<` instead of inclusive `<=`

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — one-character fix at a single call site
- **Dimension**: Plan Adherence / Success Criteria
- **Location**: `src/lib/text-stats.ts:28`
- **Detail**: The plan's "Limit semantics" section explicitly states the budget is **inclusive** — text exactly `max` characters long must be accepted, and `isWithinSourceLimit("a".repeat(10000))` must return `true`. The JSDoc comment on the function itself repeats this contract: "The limit is inclusive: text exactly `max` characters long is accepted." However, the implementation uses `return sourceCharCount(text) < max` (strict less-than). This means a 10,000-character paste returns `false` and is rejected, making the effective limit 9,999 — one character short of the documented budget. The plan's explicit behavioral assertion in Success Criteria fails.
- **Fix**: Change `< max` to `<= max` on line 28 of `src/lib/text-stats.ts`.
- **Decision**: PENDING

### F2 — JSDoc density diverges from sibling files in `src/lib/`

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — cosmetic; no functional consequence
- **Dimension**: Pattern Consistency
- **Location**: `src/lib/text-stats.ts`
- **Detail**: The two sibling utility files (`src/lib/utils.ts`, `src/lib/config-status.ts`) carry no JSDoc annotations. This file uses multi-line JSDoc blocks on every export. This is a minor stylistic divergence — arguably an improvement over the status quo rather than a regression. The export style (named exports, no default export) is consistent with siblings.
- **Fix**: Accept the richer doc style as a new precedent for `src/lib/`; no code change needed unless the team prefers uniform terse-comment style across the directory.
- **Decision**: PENDING

<!-- End of report -->
