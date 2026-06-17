---
project: "10xCards"
version: 1
status: draft
created: 2026-06-17
context_type: greenfield
product_type: web-app
target_scale:
  users: medium
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

# PRD — 10xCards

## Vision & Problem Statement

Creating high-quality educational flashcards by hand is slow and tedious. A professional upskiller who already knows spaced repetition works hits a wall before they can benefit from it: they must author an entire deck before the first review session. That upfront authoring cost kills motivation, so they either grind out cards by hand (slow) or abandon the method entirely despite believing in it.

The insight is that the barrier is **workflow friction, not knowledge or motivation**. The status quo (Anki, manual decks) solves the review algorithm well but leaves the slow, lonely work of writing cards entirely to the user. 10xCards collapses that authoring step: generate a usable deck from source text the user already has, so the path from "I have material" to "I'm reviewing" is short enough that motivation survives.

## User & Persona

**Primary persona — the Professional Upskiller.** Someone learning for work: a new certification, an unfamiliar domain, or skills their job now demands. They are time-poor and already read or collected the source material (docs, articles, notes). They reach for 10xCards at the moment they've finished reading something and want to retain it via spaced repetition — but don't have the time or patience to hand-author a deck. They value speed and "good enough" cards over hand-crafted perfection.

## Success Criteria

### Primary
- The core flow works end-to-end: a logged-in user pastes source text, generates candidate cards, reviews them (accept / edit / reject), saves accepted cards, and reviews them in a spaced-repetition session.
- ≥ 75% of AI-generated flashcards are accepted by users (generation quality bar).
- ≥ 75% of all flashcards a user creates are made via AI rather than manually (the AI path is the preferred one).

### Secondary
- Users emphasize AI-acceptance quality as the signal that matters most. Repeat-review retention (users returning for spaced-repetition sessions rather than generating once and leaving) is a candidate nice-to-have to revisit; not committed for MVP.

### Guardrails
- **User data isolation** — a user can never read or modify another user's decks or cards.
- **No data loss** — accepted/saved cards and review progress are never silently lost.

## User Stories

### US-01: User turns pasted text into accepted flashcards

- **Given** a logged-in user who has pasted a block of source text
- **When** they request AI generation
- **Then** they see a list of candidate flashcards (front/back) they can accept, edit, or reject, and accepted cards are saved to their collection

#### Acceptance Criteria
- Each candidate can be individually accepted, edited before accepting, or rejected.
- Only accepted candidates are persisted; rejected ones are discarded.
- Edited candidates are saved with the user's edits, not the original generation.
- If generation returns nothing usable, the user sees an explanatory state and can still create cards manually.

## Functional Requirements

### Accounts
- FR-001: User can register an account with email and password. Priority: must-have
  > Socrates: Considered "auth is undifferentiated cost / validates too early." Resolution: kept; accounts are required to persist a user's collection per the access model.
- FR-002: User can log in and log out. Priority: must-have
  > Socrates: Considered "logout non-essential / redundant with FR-001." Resolution: kept; baseline of any account system.

### AI generation
- FR-003: User can paste source text and request AI-generated flashcard candidates. Priority: must-have
  > Socrates: Considered "unbounded text = cost/quality risk" and "paste-only too narrow." Resolution: kept as the core value prop; a source-text length bound is routed to Open Questions (OQ-2).
- FR-004: User can review each generated candidate and accept, edit, or reject it. Priority: must-have
  > Socrates: Considered "per-card review reintroduces the authoring friction." Resolution: kept; review+edit drives the 75% acceptance quality metric. Bulk-accept ergonomics noted for downstream UX.
- FR-005: User can save accepted candidates into their collection. Priority: must-have
  > Socrates: Considered "redundant with FR-004 (accept == save)." Resolution: kept as a distinct capability; persistence is the point of the flow.

### Manual authoring & management
- FR-006: User can manually create a flashcard (front and back). Priority: must-have
  > Socrates: Considered "manual creation works against the AI-first thesis / could be v2." Resolution: kept; in the seed's MVP scope and the fallback when generation fails.
- FR-007: User can browse their saved flashcards. Priority: must-have
  > Socrates: Considered "flat list won't scale / review makes browsing redundant." Resolution: kept; grouping deferred to v2 (Non-Goals).
