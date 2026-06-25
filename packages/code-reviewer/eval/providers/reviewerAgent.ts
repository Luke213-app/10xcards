import type { ApiProvider, CallApiContextParams, ProviderOptions, ProviderResponse } from "promptfoo";
import { reviewCode } from "../../src/review.js";

/**
 * promptfoo custom provider that evaluates the **actual** reviewer agent, not a
 * detached copy of the prompt. Each entry in `promptfooconfig.yaml`'s `providers`
 * list points at this file with a different `config.model`, so the matrix runs the
 * same `reviewCode()` (same rubric, same `read_file` tool, same decision model)
 * across the three OpenRouter models.
 *
 * The rendered `prompt` is ignored — the diff/title/description come from the test
 * `vars` so the prompt artifact under test is the one that ships in `prompt.ts`,
 * reached through `reviewCode`. The provider returns the contract JSON as a string
 * for the eval's `is-json` / `javascript` / `llm-rubric` assertions to grade.
 */
export default class ReviewerAgentProvider implements ApiProvider {
  private readonly providerId: string;
  private readonly model: string;

  constructor(options: ProviderOptions) {
    const config = (options.config ?? {}) as { model?: string };
    this.model = config.model ?? "anthropic/claude-sonnet-4.6";
    // Report a model-specific id so the three providers (same file, different
    // model) don't collide into one column in the results matrix.
    this.providerId = `reviewer:${this.model}`;
  }

  id(): string {
    return this.providerId;
  }

  async callApi(_prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const vars = context?.vars ?? {};
    const diff = typeof vars.diff === "string" ? vars.diff : "";
    const title = typeof vars.title === "string" ? vars.title : undefined;
    const description = typeof vars.description === "string" ? vars.description : undefined;

    if (diff === "") {
      return { error: "reviewerAgent provider: no `diff` var supplied to the test case." };
    }

    try {
      const result = await reviewCode({ diff, title, description, model: this.model });
      // Stringify the contract so assertions parse a stable JSON document.
      return { output: JSON.stringify(result) };
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : String(cause) };
    }
  }
}
