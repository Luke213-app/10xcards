import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { gradeSchema } from "@/lib/schemas/flashcards";
import { gradeFlashcard } from "@/lib/services/flashcards";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Commit one spaced-repetition grade for a card (S-05). Mirrors the auth/error
// shape of PATCH /api/flashcards/[id] exactly. Ownership is never checked here —
// the RLS-scoped client makes another user's row invisible, so a missing or
// not-owned id both surface as 404. Only scheduling state changes; front/back
// are immutable, so this takes a dedicated gradeSchema (rating 1–4), not the
// update schema.
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Supabase is not configured" }, 503);
  }

  const id = context.params.id;
  if (!id) {
    return json({ error: "Flashcard not found" }, 404);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = gradeSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid request", details: parsed.error.issues }, 400);
  }

  try {
    const flashcard = await gradeFlashcard(supabase, id, parsed.data.rating);
    if (!flashcard) {
      return json({ error: "Flashcard not found" }, 404);
    }
    return json({ flashcard }, 200);
  } catch {
    return json({ error: "Failed to grade the flashcard" }, 500);
  }
};