- FR-008: User can edit a saved flashcard. Priority: must-have
  > Socrates: Considered "overlaps with FR-004 edit / delete+recreate is enough." Resolution: kept; cards need correcting over time.
- FR-009: User can delete a saved flashcard. Priority: must-have
  > Socrates: Considered "delete loses SR history; suspend/archive may be the better primitive." Resolution: kept as delete for MVP; suspend-vs-delete semantics routed to Open Questions (OQ-3).

### Spaced-repetition review
- FR-010: User can start a review session that surfaces due cards using a ready-made spaced-repetition algorithm. Priority: must-have
  > Socrates: Considered "SR integration is the riskiest unknown / generate+save already proves value." Resolution: kept; without review the cards have no payoff. Specific algorithm choice routed to Open Questions (OQ-1).
- FR-011: User can grade a card during a review session so the algorithm reschedules its next appearance. Priority: must-have
  > Socrates: Considered "grading-scale UX is a rabbit hole / implied by FR-010." Resolution: kept; grading is the input the algorithm needs. Grade-scale shape depends on the chosen algorithm (OQ-1).

> Cards are a single flat per-user collection in the MVP; grouping into decks/topics is deferred (see Non-Goals).

## Non-Functional Requirements

- When a user requests AI generation, they receive acknowledgement that the request was accepted within a perceptible moment, and continuous visible progress for any generation that takes longer than two seconds — the user is never left unsure whether the app is working.
- A user's saved cards and review progress are available from any device after they log in; no part of a user's collection or progress exists only on a single machine.
- The product remains usable on the current major versions of the mainstream desktop browsers. (Web only; no mobile app — see Non-Goals.)

## Business Logic

10xCards decides both *what* a learner should turn into flashcards — extracting the testable facts from their source text — and *when* each card should next be reviewed, based on how well the learner recalled it. (Two rules, not one.)

The first rule consumes a block of source text the user supplies and produces a set of candidate question/answer cards, choosing what in the text is worth testing and how to phrase each as a recall prompt. The user encounters it as the candidate list they accept, edit, or reject — and the quality of that decision is what the ≥75% acceptance bar measures.

The second rule consumes the user's recall performance (their grade on each card during a review session) and produces a schedule — which cards are due, and when each should resurface. The user encounters it as the set of cards a review session puts in front of them. This rule is delegated to a ready-made spaced-repetition algorithm rather than invented (the specific algorithm is an open question; see Open Questions).

## Access Control

Multi-user with email + password login accounts. Each user signs up, signs in, and their flashcards/decks persist server-side tied to their account, reachable across devices.

Flat role model: every user is identical and can act only on their own data. There are no admin, member, or guest roles in the MVP. An unauthenticated visitor cannot reach any deck or generation feature — those routes require a signed-in account.

## Non-Goals

- **No custom spaced-repetition algorithm.** The MVP integrates a ready-made algorithm; building a SuperMemo/Anki-style scheduler is out of scope. Forces a buy-not-build decision.
- **No multi-format import.** Source comes in as pasted text only; no PDF, DOCX, or URL import in v1.
- **No deck sharing or collaboration.** Every collection is private and single-owner; no sharing between users.
- **No native mobile app.** Web only for the MVP.
- **No deck grouping.** Cards are a single flat per-user collection; no decks, folders, or tags in v1.
- **No third-party platform integrations.** No integrations with other educational platforms.

## Open Questions

1. **Which ready-made spaced-repetition algorithm/library?** — Owner: user, during stack/implementation planning (downstream of PRD). The MVP commits to integrating an existing one, not building it; the specific choice (and the grade-scale shape it implies for FR-011) is unresolved. (OQ-1)
2. **Is there a source-text length bound for generation?** — Owner: user. Unbounded paste risks generation cost and quality; whether to cap input length (and the UX of that cap) is open. (OQ-2)
3. **Delete vs suspend/archive semantics for cards (FR-009)?** — Owner: user. Hard-deleting a card discards its review history; whether the MVP needs a non-destructive "suspend" is open. (OQ-3)
4. **Source-text retention/privacy commitment?** — Owner: user. Source-text privacy was offered as a guardrail and as an NFR and not selected either time; whether pasted text is retained, and for how long, is undecided. (OQ-4)
