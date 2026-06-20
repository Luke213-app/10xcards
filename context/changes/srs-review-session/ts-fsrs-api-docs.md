# ts-fsrs API docs — for S-05 (srs-review-session)

> External research for S-05. Source: Context7 `/open-spaced-repetition/ts-fsrs` (High reputation, 466 snippets).
> Fetched 2026-06-20. ts-fsrs is the FSRS implementation chosen for the SR algorithm — **this resolves OQ-1**.

## Core API — the whole review loop in 4 calls

```ts
import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs'

const scheduler = fsrs()          // FSRS instance (optionally fsrs({ ...params }))
const card = createEmptyCard()    // new card, state=New, due=now

// FR-010: preview all four outcomes (e.g. to show "next due in X" on each button)
const preview = scheduler.repeat(card, new Date())
// preview[Rating.Good].card / .log  — does NOT mutate

// FR-011: commit the user's grade
const result = scheduler.next(card, new Date(), Rating.Good)
result.card  // updated card → persist this back
result.log   // review-log entry (optional history)
```

- `repeat(card, now)` → preview of all 4 ratings, **no commit**. Use it to render grading buttons with their resulting intervals.
- `next(card, now, grade)` → `{ card, log }`. Single write per graded card. Throws `FSRSValidationError` if grade isn't 1–4.

## FR-011 grade scale — `Rating`

```ts
enum Rating { Manual = 0, Again = 1, Hard = 2, Good = 3, Easy = 4 }
type Grade = Exclude<Rating, Rating.Manual>   // only 1–4 are valid for next()
```

Grading UI exposes **Again / Hard / Good / Easy** → pass `1|2|3|4`. `Manual=0` is internal — do not surface it.

## F-01 schema — per-card scheduling state to persist

`createEmptyCard()` returns exactly these fields. Persist all of them per card so scheduling state survives across sessions/devices (alongside `front`, `back`, `user_id`).

| Field            | Type          | Note |
| ---------------- | ------------- | ---- |
| `due`            | timestamptz   | **next review time → query due cards on this** |
| `stability`      | float         | memory model |
| `difficulty`     | float         | memory model |
| `elapsed_days`   | int           | (deprecated but still returned) |
| `scheduled_days` | int           | days until next review |
| `learning_steps` | int           | position in learning steps |
| `reps`           | int           | total reviews |
| `lapses`         | int           | failed reviews |
| `state`          | int (enum)    | `New=0, Learning=1, Review=2, Relearning=3` |
| `last_review`    | timestamptz \| null | null for never-reviewed |

New cards initialize with `stability:0, difficulty:0, state:New, last_review:undefined`.

```ts
enum State { New = 0, Learning = 1, Review = 2, Relearning = 3 }
type StateType = 'New' | 'Learning' | 'Review' | 'Relearning'
```

## FR-010 — surfacing due cards

ts-fsrs has no query helper; due-ness lives in the `due` column. The review session query is:

```sql
select * from flashcards
where user_id = auth.uid() and due <= now()
order by due;
```

## Persistence round-trip (Supabase / Postgres)

Cards come back with native `Date` objects and numeric `state`. When reading a row back from Postgres (ISO-string dates, possibly string state), normalize before passing to the scheduler:

```ts
import { TypeConvert } from 'ts-fsrs'
const card = TypeConvert.card(rowFromDb)  // ISO strings → Date, 'Review' → State.Review
```

`CardInput` accepts flexible inputs, so storing ISO timestamps and reading them back is safe:

```ts
interface CardInput extends Omit<Card, 'state' | 'due' | 'last_review'> {
  state: StateType | State            // accepts 'Review' or 2
  due: DateInput                      // accepts Date | ISO string | ms
  last_review?: DateInput | null
}
```

`repeat`/`next` accept `CardInput` directly, so you can pass a raw DB row in — but run `TypeConvert.card()` if you need a normalized `Card` (Date objects, numeric state) elsewhere.

## Net for planning S-05

- **Data contract:** `next(card, now, grade) → { card, log }`; preview via `repeat(card, now)`.
- **Schema:** the 10 scheduling fields above on F-01's card table.
- **Due selection:** `due <= now()` filter, scoped by `user_id` (RLS).
- **Grade scale:** `Rating` 1–4 (Again/Hard/Good/Easy).
- **Prerequisites (per roadmap):** F-01 (store) + S-01 (cards to review).
