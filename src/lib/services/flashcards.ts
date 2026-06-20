import type { SupabaseClient } from "@supabase/supabase-js";
import { fsrs, Rating, TypeConvert } from "ts-fsrs";
import type { Card as FsrsCard, RecordLogItem } from "ts-fsrs";
import type { Database } from "@/db/database.types";
import type {
  CreateFlashcardCommand,
  Flashcard,
  Grade,
  GradePreviews,
  ReviewCard,
  UpdateFlashcardCommand,
} from "@/types";

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
): Promise<Flashcard | null> {
  // Only send fields the caller actually set, so omitted fields are left untouched.
  const patch: Database["public"]["Tables"]["flashcards"]["Update"] = {};
  if (cmd.front !== undefined) patch.front = cmd.front;
  if (cmd.back !== undefined) patch.back = cmd.back;

  // `.maybeSingle()` (not `.single()`): RLS hides another user's row and a
  // missing id both yield 0 rows — return `null` so the route can answer 404
  // instead of surfacing PostgREST's PGRST116 as a thrown 500.
  const { data, error } = await typed(client).from("flashcards").update(patch).eq("id", id).select().maybeSingle();
  if (error) throw error;
  return data ? toFlashcard(data) : null;
}

export async function deleteFlashcard(client: SupabaseClient, id: string): Promise<boolean> {
  // `.select()` returns the deleted rows; 0 rows means missing or not-owned
  // (RLS), so the route can map `false` → 404 rather than reporting a silent
  // success for a delete that affected nothing.
  const { data, error } = await typed(client).from("flashcards").delete().eq("id", id).select();
  if (error) throw error;
  return data.length > 0;
}

// --- Spaced-repetition review (S-05) ---

// A single FSRS scheduler with default parameters. Stateless and pure — the
// scheduler core has zero Node-only APIs, so it runs fine on the edge (workerd).
const scheduler = fsrs();

// Compact "next due in" label for a grade button (FR-010). Learning-step grades
// land minutes away while Review grades land days away, so derive the unit from
// the now→due delta rather than `scheduled_days` (which is 0 for sub-day steps).
function formatInterval(now: Date, due: Date): string {
  const minutes = Math.round((due.getTime() - now.getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

// Preview all four outcomes without committing (FR-010). `repeat()` does not
// mutate the card; we surface each grade's resulting `due` + label to the client.
function buildPreviews(card: FsrsCard, now: Date): GradePreviews {
  const preview = scheduler.repeat(card, now);
  const item = (entry: RecordLogItem) => ({
    due: entry.card.due.toISOString(),
    label: formatInterval(now, entry.card.due),
  });
  return {
    1: item(preview[Rating.Again]),
    2: item(preview[Rating.Hard]),
    3: item(preview[Rating.Good]),
    4: item(preview[Rating.Easy]),
  };
}

// Scheduling-aware row→DTO mapper. `toFlashcard` is intentionally left untouched
// (narrow-DTO decision): the review path carries only what the island renders
// plus the four previews, computed from the row's current scheduling state.
function toReviewCard(row: FlashcardRow, now: Date): ReviewCard {
  const card = TypeConvert.card(row);
  return {
    id: row.id,
    front: row.front,
    back: row.back,
    due: row.due,
    state: row.state,
    previews: buildPreviews(card, now),
  };
}

// Inverse serializer: a freshly-scheduled ts-fsrs card → a DB Update patch. Dates
// become ISO strings (timestamptz) and `state`/`learning_steps` stay numeric.
// Only scheduling columns are written — front/back/source are immutable post-create.
function toSchedulingRow(card: FsrsCard): Database["public"]["Tables"]["flashcards"]["Update"] {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    // ts-fsrs still populates elapsed_days; persisted for column-completeness until ts-fsrs v6 drops it.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}

export async function listDueFlashcards(client: SupabaseClient): Promise<ReviewCard[]> {
  // RLS scopes the read to the user; `due <= now` is served by the
  // (user_id, due) index, ordered soonest-first.
  const now = new Date();
  const { data, error } = await typed(client)
    .from("flashcards")
    .select()
    .lte("due", now.toISOString())
    .order("due", { ascending: true });
  if (error) throw error;
  return data.map((row) => toReviewCard(row, now));
}

export async function gradeFlashcard(client: SupabaseClient, id: string, rating: Grade): Promise<ReviewCard | null> {
  // Load first: `.maybeSingle()` yields null for a missing or RLS-hidden row,
  // which the route maps to 404 (no missing-vs-forbidden distinction).
  const { data: row, error: loadError } = await typed(client).from("flashcards").select().eq("id", id).maybeSingle();
  if (loadError) throw loadError;
  if (!row) return null;

  // Commit the grade: `next()` advances the schedule (single write per card).
  // `rating` is validated to 1–4 upstream; cast to the ts-fsrs Grade enum subset.
  const now = new Date();
  const { card } = scheduler.next(TypeConvert.card(row), now, rating);

  const { data: updated, error: updateError } = await typed(client)
    .from("flashcards")
    .update(toSchedulingRow(card))
    .eq("id", id)
    .select()
    .maybeSingle();
  if (updateError) throw updateError;
  return updated ? toReviewCard(updated, now) : null;
}
