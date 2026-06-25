// Throwaway helper for the merge-gate test (change: gate-test).
// NOTE: intentionally violates the plan's parameterization contract so the
// AI review returns REJECTED. Do not ship.

/**
 * Build the SQL used to search flashcards by a user-supplied keyword.
 */
export function buildSearchQuery(userKeyword: string): string {
  // Plan Phase 1 mandated a PARAMETERIZED query and forbade interpolating
  // user input into the SQL text. This concatenates the raw keyword straight
  // into the statement — a textbook SQL-injection vulnerability.
  return `SELECT * FROM flashcards WHERE front LIKE '%${userKeyword}%'`;
}
