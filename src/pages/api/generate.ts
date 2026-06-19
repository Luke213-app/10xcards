import type { APIRoute } from "astro";
import { OPENROUTER_API_KEY, OPENROUTER_MODEL } from "astro:env/server";
import { generateRequestSchema } from "@/lib/schemas/flashcards";
import { generateCandidates } from "@/lib/services/openrouter";
import type { GenerateResponse } from "@/types";

export const prerender = false;

const DEFAULT_MODEL = "openai/gpt-4o-mini";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = generateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid request", details: parsed.error.issues }, 400);
  }

  if (!OPENROUTER_API_KEY) {
    return json({ error: "Generation is not configured" }, 503);
  }

  try {
    const candidates = await generateCandidates(parsed.data.sourceText, {
      apiKey: OPENROUTER_API_KEY,
      model: OPENROUTER_MODEL ?? DEFAULT_MODEL,
    });
    const payload: GenerateResponse = { candidates };
    return json(payload, 200);
  } catch {
    return json({ error: "Generation failed. Please try again." }, 502);
  }
};
