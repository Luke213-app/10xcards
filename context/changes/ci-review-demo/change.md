# ci-review-demo

**Status:** in progress

## What

A small, self-contained source-text statistics helper (`src/lib/text-stats.ts`)
for the AI flashcard generation flow: normalize pasted text and enforce the
fixed character budget shared by the UI and the generate API.

## Why

This change exists to exercise the automatic **AI Code Review** GitHub Actions
pipeline end-to-end on a real pull request — proving the workflow runs, produces
logs, and posts an agent review comment. The helper is deliberately tiny so the
review is easy to read.

## Scope

- Add `src/lib/text-stats.ts` with `normalizeSource`, `sourceCharCount`,
  `isWithinSourceLimit`, and `MAX_SOURCE_CHARS`.
- No wiring into the generate endpoint yet — that is a follow-up.
