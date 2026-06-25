# Add a `greet` helper — Implementation Plan

## Overview

Add a small, pure helper `greet(name)` to `src/lib/greet.ts`. This is a
**sandbox fixture** whose only purpose is to exercise the automatic AI Code
Review pipeline end-to-end (Phase 4 of the `code-review` change) on a PR that
carries a real plan. It ships no product behavior and is safe to delete.

## Desired End State

- `src/lib/greet.ts` exists and exports `greet(name: string): string`.
- `greet("world")` returns the string `"Hello, world!"`.
- Lint and build pass.

## What We're NOT Doing

- No UI, routes, API endpoints, or database changes.
- No new dependencies.
- No changes to auth, middleware, or any existing module.

## Phase 1: Add the `greet` helper

### Overview

Create a single pure function in `src/lib/`.

### Changes Required

#### 1. New file `src/lib/greet.ts`

**Intent**: Provide a trivial, side-effect-free greeting helper.

**Contract**: Export `greet(name: string): string` that returns
`` `Hello, ${name}!` ``. No I/O, no globals, no external calls.

### Success Criteria

#### Automated Verification

- `npm run lint` passes
- `npm run build` passes

#### Manual Verification

- `greet("world")` returns `"Hello, world!"`

## Progress

> Convention: `- [ ]` pending, `- [x]` done.

### Phase 1: Add the `greet` helper

#### Automated

- [x] 1.1 Create `src/lib/greet.ts` exporting `greet(name): string`
