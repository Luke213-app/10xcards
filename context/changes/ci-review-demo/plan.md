# Source-Text Stats Helper — Implementation Plan

## Overview

Add a single, dependency-free module, `src/lib/text-stats.ts`, that owns the
definition of "how long is this source text" for the AI flashcard generation
flow. Both the React generate island and the generate API route will import it,
so the client-side counter and the server-side validation can never drift apart.

## Current State Analysis

- The AI generation slice (`context/changes/ai-card-generation/plan.md`) accepts
  pasted source text up to a fixed budget, but there is no shared helper for the
  character count or the limit check — each call site would otherwise re-derive
  it.
- `src/lib/` holds small, framework-agnostic utilities (`utils.ts`,
  `config-status.ts`); this helper follows that convention.

## Desired End State

`src/lib/text-stats.ts` exports:

- `MAX_SOURCE_CHARS = 10000` — the single source of truth for the budget.
- `normalizeSource(text)` — returns the input trimmed of leading/trailing
  whitespace, so surrounding blank lines never inflate the count.
- `sourceCharCount(text)` — the length of the normalized text.
- `isWithinSourceLimit(text, max = MAX_SOURCE_CHARS)` — returns `true` when the
  normalized length fits the budget.

### Limit semantics (contract)

The budget is **inclusive**: text whose normalized length is **exactly `max`
characters is accepted**. Only text strictly longer than `max` is rejected. In
other words, `isWithinSourceLimit` must be a `<=` comparison against `max`, so a
10,000-character paste is valid and a 10,001-character paste is not.

## What We're NOT Doing

- Not wiring the helper into the generate endpoint or the island (follow-up).
- Not adding zod schemas or API validation here.
- No persistence or LLM changes.

## Success Criteria

- The four exports above exist with the documented signatures.
- The inclusive-limit contract holds: `isWithinSourceLimit("a".repeat(10000))`
  is `true`; `isWithinSourceLimit("a".repeat(10001))` is `false`.
- `npm run lint` and `npm run build` pass.

## Automated Verification

- `npm run lint`
- `npm run build`
