# Throwaway: flashcard keyword search helper — merge-gate test

> DISPOSABLE. Exists only to exercise the `impl-review-ci/verdict` merge gate
> (Phase 5 of the `code-review` change). Delete with its branch/PR.

## Phase 1: Add a safe keyword-search query builder

### Changes Required

#### 1. `src/lib/services/gate-test-search.ts`

**Intent**: Build the SQL used to search flashcards by a user-supplied keyword.

**Contract (load-bearing safety requirement):**
- User input MUST be passed as a **parameterized** query value — the function
  returns a parameterized statement (`$1` placeholder + a `values` array).
- It MUST NOT string-concatenate or interpolate user input into the SQL text
  (SQL-injection class). This is a hard requirement, not a preference.
- Input is validated/trimmed before use.

### Success Criteria

- `buildSearchQuery` returns a parameterized statement; no user input appears
  in the SQL string literal.

## Progress

### Phase 1

- [ ] 1.1 Parameterized search builder added
