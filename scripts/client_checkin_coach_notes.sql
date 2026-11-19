-- Run this once in the Supabase SQL editor, AFTER client_portal_profile.sql
-- (depends on public.is_coach(uuid)).
--
-- The coach's side of the weekly check-in: "Wins" and "Coach's Objectives"
-- for each client, one row per client per week (week_start = that week's
-- Monday). It sits beside the client's own pre-call form
-- (client_pre_call_submissions) and the portal shows both on the same
-- week's check-in card. Keeping it in its own table means the coach can
-- fill it in before the client has submitted without it counting as the
-- client's check-in.
--
-- Written from the client portal's Check-ins tab and from the coach-only
-- master editor (checkin-notes/). Clients can read their own rows; only
-- the coach can write.

create table if not exists public.client_checkin_coach_notes (
  id               bigint generated always as identity primary key,
  client_id        uuid not null references public.profiles(id) on delete cascade,
  week_start       date not null,                 -- Monday of the check-in week
  wins             text not null default '',
  coach_objectives text not null default '',
  updated_at       timestamptz not null default now(),
  unique (client_id, week_start)
);

create index if not exists client_checkin_coach_notes_week_idx
  on public.client_checkin_coach_notes (week_start);

alter table public.client_checkin_coach_notes enable row level security;

drop policy if exists "client reads own coach notes" on public.client_checkin_coach_notes;
create policy "client reads own coach notes" on public.client_checkin_coach_notes for select
  using (client_id = auth.uid() or public.is_coach(auth.uid()));

drop policy if exists "coach writes coach notes" on public.client_checkin_coach_notes;
create policy "coach writes coach notes" on public.client_checkin_coach_notes for all
  using (public.is_coach(auth.uid()))
  with check (public.is_coach(auth.uid()));

grant select, insert, update, delete on public.client_checkin_coach_notes to authenticated;
