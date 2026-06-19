---
change_id: s-02
title: Manually create a flashcard (S-02)
status: implementing
created: 2026-06-19
updated: 2026-06-19
archived_at: null
---

## Notes

Maps to roadmap slice **S-02 / `manual-card-creation`** (PRD ref FR-006). Folder kept as `s-02`.

- **Outcome:** user can manually author a flashcard (front + back) and save it to their collection as a first-class action — not only the post-failed-generation fallback that exists today.
- **Prerequisite F-01 is shipped:** `public.flashcards` table + RLS, `flashcard_source` enum (incl. `manual`), `Flashcard`/`CreateFlashcardCommand` types, `createFlashcard()` service.
- **Already built by S-01 and reusable:** `POST /api/flashcards` validated write path (handles `source: "manual"`), `createFlashcardSchema` (zod), and an inline manual form inside `GenerateView`'s `EmptyState`. The backend is done — S-02 is a frontend surface + navigation slice.
- **Roadmap risk to honor:** keep the manual form's saved shape identical to S-01's accept-save path so the collection stays homogeneous.
