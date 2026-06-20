-- Migration: add FSRS scheduling state to flashcards (roadmap S-05 / OQ-1)
-- Additive only: ten per-card scheduling columns + a due-queue index. Defaults
-- make every existing row immediately reviewable in `New` state (due = now), so
-- no data backfill is needed. Columns mirror the ts-fsrs Card shape exactly;
-- `state`/`learning_steps` stay numeric (ts-fsrs enums are numbers) rather than
-- a Postgres enum. New columns inherit the existing per-operation RLS policies,
-- so no policy changes are required.

alter table public.flashcards
  add column due timestamptz not null default now(),
  add column stability double precision not null default 0,
  add column difficulty double precision not null default 0,
  add column elapsed_days integer not null default 0,
  add column scheduled_days integer not null default 0,
  add column learning_steps integer not null default 0,
  add column reps integer not null default 0,
  add column lapses integer not null default 0,
  add column state smallint not null default 0, -- New=0, Learning=1, Review=2, Relearning=3
  add column last_review timestamptz; -- nullable: null = never reviewed

-- Supports the due-queue read: `where user_id = auth.uid() and due <= now() order by due`.
create index flashcards_user_id_due_idx
  on public.flashcards (user_id, due);
