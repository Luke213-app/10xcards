import { decide, reviewResultSchema } from "../../src/contract.js";

/**
 * Static `javascript` assertion for the planted-flaw eval. It reuses the **same**
 * zod contract the agent and CI gate use (`reviewResultSchema`/`decide` from
 * `src/contract.ts`), so this check can never drift from the shipped shape.
 *
 * Two things are proven, independent of which model produced the output:
 *  1. the output matches the review contract (shape + score ranges), and
 *  2. on this deliberately-broken diff the verdict is `fail` — the gate signal —
 *     and that `fail` is justified (a veto fired, or the average is below the
 *     pass threshold), not an arbitrary label.
 *
 * promptfoo calls the default export with the provider output and grading context;
 * returning a GradingResult lets us attach a human-readable reason to the matrix.
 */
interface GradingResult {
  pass: boolean;
  score: number;
  reason: string;
}

export default function assertContract(output: string): GradingResult {
  let json: unknown;
  try {
    json = JSON.parse(output);
  } catch (cause) {
    return { pass: false, score: 0, reason: `Output is not valid JSON: ${(cause as Error).message}` };
  }

  const parsed = reviewResultSchema.safeParse(json);
  if (!parsed.success) {
    return { pass: false, score: 0, reason: `Output does not match the review contract: ${parsed.error.message}` };
  }

  const result = parsed.data;
  if (result.verdict !== "fail") {
    return {
      pass: false,
      score: 0,
      reason: `Expected verdict "fail" on the planted-flaw diff, got "${result.verdict}" (average ${result.average}).`,
    };
  }

  // Re-derive the decision from the scores to confirm the `fail` is earned, not
  // a mislabeled pass: either a correctness/security veto fired or the average
  // is below the pass threshold.
  const decision = decide(result.scores);
  if (decision.verdict !== "fail") {
    return {
      pass: false,
      score: 0,
      reason: `Verdict "fail" is inconsistent with the scores — decide() recomputes "${decision.verdict}".`,
    };
  }

  const why = decision.vetoes.length > 0 ? `veto: ${decision.vetoes.join("; ")}` : `average ${decision.average} < 7`;
  return { pass: true, score: 1, reason: `Contract valid; verdict "fail" earned (${why}).` };
}
