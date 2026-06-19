import type { FlashcardCandidate } from "@/types";
import { llmCandidatesSchema } from "@/lib/schemas/flashcards";

// Framework-agnostic wrapper around the OpenRouter chat-completions API. Takes
// source text plus config, returns validated flashcard candidates. The endpoint
// stays thin: it maps any throw here to a 502.

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = [
  "You extract study flashcards from the user's source text.",
  "Produce up to 10 concise, self-contained question/answer cards that test the",
  "key facts. Each card has a `front` (the question/prompt) and a `back` (the",
  "answer). Keep both under 1000 characters. Do not invent facts absent from the",
  'text. Respond ONLY with JSON of the form {"cards":[{"front":"...","back":"..."}]}.',
].join(" ");

/** Thrown for any failure (network, non-2xx, unparseable output). The generate
 *  endpoint maps this to a 502 without leaking provider internals to the client. */
export class OpenRouterError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "OpenRouterError";
  }
}

interface OpenRouterOpts {
  apiKey: string;
  model: string;
}

export async function generateCandidates(sourceText: string, opts: OpenRouterOpts): Promise<FlashcardCandidate[]> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: sourceText },
        ],
      }),
    });
  } catch (cause) {
    throw new OpenRouterError("Failed to reach the generation provider", { cause });
  }

  if (!response.ok) {
    throw new OpenRouterError(`Generation provider returned ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new OpenRouterError("Generation provider returned a non-JSON response", { cause });
  }

  const content = (payload as { choices?: { message?: { content?: unknown } }[] }).choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new OpenRouterError("Generation provider returned an unexpected response shape");
  }

  const parsed = extractJson(content);
  if (parsed === undefined) {
    throw new OpenRouterError("Could not parse JSON from the model output");
  }

  // Accept either {"cards":[...]} or a bare array; the schema drops bad items.
  const rawCandidates = Array.isArray(parsed) ? parsed : (parsed as { cards?: unknown }).cards;
  return llmCandidatesSchema.parse(rawCandidates);
}

/** Parse a JSON value out of model output, tolerating prose wrappers / code
 *  fences by falling back to the first `{...}` or `[...]` span. */
function extractJson(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to span extraction
  }
  const start = trimmed.search(/[[{]/);
  if (start === -1) return undefined;
  const open = trimmed[start];
  const close = open === "{" ? "}" : "]";
  const end = trimmed.lastIndexOf(close);
  if (end <= start) return undefined;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return undefined;
  }
}
