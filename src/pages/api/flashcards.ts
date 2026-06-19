import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { createFlashcardSchema } from "@/lib/schemas/flashcards";
import { createFlashcard } from "@/lib/services/flashcards";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// One validated write path for both accept-save (ai-full / ai-edited) and the
// manual-create fallback (manual). user_id is never accepted or set here — the
// column DEFAULT auth.uid() + RLS own ownership.
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Supabase is not configured" }, 503);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = createFlashcardSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid request", details: parsed.error.issues }, 400);
  }

  try {
    const flashcard = await createFlashcard(supabase, parsed.data);
    return json({ flashcard }, 201);
  } catch {
    return json({ error: "Failed to save the flashcard" }, 500);
  }
};
