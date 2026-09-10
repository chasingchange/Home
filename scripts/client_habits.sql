-- Run this once in the Supabase SQL editor, AFTER client_dashboard_data.sql
-- (this depends on public.is_coach(uuid), defined in client_portal_profile.sql).
--
-- Backs the "Habits" list on the client portal dashboard: when a client has
-- any habits, the list replaces the Six Cores rail on their left sidebar —
-- see renderCoreList() / renderHabits() in client-portal/portal.js. Clients
-- with no habits keep seeing the Six Cores as before.

create table if not exists public.client_habits (
  id         bigint generated always as identity primary key,
  client_id  uuid not null references public.profiles(id) on delete cascade,
  label      text not null,
  done       boolean not null default false,
  position   int not null default 0
);

alter table public.client_habits enable row level security;

drop policy if exists "own or coach can select" on public.client_habits;
create policy "own or coach can select" on public.client_habits for select
  using (client_id = auth.uid() or public.is_coach(auth.uid()));

drop policy if exists "own or coach can update" on public.client_habits;
create policy "own or coach can update" on public.client_habits for update
  using (client_id = auth.uid() or public.is_coach(auth.uid()))
  with check (client_id = auth.uid() or public.is_coach(auth.uid()));

drop policy if exists "own or coach can insert" on public.client_habits;
create policy "own or coach can insert" on public.client_habits for insert
  with check (client_id = auth.uid() or public.is_coach(auth.uid()));

drop policy if exists "coach can delete" on public.client_habits;
create policy "coach can delete" on public.client_habits for delete
  using (public.is_coach(auth.uid()));
