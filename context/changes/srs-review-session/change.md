---
change_id: srs-review-session
title: Srs review session
status: implementing
created: 2026-06-20
updated: 2026-06-20
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- **SR library research → [`research.md`](./research.md)** (2026-06-20, exa.ai). Resolves roadmap OQ-1. Recommendation: **`ts-fsrs`** (FSRS v6, MIT, zero-dep, edge-compatible). Caveat: verify scheduler core runs on Cloudflare Workers (optimizer is WASM, not needed for MVP). Fallback: SM-2 package for a minimal state shape.
- **Codebase compatibility research → [`research.md` follow-up](./research.md#follow-up-research-ts-fsrs--codebase-compatibility-2026-06-20-internal)** (2026-06-20, internal). **Verdict: ✅ compatible**, prereqs F-01/S-01 already implemented (roadmap baseline stale). Work is additive: 1 migration (10 scheduling cols + `(user_id, due)` index) + new review endpoint/page/island following existing templates. Edge caveat resolved (scheduler core has zero Node APIs). ⚠️ migration MUST be pushed to remote (`supabase db push`) per `lessons.md`. Ready for `/10x-plan`.
