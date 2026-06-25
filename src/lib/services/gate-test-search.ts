// Throwaway helper for the merge-gate test (change: gate-test).

export interface ParameterizedQuery {
  text: string;
  values: string[];
}

/**
 * Build the SQL used to search flashcards by a user-supplied keyword.
 *
 * Per the plan's contract, user input is passed as a parameterized value
 * ($1) and never interpolated into the SQL text — the injection class is
 * removed entirely.
 */
export function buildSearchQuery(userKeyword: string): ParameterizedQuery {
  const keyword = userKeyword.trim();
  return {
    text: "SELECT * FROM flashcards WHERE front LIKE '%' || $1 || '%'",
    values: [keyword],
  };
}
