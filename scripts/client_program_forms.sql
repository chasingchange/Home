-- Run this once in the Supabase SQL editor, AFTER client_onboarding_offboarding_cardio.sql
-- (depends on public.is_coach(uuid) and public.client_offboarding).
--
-- Milestone check-ins: one-off forms tied to where a client is in their
-- program, on top of the weekly pre-call form (client-portal/portal.js,
-- PROGRAM_FORMS):
--
--   midpoint     halfway through the program (week 6 of 12, 12 of 24…)
--   renewal      a couple of weeks before the end — renewing? same split?
--                cut or bulk next?
--   offboarding  the final week — the end-of-program reflection
--
-- The questions and when each form is due are edited by the coach in the
-- portal's form editor and stored in public.form_settings (keys
-- 'pf_midpoint', 'pf_renewal', 'pf_offboarding'; nothing to set up there).
--
-- Answers: one row per client, form and program. program_start is the
-- client's onboarding date when the form was filled in, so a client who
-- renews (new onboarding date) gets a fresh set of milestone forms and the
-- old answers stay on record. `answers` is keyed by question key, so the
-- coach can add, reword, retype or delete questions freely.
--
-- status: draft (client saved but didn't send) → submitted → reviewed.
-- Access matches every other client_* table: the client reads and writes
-- their own rows, the coach reads and writes everyone's.

create table if not exists public.client_program_forms (
  id            bigint generated always as identity primary key,
  client_id     uuid not null references public.profiles(id) on delete cascade,
  form_key      text not null check (form_key in ('midpoint','renewal','offboarding')),
  program_start date,
  answers       jsonb not null default '{}',
  status        text not null default 'draft' check (status in ('draft','submitted','reviewed')),
  submitted_at  timestamptz,
  updated_at    timestamptz not null default now(),
  unique nulls not distinct (client_id, form_key, program_start)
);

alter table public.client_program_forms enable row level security;

drop policy if exists "own or coach can select" on public.client_program_forms;
create policy "own or coach can select" on public.client_program_forms for select
  using (client_id = auth.uid() or public.is_coach(auth.uid()));

drop policy if exists "own or coach can insert" on public.client_program_forms;
create policy "own or coach can insert" on public.client_program_forms for insert
  with check (client_id = auth.uid() or public.is_coach(auth.uid()));

drop policy if exists "own or coach can update" on public.client_program_forms;
create policy "own or coach can update" on public.client_program_forms for update
  using (client_id = auth.uid() or public.is_coach(auth.uid()))
  with check (client_id = auth.uid() or public.is_coach(auth.uid()));

drop policy if exists "coach can delete" on public.client_program_forms;
create policy "coach can delete" on public.client_program_forms for delete
  using (public.is_coach(auth.uid()));

grant select, insert, update, delete on public.client_program_forms to authenticated;

-- ─── Carry over any old offboarding answers ────────────────────────────────
-- public.client_offboarding (one fixed column per question) was never shown
-- in the portal, but copy anything in it so nothing is lost. Ratings become
-- "1"–"5" strings, the way the portal stores 1–5 answers. Safe to re-run.
insert into public.client_program_forms (client_id, form_key, program_start, answers, status, submitted_at, updated_at)
select
  o.client_id,
  'offboarding',
  d.onboard_date,
  jsonb_strip_nulls(jsonb_build_object(
    'hoped_for',              nullif(o.hoped_for, ''),
    'what_changed',           nullif(o.what_changed, ''),
    'surprised',              nullif(o.surprised, ''),
    'habits_stuck',           nullif(o.habits_stuck, ''),
    'most_proud',             nullif(o.most_proud, ''),
    'old_you',                nullif(o.old_you, ''),
    'do_differently',         nullif(o.do_differently, ''),
    'still_unclear',          nullif(o.still_unclear, ''),
    'most_helpful',           nullif(o.most_helpful, ''),
    'improve_structurally',   nullif(o.improve_structurally, ''),
    'tools_confusing',        nullif(o.tools_confusing, ''),
    'clarity_of_plan',        o.clarity_of_plan::text,
    'accountability_support', o.accountability_support::text,
    'check_ins',              o.check_ins::text,
    'communication_speed',    o.communication_speed::text,
    'next_goal',              nullif(o.next_goal, ''),
    'continued_structure',    nullif(o.continued_structure, ''),
    'continuation_signal',    case when cardinality(o.continuation_signal) > 0 then to_jsonb(o.continuation_signal) end
  )),
  case when o.submitted then 'submitted' else 'draft' end,
  case when o.submitted then o.updated_at end,
  o.updated_at
from public.client_offboarding o
left join public.client_dashboard d on d.client_id = o.client_id
where o.submitted
   or o.hoped_for <> '' or o.what_changed <> '' or o.most_proud <> '' or o.next_goal <> ''
on conflict do nothing;
