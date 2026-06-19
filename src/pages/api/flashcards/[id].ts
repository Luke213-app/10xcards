import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { updateFlashcardSchema } from "@/lib/schemas/flashcards";
import { deleteFlashcard, updateFlashcard } from "@/lib/services/flashcards";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Single-card edit/delete. Mirrors the auth/error shape of POST /api/flashcards
// exactly. Ownership is never checked here — the RLS-scoped client makes another
// user's row invisible, so a missing or not-owned id both surface as 404 (no
// missing-vs-forbidden distinction, to avoid leaking ownership).
export const PATCH: APIRoute = async (context) => {
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

  const parsed = updateFlashcardSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid request", details: parsed.error.issues }, 400);
  }

  try {
    const flashcard = await updateFlashcard(supabase, id, parsed.data);
    if (!flashcard) {
      return json({ error: "Flashcard not found" }, 404);
    }
    return json({ flashcard }, 200);
  } catch {
    return json({ error: "Failed to update the flashcard" }, 500);
  }
};

export const DELETE: APIRoute = async (context) => {
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

  try {
    const deleted = await deleteFlashcard(supabase, id);
    if (!deleted) {
      return json({ error: "Flashcard not found" }, 404);
    }
    return json({ success: true }, 200);
  } catch {
    return json({ error: "Failed to delete the flashcard" }, 500);
  }
};
