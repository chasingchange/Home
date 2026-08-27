-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
-- Generic cross-device save table for site tools (Companion Chart, and any
-- future tool that wants "sign in to sync"): one row per (user, tool).

create table if not exists public.tool_saves (
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_key text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, tool_key)
);

alter table public.tool_saves enable row level security;

create policy "Users can view their own tool saves"
  on public.tool_saves for select
  using (auth.uid() = user_id);

create policy "Users can insert their own tool saves"
  on public.tool_saves for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own tool saves"
  on public.tool_saves for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own tool saves"
  on public.tool_saves for delete
  using (auth.uid() = user_id);
