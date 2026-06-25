---
change_id: code-review
title: Code review
status: implementing
created: 2026-06-25
updated: 2026-06-25
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### Phase 4 outcome (2026-06-25)

The green path is **proven and live on `master`**: a code/config PR triggers the
`AI Code Review` workflow → `claude-code-action@v1` (Sonnet) runs the
`10x-impl-review-ci` skill → it reviews the PR against its plan, commits
`context/changes/<id>/reviews/impl-review.md` (`[skip ci]`), posts a summary PR
comment, and POSTs the `impl-review-ci/verdict` commit status. Confirmed fully
green on sandbox run `28171295219` (verdict APPROVED).

**Plan-vs-reality divergence (important for Phase 5):**

- **Cannot prove before merge.** `claude-code-action@v1` self-skips unless
  `review.yml` is byte-identical to the default-branch copy. So the workflow had
  to land on `master` (PRs #14, #16) before a sandbox PR could actually exercise
  Claude. The plan's "prove on a throwaway PR before merging" ordering is not
  achievable with this off-the-shelf action.
- **Gate is a verdict commit-status, not `ai-cr:*` labels.** Phase 5 must mark
  the `impl-review-ci/verdict` status context as the required check (not a label).

**Bugs surfaced & fixed during Phase 4** (each only appeared because the action
actually ran end-to-end):

1. Skill staging sourced only from the base branch → failed on first rollout
   (base lacked the skill). Now falls back to the PR-head copy.
2. Missing `id-token: write` → action aborted on OIDC fetch.
3. Verdict step graded any stale `reviews/impl-review*.md` in the tree → false
   green. Now scoped to the bot's review commit at HEAD.
4. `ANTHROPIC_API_KEY` secret existed but was empty (Phase 2 only checked the
   name, not a valid value).
5. Anthropic account had no credit → instant `$0` `is_error` on the first call.
6. "Validate Claude's commit" did `git fetch origin` after the action rewrote
   git auth → `fatal: Authentication failed`. Now reads local `HEAD`.

**Deferred:** the bad → REJECTED → red verdict path (plan row 4.5) was
consciously skipped; Phase 5 will exercise real gating.
