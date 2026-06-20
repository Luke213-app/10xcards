// Shared entity and DTO types for the app. Keep in sync with the database schema
// (see supabase/migrations/*_create_flashcards.sql).

/** Card origin — mirrors the `flashcard_source` Postgres enum exactly.
 *  - `ai-full`   AI-generated, accepted unedited
 *  - `ai-edited` AI-generated, edited before accepting
 *  - `manual`    hand-authored
 */
export type FlashcardSource = "ai-full" | "ai-edited" | "manual";

/** A saved flashcard, as exposed to the app (camelCase). */
export interface Flashcard {
  id: string;
  userId: string;
  front: string;
  back: string;
  source: FlashcardSource;
  createdAt: string;
  updatedAt: string;
}

/** Payload to create a card. `userId` is intentionally absent — the DB column
 *  defaults to `auth.uid()` and RLS rejects writing another user's row. */
export interface CreateFlashcardCommand {
  front: string;
  back: string;
  source: FlashcardSource;
}

/** Payload to edit a card. Origin and ownership are immutable post-create. */
export interface UpdateFlashcardCommand {
  front?: string;
  back?: string;
}

// --- AI generation flow (S-01) ---

/** Body of `POST /api/generate`: the source text to extract cards from. */
export interface GenerateRequest {
  sourceText: string;
}

/** A single AI-proposed card, pre-save. No id/source yet — `source` is derived
 *  client-side on accept (`ai-full` unedited, `ai-edited` if changed). */
export interface FlashcardCandidate {
  front: string;
  back: string;
}

/** Response of `POST /api/generate`: the (possibly empty) candidate list. */
export interface GenerateResponse {
  candidates: FlashcardCandidate[];
}

// --- Spaced-repetition review flow (S-05) ---

/** ts-fsrs grade scale (FR-011). Maps to `Rating`: Again(1)/Hard(2)/Good(3)/Easy(4).
 *  `Manual=0` is internal to ts-fsrs and never surfaced. */
export type Grade = 1 | 2 | 3 | 4;

/** One grade's previewed outcome (FR-010): when the card would next be due if the
 *  user picks this grade, plus a short human label (e.g. "3d"). Date kept as ISO
 *  `string` to match the `Flashcard` convention (client does `new Date(iso)`). */
export interface GradePreview {
  due: string;
  label: string;
}

/** The four next-interval previews, keyed by grade (1–4). Computed server-side at
 *  queue load via ts-fsrs `repeat()` — no client-side scheduler. */
export type GradePreviews = Record<Grade, GradePreview>;

/** A due card as seen by the review session island. Narrow DTO that deliberately
 *  does NOT extend `Flashcard`: it carries only what the review loop renders plus
 *  the scheduling fields the client needs. Dates are ISO strings. */
export interface ReviewCard {
  id: string;
  front: string;
  back: string;
  due: string;
  state: number;
  previews: GradePreviews;
}

/** Body of `POST /api/flashcards/[id]/review`: the user's grade for one card. */
export interface GradeCommand {
  rating: Grade;
}
