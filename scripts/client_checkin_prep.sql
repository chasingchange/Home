-- Run this once in the Supabase SQL editor, AFTER client_portal_profile.sql
-- (depends on public.is_coach(uuid)).
--
-- "Call prep": talking points for the coach's next call with a client,
-- written by the weekly Fathom review (the scheduled run that reads the last
-- Fathom meeting with each client and lists what to bring up next time).
-- One row per client per week (week_start = Monday of the week of the call
-- it's for). The portal shows it on that week's check-in, in the coach's
-- column.
--
-- COACH ONLY. Unlike client_checkin_coach_notes, clients have NO select
-- policy here, so a client's session can't read these rows at all, not even
-- through the API. The portal also hides the block in client mode.
--
-- Written by:
--   * supabase/functions/checkin-prep (the scheduled run posts here with
--     the CHECKIN_PREP_SECRET shared secret; service role bypasses RLS)
--   * the coach, editing the text on the check-in in the portal.

create table if not exists public.client_checkin_prep (
  id              bigint generated always as identity primary key,
  client_id       uuid not null references public.profiles(id) on delete cascade,
  week_start      date not null,                 -- Monday of the week of the call this preps
  talking_points  text not null default '',
  source_title    text not null default '',      -- the Fathom meeting it came from
  source_url      text not null default '',
  source_date     date,
  generated_at    timestamptz,                   -- when the scheduled run wrote it
  updated_at      timestamptz not null default now(),
  unique (client_id, week_start)
);

create index if not exists client_checkin_prep_week_idx
  on public.client_checkin_prep (week_start);

alter table public.client_checkin_prep enable row level security;

drop policy if exists "coach reads and writes call prep" on public.client_checkin_prep;
create policy "coach reads and writes call prep" on public.client_checkin_prep for all
  using (public.is_coach(auth.uid()))
  with check (public.is_coach(auth.uid()));

grant select, insert, update, delete on public.client_checkin_prep to authenticated;
