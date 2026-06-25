/**
 * Source-text statistics for the AI flashcard generation flow.
 *
 * The generate endpoint accepts pasted source text up to a fixed character
 * budget. These helpers normalize the input and enforce that budget so the
 * UI and the API agree on a single definition of "how long is this text".
 */

/** Maximum number of source characters accepted by the generation flow. */
export const MAX_SOURCE_CHARS = 10_000;

/** Trim leading/trailing whitespace so surrounding blank space never counts. */
export function normalizeSource(text: string): string {
  return text.trim();
}

/** Character count of the normalized source text. */
export function sourceCharCount(text: string): number {
  return normalizeSource(text).length;
}

/**
 * Whether the source text fits within the budget.
 *
 * The limit is inclusive: text exactly `max` characters long is accepted.
 */
export function isWithinSourceLimit(text: string, max: number = MAX_SOURCE_CHARS): boolean {
  return sourceCharCount(text) < max;
}
