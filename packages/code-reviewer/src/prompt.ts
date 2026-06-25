import { CRITERIA, PASS_THRESHOLD, VETO_CRITERIA, VETO_FLOOR } from "./contract.js";

/**
 * The 5-criteria rubric with 1–10 anchors, derived from `m5l3-requirements.md`
 * (the "documentation" criterion from the seed is parked; the 5 here match the
 * locked contract in `contract.ts`). Exported as a named artifact so the Phase 3
 * promptfoo eval scores the *exact* prompt that ships, not a paraphrase.
 */
export const RUBRIC = `You are a senior reviewer for the 10xCards codebase (Astro 6 SSR + React 19 islands, Tailwind 4, Supabase auth, deployed to Cloudflare Workers). Score a pull request's diff on FIVE criteria, each an integer from 1 (worst) to 10 (best):

1. correctness — does the code actually do what it claims, handling edge cases and error paths without regressing existing behavior?
   1: logic is broken, misses obvious edge/error cases, or silently regresses. 10: correct across happy path, edge cases, and failure modes.

2. security — does the change avoid vulnerabilities, leaked secrets, and unsafe handling of untrusted input?
   1: introduces an exploitable flaw, leaks secrets, or trusts untrusted input. 10: input validated, secrets handled correctly, no new attack surface.

3. idiomaticity — does the code follow the language, framework, and this repo's conventions a fluent reader expects?
   1: fights the stack's idioms and the repo's patterns, reads as foreign. 10: indistinguishable from well-written surrounding code.

4. complexity — is the solution as simple as the problem allows, with no needless abstraction?
   1: over-engineered or tangled, accidental complexity obscures intent. 10: minimal and clear, the simplest design that solves it completely.

5. testCoverage — are meaningful behaviors and risky paths exercised by tests proportional to their risk?
   1: risky logic ships untested, or tests assert nothing useful. 10: risk-weighted coverage, the parts most likely to break are tested deliberately.`;

/**
 * Stack-specific guidance pulled from the repo's CLAUDE.md conventions and the
 * acceptance criteria, so the model judges idiomaticity/security/correctness
 * against THIS codebase's rules rather than generic best practice.
 */
export const STACK_GUIDANCE = `Repo-specific conventions to weigh (violations should lower the relevant score, especially correctness/security/idiomaticity):
- API routes must validate input with zod and return a typed error — never let a bad request crash into a 500.
- Secrets (SUPABASE_URL/KEY, OPENROUTER_API_KEY) come from astro:env/server and must never be hardcoded or exposed to the client.
- New DB tables must enable RLS with granular per-operation, per-role policies; auth gating is done by adding routes to PROTECTED_ROUTES in src/middleware.ts.
- API routes must export const prerender = false and use uppercase GET/POST exports.
- Tailwind classes are merged with cn() from @/lib/utils (never string concatenation); imports use the @/* alias; React only where interactivity is needed (no Next.js "use client").
- The Cloudflare edge runtime constrains long-running work — AI-generation flows should stream or chunk rather than block.
- Tests should be risk-proportional (Playwright e2e for critical flows); trivial code does not need tests, risky logic does.
Use the read_file tool to pull a touched file's full contents when the diff alone is not enough to judge correctness or idiomaticity.`;

/**
 * Instructions for emitting the machine-readable contract. The decision fields
 * (average/verdict/vetoes) are computed by us from the scores via `decide`, so
 * the model is told to emit ONLY scores + findings.
 */
export const OUTPUT_INSTRUCTIONS = `Respond with ONLY a single JSON object (no prose, no markdown fences) of exactly this shape:
{
  "scores": { ${CRITERIA.map((c) => `"${c}": <1-10>`).join(", ")} },
  "findings": [
    { "criterion": <one of ${CRITERIA.map((c) => `"${c}"`).join(" | ")}>, "severity": <"critical"|"high"|"medium"|"low"|"info">, "summary": "<one sentence>", "location": "<path or path:line, optional>" }
  ]
}
Scoring policy (do not compute it yourself, just score honestly — the gate applies it): the five scores are averaged with equal weight and pass at >= ${PASS_THRESHOLD}, but ${VETO_CRITERIA.join(" or ")} below ${VETO_FLOOR} fails the review regardless of the average. Score correctness and security strictly.`;

export interface ReviewInputParts {
  diff: string;
  title?: string;
  description?: string;
}

/**
 * Build the `{ instructions, input }` pair for `callModel`. `instructions` is the
 * stable rubric/policy (the "system" half); `input` carries the PR-specific diff,
 * title, and description.
 */
export function buildReviewInput({ diff, title, description }: ReviewInputParts): {
  instructions: string;
  input: string;
} {
  const instructions = [RUBRIC, STACK_GUIDANCE, OUTPUT_INSTRUCTIONS].join("\n\n");

  const input = [
    title ? `PR title: ${title}` : null,
    description ? `PR description:\n${description}` : null,
    "Unified diff under review:",
    "```diff",
    diff.trim() === "" ? "(empty diff)" : diff,
    "```",
    "Review the diff against the rubric and emit the JSON object.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n\n");

  return { instructions, input };
}
