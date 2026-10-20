-- Run this once in the Supabase SQL editor, AFTER client_habits.sql
-- (this depends on public.is_coach(uuid), defined in client_portal_profile.sql).
--
-- Backs the "Habits" tab on the client portal: one row per habit per day the
-- client checked it off — see renderHabitsTab() / toggleHabitDay() in
-- client-portal/portal.js. Rows are keyed by the habit's label rather than
-- client_habits.id, because the coach editor replaces the client_habits rows
-- (new ids) on every save; keying by label keeps a habit's history intact.

create table if not exists public.client_habit_logs (
  client_id   uuid not null references public.profiles(id) on delete cascade,
  habit_label text not null,
  day         date not null,
  created_at  timestamptz not null default now(),
  primary key (client_id, habit_label, day)
);

alter table public.client_habit_logs enable row level security;

drop policy if exists "own or coach can select" on public.client_habit_logs;
create policy "own or coach can select" on public.client_habit_logs for select
  using (client_id = auth.uid() or public.is_coach(auth.uid()));

drop policy if exists "own or coach can insert" on public.client_habit_logs;
create policy "own or coach can insert" on public.client_habit_logs for insert
  with check (client_id = auth.uid() or public.is_coach(auth.uid()));

drop policy if exists "own or coach can delete" on public.client_habit_logs;
create policy "own or coach can delete" on public.client_habit_logs for delete
  using (client_id = auth.uid() or public.is_coach(auth.uid()));
