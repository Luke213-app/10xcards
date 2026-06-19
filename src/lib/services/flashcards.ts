import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { CreateFlashcardCommand, Flashcard, UpdateFlashcardCommand } from "@/types";

// Thin, RLS-aware data-access boundary for flashcards. Every function takes the
// request-scoped authenticated client from `createClient(...)` (src/lib/supabase.ts)
// so the user's JWT — and therefore row-level security — is always in force.
// Downstream slices (S-01..S-04) call these instead of touching the client directly.

type FlashcardRow = Database["public"]["Tables"]["flashcards"]["Row"];

// The app-wide client (src/lib/supabase.ts) is created without the Database
// generic; narrowing it here keeps the typing local and gives fully typed queries.
function typed(client: SupabaseClient): SupabaseClient<Database> {
  return client as SupabaseClient<Database>;
}

function toFlashcard(row: FlashcardRow): Flashcard {
  return {
    id: row.id,
    userId: row.user_id,
    front: row.front,
    back: row.back,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createFlashcard(client: SupabaseClient, cmd: CreateFlashcardCommand): Promise<Flashcard> {
  // user_id is omitted on purpose: the column DEFAULT auth.uid() populates it and
  // the INSERT RLS policy rejects any attempt to write another user's row.
  const { data, error } = await typed(client)
    .from("flashcards")
    .insert({ front: cmd.front, back: cmd.back, source: cmd.source })
    .select()
    .single();
  if (error) throw error;
  return toFlashcard(data);
}

export async function listFlashcards(client: SupabaseClient): Promise<Flashcard[]> {
  const { data, error } = await typed(client).from("flashcards").select().order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(toFlashcard);
}

export async function getFlashcard(client: SupabaseClient, id: string): Promise<Flashcard | null> {
  const { data, error } = await typed(client).from("flashcards").select().eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toFlashcard(data) : null;
}

export async function updateFlashcard(
  client: SupabaseClient,
  id: string,
  cmd: UpdateFlashcardCommand,
): Promise<Flashcard> {
  // Only send fields the caller actually set, so omitted fields are left untouched.
  const patch: Database["public"]["Tables"]["flashcards"]["Update"] = {};
  if (cmd.front !== undefined) patch.front = cmd.front;
  if (cmd.back !== undefined) patch.back = cmd.back;

  const { data, error } = await typed(client).from("flashcards").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return toFlashcard(data);
}

export async function deleteFlashcard(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await typed(client).from("flashcards").delete().eq("id", id);
  if (error) throw error;
}
