---
change_id: s-03
title: Browse saved flashcards (S-03)
status: implemented
created: 2026-06-19
updated: 2026-06-19
archived_at: null
---

## Notes

Maps to roadmap slice **S-03 / `browse-saved-cards`** (PRD ref FR-007). Folder kept as `s-03`.

- **Outcome:** a signed-in user can browse their saved flashcard collection as a flat, per-user list (newest-first), with an empty state before any cards exist.
- **Prerequisite F-01 is shipped:** `public.flashcards` table + per-user RLS, `Flashcard` type, and `listFlashcards(client)` service (`created_at DESC`) all exist.
- **Already in place from S-02:** `/cards` is in `PROTECTED_ROUTES` (`startsWith`), so the `/cards` index is already auth-gated — no middleware change. The page+island shell and styling tokens are established by `generate.astro` / `cards/new.astro`.
- **Read-only slice:** no schema, no new type, no new service function, no new API route. The `/cards` page server-renders the list directly via `listFlashcards()`.
- **Roadmap risk to honor:** keep it a flat list (deck/topic grouping is a Non-Goal); MVP scale means no pagination.
