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

### Phase 5 outcome (2026-06-25)

The merge gate is **live on `master`**. `impl-review-ci/verdict` is now a
**required status check** (branch-protection API,
`required_status_checks.checks = [impl-review-ci/verdict]`, `strict:false`,
`enforce_admins:false`).

**Plan-vs-reality divergence (load-bearing):**

- **Free private repo can't enable branch protection.** Both the
  branch-protection and rulesets APIs returned HTTP 403 ("Upgrade to GitHub Pro
  or make this repository public"). The repo is owned by a personal account on
  the free plan. With user approval, the repo was **made public**
  (`gh repo edit --visibility public`) to unblock the gate — history was scanned
  first and contains no secrets (the only `sk-ant` hit is the grep-pattern text
  inside `plan.md`). Alternatives offered and declined: keep private + defer, or
  upgrade to Pro.
- **Gate is the verdict commit-status, not `ai-cr:*` labels** (carried over from
  Phase 4). The required check context is `impl-review-ci/verdict`.

**End-to-end gate proof (throwaway PR #18, closed + branch deleted):**

1. Bad commit — `buildSearchQuery` interpolating raw user input into SQL
   (injection) — review verdict **REJECTED** → `impl-review-ci/verdict=failure`
   → PR `mergeStateStatus: BLOCKED` (run `28172696240`). Sonnet correctly flagged
   one CRITICAL (Safety & Quality FAIL, Plan Adherence FAIL, Success Criteria FAIL).
2. Parameterized fix → verdict **APPROVED** → `impl-review-ci/verdict=success`
   → `mergeStateStatus: CLEAN`, mergeable (run `28173085148`).

This closes plan rows 4.5 (deferred from Phase 4) and 5.2–5.4. Rollback: remove
the required check from branch protection, and/or flip the repo back to private
(which silently disables protection on the free plan).

**Known follow-up (consciously deferred — not fixed now):** because
`impl-review-ci/verdict` is a *required* check but `review.yml` only runs on
code/config `paths:`, a **docs-only PR** (markdown / `context/**`) never triggers
the workflow, so the required status is never reported and GitHub blocks the
merge ("Expected — waiting for status to be reported"). Same-reason: these Phase 5
close-out commits were pushed **directly to `master`** (admin bypass,
`enforce_admins:false`) rather than via a docs-only PR that would have deadlocked.
Future docs-only PRs to `master` will hit this until addressed. Options when
revisited: (a) add a lightweight job that posts `impl-review-ci/verdict=success`
on docs-only PRs, (b) drop the path filter so review always runs, or (c) accept
admin-merge for docs PRs. Captured as a recurring trap candidate for
`/10x-lesson` (required check + path-filtered workflow ⇒ off-path PRs deadlock).
