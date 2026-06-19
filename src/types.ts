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
