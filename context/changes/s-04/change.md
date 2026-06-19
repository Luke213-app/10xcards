---
change_id: s-04
title: Edit and delete a saved flashcard (S-04)
status: implementing
created: 2026-06-19
updated: 2026-06-19
archived_at: null
---

## Notes

Maps to roadmap slice **S-04 / `edit-delete-saved-cards`** (PRD refs FR-008, FR-009). Folder kept as `s-04` per the established convention.

- **Outcome:** user can edit a saved card's front/back and delete a card from their collection, acting on a card selected from the browse list.
- **Prerequisite S-03 is shipped:** the `/cards` browse page (`src/pages/cards/index.astro`) server-renders the user's collection; F-01 shipped `updateFlashcard()` / `deleteFlashcard()` services, `UpdateFlashcardCommand`, and per-user RLS (UPDATE/DELETE policies already exist).
- **Decision (OQ-3):** MVP commits to **hard-delete** per FR-009; non-destructive suspend/archive is an open refinement, not in scope.
- **Likely shape:** this is the slice that adds interactivity to the browse view — S-03's note flagged that S-04 can introduce a client island fed by the SSR data. Needs new API routes (PATCH/DELETE on a single card) since only `POST /api/flashcards` exists today.
- **Risk to honor:** hard-delete discards a card's future SR history (relevant once S-05 lands); keep the edited shape consistent with the rest of the collection.
