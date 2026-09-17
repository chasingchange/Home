-- ── client_goals table ────────────────────────────────────────────────────
-- Stores goals for each client. Both the coach and the client can add goals.
-- created_by: 'coach' | 'client'
-- status:     'active' | 'achieved'

create table if not exists public.client_goals (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  description  text not null default '',
  core_key     text not null default '',   -- body | mind | art | soul | career | life | ''
  target_date  date,
  status       text not null default 'active',
  created_by   text not null default 'client',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- index for fast per-client lookups
create index if not exists client_goals_client_id_idx on public.client_goals (client_id);

-- keep updated_at current
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists client_goals_set_updated_at on public.client_goals;
create trigger client_goals_set_updated_at
  before update on public.client_goals
  for each row execute procedure public.set_updated_at();

-- ── RLS policies ───────────────────────────────────────────────────────────
alter table public.client_goals enable row level security;

-- clients can read and write their own goals
create policy "client can manage own goals"
  on public.client_goals
  for all
  using  (auth.uid() = client_id)
  with check (auth.uid() = client_id);

-- coach (tywadebusiness@gmail.com) can read and write all goals
create policy "coach can manage all goals"
  on public.client_goals
  for all
  using  (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'coach'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'coach'
    )
  );
