import { z } from "zod";

/**
 * The single source of truth for the AI code-review result.
 *
 * This contract is shared by three consumers:
 *  - the agent (Phase 2) emits and validates against it,
 *  - the promptfoo eval assertions (Phase 3) check model output against it,
 *  - the CI gate (Phase 4) reads `verdict` to apply labels / build the report.
 *
 * Keep the shape stable: changing field names breaks all three at once.
 */

/** The 5 equally-weighted acceptance criteria, each scored 1–10. */
export const CRITERIA = ["correctness", "security", "idiomaticity", "complexity", "testCoverage"] as const;

export type Criterion = (typeof CRITERIA)[number];

/** Average at or above this passes (when no veto fires). */
export const PASS_THRESHOLD = 7;

/** Correctness or security strictly below this vetoes to `fail` regardless of average. */
export const VETO_FLOOR = 5;

/** The two criteria that carry a hard veto (decision model B). */
export const VETO_CRITERIA = ["correctness", "security"] as const satisfies readonly Criterion[];

/** A single integer score in the inclusive 1–10 range. */
const scoreSchema = z.number().int().min(1).max(10);

/** The 5 raw criterion scores the model must produce. */
export const scoresSchema = z.object({
  correctness: scoreSchema,
  security: scoreSchema,
  idiomaticity: scoreSchema,
  complexity: scoreSchema,
  testCoverage: scoreSchema,
});

export type Scores = z.infer<typeof scoresSchema>;

export const severitySchema = z.enum(["critical", "high", "medium", "low", "info"]);

export type Severity = z.infer<typeof severitySchema>;

export const findingSchema = z.object({
  criterion: z.enum(CRITERIA),
  severity: severitySchema,
  summary: z.string().min(1),
  /** Optional `path` or `path:line` pointer into the diff/repo. */
  location: z.string().optional(),
});

export type Finding = z.infer<typeof findingSchema>;

/**
 * The full review result. `average`, `verdict`, and `vetoes` are derived from
 * `scores` by {@link decide} — they are part of the contract so consumers never
 * have to recompute the decision, but the model should not be trusted to compute
 * them itself (the agent overwrites them via `decide` before returning).
 */
export const reviewResultSchema = z.object({
  scores: scoresSchema,
  average: z.number(),
  verdict: z.enum(["pass", "fail"]),
  findings: z.array(findingSchema),
  vetoes: z.array(z.string()),
});

export type ReviewResult = z.infer<typeof reviewResultSchema>;

/** What the model is asked to emit (the derived decision fields are filled in by us). */
export const modelOutputSchema = z.object({
  scores: scoresSchema,
  findings: z.array(findingSchema),
});

export type ModelOutput = z.infer<typeof modelOutputSchema>;

export interface Decision {
  average: number;
  verdict: "pass" | "fail";
  vetoes: string[];
}

/**
 * Decision model B (locked in research): equal-weighted average of all 5 scores.
 *
 *  - `average = mean(all 5)` (rounded to 2 dp for display; comparison uses the exact mean).
 *  - Hard veto: if correctness OR security is `< VETO_FLOOR`, verdict is `fail`
 *    regardless of the average (recorded in `vetoes`).
 *  - Otherwise `pass` when `average >= PASS_THRESHOLD`, else `fail`.
 *
 * Pure function — no I/O, deterministic, the unit of truth both the agent and the
 * eval assertions exercise.
 */
export function decide(scores: Scores): Decision {
  const values = CRITERIA.map((c) => scores[c]);
  const exactMean = values.reduce((sum, n) => sum + n, 0) / values.length;
  const average = Math.round(exactMean * 100) / 100;

  const vetoes = VETO_CRITERIA.filter((c) => scores[c] < VETO_FLOOR).map(
    (c) => `${c} < ${VETO_FLOOR} (scored ${scores[c]})`,
  );

  const verdict: "pass" | "fail" = vetoes.length > 0 ? "fail" : exactMean >= PASS_THRESHOLD ? "pass" : "fail";

  return { average, verdict, vetoes };
}
