import { z } from "zod";

// Single source of truth for flashcard-flow validation. Bounds mirror the
// product decisions and the DB CHECKs so invalid input fails as a clean 400
// (or is silently dropped, for untrusted LLM output) before reaching Postgres.

/** Hard cap on pasted source text (OQ-2). */
const SOURCE_TEXT_MAX = 10000;
/** Per-field cap — mirrors the `front`/`back` DB CHECK (≤ 1000, non-empty). */
const FIELD_MAX = 1000;

const trimmedText = (max: number) => z.string().trim().min(1).max(max);

/** Body of `POST /api/generate`. */
export const generateRequestSchema = z.object({
  sourceText: trimmedText(SOURCE_TEXT_MAX),
});

/** Body of `POST /api/flashcards` — both accept-save and manual-create. */
export const createFlashcardSchema = z.object({
  front: trimmedText(FIELD_MAX),
  back: trimmedText(FIELD_MAX),
  source: z.enum(["ai-full", "ai-edited", "manual"]),
});

/** Body of `PATCH /api/flashcards/[id]` — partial edit of front/back only.
 *  `source` is immutable post-create, so it isn't accepted. At least one of
 *  the two fields must be present, else an empty patch would be a no-op UPDATE. */
export const updateFlashcardSchema = z
  .object({
    front: trimmedText(FIELD_MAX).optional(),
    back: trimmedText(FIELD_MAX).optional(),
  })
  .refine((data) => data.front !== undefined || data.back !== undefined, {
    message: "At least one of front or back must be provided",
  });

const llmCandidateSchema = z.object({
  front: trimmedText(FIELD_MAX),
  back: trimmedText(FIELD_MAX),
});

/** Parses untrusted LLM output. Anything that isn't an array becomes `[]`;
 *  items failing the front/back constraints are dropped (not thrown), and the
 *  result is clamped to 10. Never rejects, so one bad item can't 500 a request. */
export const llmCandidatesSchema = z
  .array(z.unknown())
  .catch([])
  .transform((items) =>
    items
      .flatMap((item) => {
        const result = llmCandidateSchema.safeParse(item);
        return result.success ? [result.data] : [];
      })
      .slice(0, 10),
  );
