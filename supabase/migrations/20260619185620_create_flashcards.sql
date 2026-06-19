-- Migration: create flashcards store with per-user RLS isolation (roadmap F-01)
-- Creates the first app table: a flat per-user flashcard collection.
-- Isolation mechanism: user_id defaults to auth.uid() and granular RLS policies
-- restrict every operation to rows the authenticated user owns. The anon role
-- gets no policy, so unauthenticated access returns nothing (defense in depth).

-- Card origin, used to measure the two success metrics:
--   ai-full   = AI-generated, accepted unedited
--   ai-edited = AI-generated, edited before accepting
--   manual    = hand-authored
create type public.flashcard_source as enum ('ai-full', 'ai-edited', 'manual');

create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  front text not null check (char_length(trim(front)) > 0 and char_length(front) <= 1000),
  back text not null check (char_length(trim(back)) > 0 and char_length(back) <= 1000),
  source public.flashcard_source not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Supports per-user browse ordering (S-03): newest cards first, scoped by owner.
create index flashcards_user_id_created_at_idx
  on public.flashcards (user_id, created_at desc);

alter table public.flashcards enable row level security;

-- Granular per-operation policies for the authenticated role only.
create policy "Users can read their own flashcards"
  on public.flashcards
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own flashcards"
  on public.flashcards
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own flashcards"
  on public.flashcards
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own flashcards"
  on public.flashcards
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Keep updated_at accurate on every UPDATE, regardless of the caller.
create function public.set_updated_at()
  returns trigger
  language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger flashcards_set_updated_at
  before update on public.flashcards
  for each row
  execute function public.set_updated_at();
