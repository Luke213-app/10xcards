import { callModel, maxCost, OpenRouter, stepCountIs } from "@openrouter/agent";
import { decide, modelOutputSchema, type Finding, type ReviewResult } from "./contract.js";
import { buildReviewInput, type ReviewInputParts } from "./prompt.js";
import { readFileTool } from "./tools/readFile.js";

/** Default model when neither the caller nor OPENROUTER_MODEL provides one. */
export const DEFAULT_MODEL = "anthropic/claude-sonnet-4.6";

/** Bound the agent loop so a misbehaving model cannot walk the tree or run up cost. */
export const MAX_STEPS = 12;
export const MAX_COST_USD = 0.5;

export interface ReviewOptions extends ReviewInputParts {
  /** Model slug; defaults to OPENROUTER_MODEL then {@link DEFAULT_MODEL}. */
  model?: string;
  /** Overrides process.env.OPENROUTER_API_KEY (used by the eval provider/tests). */
  apiKey?: string;
}

/**
 * Turn raw model text into a validated {@link ReviewResult}. Factored out so the
 * defensive-parse path is unit-testable without a network call.
 *
 * The model is asked for `{ scores, findings }`; we derive `average`/`verdict`/
 * `vetoes` ourselves via {@link decide} so the gate logic is never delegated to
 * the model. Any parse/shape failure becomes a hard `fail` (never a crash), so
 * CI degrades safely on a malformed response.
 */
export function buildResultFromText(text: string): ReviewResult {
  const json = extractJson(text);
  if (json === undefined) {
    return failResult("The reviewer model returned no parseable JSON object.");
  }

  const parsed = modelOutputSchema.safeParse(json);
  if (!parsed.success) {
    return failResult(`The reviewer model output did not match the contract: ${parsed.error.message}`);
  }

  const { scores, findings } = parsed.data;
  const { average, verdict, vetoes } = decide(scores);
  return { scores, average, verdict, findings, vetoes };
}

/**
 * Run the reviewer end-to-end: client + sandboxed read_file tool + rubric prompt
 * + bounded stop conditions, then validate and apply the decision model. Returns
 * a contract-shaped result for CI/the eval to consume.
 */
export async function reviewCode(opts: ReviewOptions): Promise<ReviewResult> {
  const apiKey = opts.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set (pass apiKey or set the env var).");
  }
  const model = opts.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;

  const client = new OpenRouter({ apiKey });
  const { instructions, input } = buildReviewInput(opts);

  const result = callModel(client, {
    model,
    instructions,
    input,
    temperature: 0,
    tools: [readFileTool] as const,
    stopWhen: [stepCountIs(MAX_STEPS), maxCost(MAX_COST_USD)],
    allowFinalResponse: true,
  });

  let text: string;
  try {
    text = await result.getText();
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return failResult(`The reviewer model call failed: ${reason}`);
  }

  return buildResultFromText(text);
}

/** A safe `fail` verdict with an explanatory finding; correctness/security pinned
 *  to the veto floor so the decision model also records the failure. */
function failResult(summary: string): ReviewResult {
  const scores = { correctness: 1, security: 1, idiomaticity: 1, complexity: 1, testCoverage: 1 } as const;
  const finding: Finding = { criterion: "correctness", severity: "critical", summary };
  const { average, verdict, vetoes } = decide(scores);
  return { scores, average, verdict, findings: [finding], vetoes };
}

/** Parse a JSON object out of model text, tolerating prose/code-fence wrappers.
 *  Tool-using models often emit a reasoning preamble that itself contains braces
 *  (e.g. `decide({ correctness: 5 })`), so a naive "first `{` to last `}`" slice
 *  grabs invalid text. We instead try each `{` start in order against the last
 *  `}` and return the first span that parses — the real JSON object wins, the
 *  prose braces before it do not. */
function extractJson(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to span extraction
  }
  const end = trimmed.lastIndexOf("}");
  if (end === -1) return undefined;
  for (let start = trimmed.indexOf("{"); start !== -1 && start < end; start = trimmed.indexOf("{", start + 1)) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      // try the next `{` start
    }
  }
  return undefined;
}
