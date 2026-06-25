<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Throwaway — flashcard keyword search helper (merge-gate test)

- **Plan**: `context/changes/gate-test/plan.md`
- **Scope**: Full plan (CI review on PR #18)
- **Date**: 2026-06-25
- **CI run**: https://github.com/Luke213-app/10xcards/actions/runs/28172696240
- **Verdict**: REJECTED
- **Findings**: 1 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | FAIL |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Test Coverage | PASS |
| Success Criteria | FAIL |

## Findings

### F1 — SQL injection via direct user-input interpolation

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is an obvious one-function rewrite, safe to batch with F2 and F3
- **Dimension**: Safety & Quality
- **Location**: `src/lib/services/gate-test-search.ts:12`
- **Detail**: The plan's Phase 1 contract explicitly states: "User input MUST be passed as a parameterized query value — the function returns a parameterized statement (`$1` placeholder + a `values` array)" and "It MUST NOT string-concatenate or interpolate user input into the SQL text (SQL-injection class). This is a hard requirement, not a preference." The actual implementation uses a template literal to inject `userKeyword` directly into the SQL string: `` `SELECT * FROM flashcards WHERE front LIKE '%${userKeyword}%'` ``. Any value such as `' OR '1'='1` escapes the `LIKE` context and can manipulate the query.
- **Fix**: Return `{ sql: "SELECT * FROM flashcards WHERE front LIKE $1", values: [\`%${keyword.trim()}%\`] }` instead of a raw string, matching the plan's parameterized-statement contract.
- **Decision**: PENDING

### F2 — Return type is `string` instead of parameterized statement object

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; resolved by the same change as F1
- **Dimension**: Plan Adherence
- **Location**: `src/lib/services/gate-test-search.ts:8`
- **Detail**: The plan specifies the function "returns a parameterized statement (`$1` placeholder + a `values` array)". The actual return type is `string`. Any caller passing the result directly to a DB client would not receive the safety guarantees the plan intended, and the TypeScript type gives no signal that this is unsafe.
- **Fix**: Change the return type to `{ sql: string; values: string[] }` — this is resolved automatically when fixing F1.
- **Decision**: PENDING

### F3 — Missing input validation and trimming

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; one-liner addition alongside the F1 fix
- **Dimension**: Plan Adherence
- **Location**: `src/lib/services/gate-test-search.ts:8`
- **Detail**: The plan states "Input is validated/trimmed before use." No `trim()` call or any other validation is applied to `userKeyword` in the implementation.
- **Fix**: Add `const keyword = userKeyword.trim()` before constructing the parameterized query, using `keyword` in the values array.
- **Decision**: PENDING

<!-- End of report -->
