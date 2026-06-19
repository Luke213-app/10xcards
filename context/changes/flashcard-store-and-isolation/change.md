---
change_id: flashcard-store-and-isolation
title: Minimal per-user flashcard store with RLS data isolation
status: implementing
created: 2026-06-19
updated: 2026-06-19
archived_at: null
---

## Notes

Roadmap foundation **F-01**. Outcome: accepted/created cards persist in a per-user store with row-level-security isolation; a user can only ever read or write their own cards, and saved cards survive across devices.

- **Unlocks:** S-01 (`ai-card-generation`, north star — somewhere to save accepted cards), S-02, S-03, S-05.
- **PRD refs:** Access Control; Guardrails (user-data isolation, no-data-loss); NFR (cards available from any device after login).
- **Load-bearing call:** the RLS policy shape — get isolation wrong and the user-data-isolation guardrail fails silently.
- **Scope discipline:** a single flat card table + policies (+ shared types and a thin data-access boundary). NOT a full data layer; no SR/scheduling columns (deferred to S-05, blocked on OQ-1); no deck/tag grouping (PRD non-goal).
- Planned ahead of S-01 because S-01's save step depends on this store's table + RLS contract.
