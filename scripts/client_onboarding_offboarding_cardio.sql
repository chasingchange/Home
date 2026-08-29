-- Run this once in the Supabase SQL editor, AFTER client_dashboard_data.sql
-- (depends on public.is_coach(uuid) from client_portal_profile.sql, and on
-- public.client_dashboard already existing).
--
-- Adds three things to the client portal, mirroring what used to live only
-- in the coach's Notion workspace:
--
--   1. Preferred cardio + cardio goal — two new columns on client_dashboard,
--      set by the coach during onboarding (Notion: "Goal Intake > Cardio
--      Goal"), visible to the client on their dashboard.
--   2. client_onboarding_items — the onboarding checklist (Notion:
--      "Pre/Post Onboarding" / "Onboarding To Do"), one row per checklist
--      item, checked off by either the coach or the client as it's done.
--   3. client_offboarding — the end-of-program reflection form (Notion:
--      "Chasing Change Offboarding" form), one row per client, filled in
--      by the client and readable by the coach.
--
-- Access model matches every other client_* table: the client can read and
-- write their own row(s), the coach can read and write every client's.

-- ─── Cardio: preferred type + goal, alongside the rest of the overview ────
alter table public.client_dashboard
  add column if not exists preferred_cardio text not null default '',
  add column if not exists cardio_goal      text not null default '';

-- ─── client_onboarding_items: onboarding checklist ─────────────────────────
create table if not exists public.client_onboarding_items (
  id         bigint generated always as identity primary key,
  client_id  uuid not null references public.profiles(id) on delete cascade,
  label      text not null,
  done       boolean not null default false,
  position   int not null default 0
);

-- ─── client_offboarding: end-of-program reflection form ────────────────────
create table if not exists public.client_offboarding (
  client_id             uuid primary key references public.profiles(id) on delete cascade,
  hoped_for             text not null default '',  -- When you started, what were you hoping would change most?
  what_changed          text not null default '',  -- What actually changed?
  surprised             text not null default '',  -- What surprised you about your progress?
  habits_stuck          text not null default '',  -- Which habits stuck the strongest?
  most_proud            text not null default '',  -- What are you most proud of from this program?
  old_you               text not null default '',  -- What are you doing now that "old you" wouldn't have done?
  do_differently        text not null default '',  -- What would you do differently if you restarted the program?
  still_unclear         text not null default '',  -- What still feels unclear?
  most_helpful          text not null default '',  -- What part of coaching helped you the most?
  improve_structurally  text not null default '',  -- What could I improve structurally?
  tools_confusing       text not null default '',  -- What tools felt confusing or unnecessary?
  clarity_of_plan       int,                        -- 1-5
  accountability_support int,                       -- 1-5
  check_ins             int,                        -- 1-5
  communication_speed   int,                         -- 1-5
  next_goal             text not null default '',  -- What's the next goal from here?
  continued_structure   text not null default '',  -- Would continued structure help with the next phase?
  continuation_signal   text[] not null default '{}', -- Testimonial / Referral / Check-in call later / Next phase coaching
  submitted             boolean not null default false,
  updated_at            timestamptz not null default now()
);

-- ─── RLS ────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['client_onboarding_items','client_offboarding']
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format(
      'drop policy if exists "own or coach can select" on public.%I', t);
    execute format(
      'create policy "own or coach can select" on public.%I for select
         using (client_id = auth.uid() or public.is_coach(auth.uid()))', t);

    execute format(
      'drop policy if exists "own or coach can update" on public.%I', t);
    execute format(
      'create policy "own or coach can update" on public.%I for update
         using (client_id = auth.uid() or public.is_coach(auth.uid()))
         with check (client_id = auth.uid() or public.is_coach(auth.uid()))', t);

    execute format(
      'drop policy if exists "own or coach can insert" on public.%I', t);
    execute format(
      'create policy "own or coach can insert" on public.%I for insert
         with check (client_id = auth.uid() or public.is_coach(auth.uid()))', t);

    execute format(
      'drop policy if exists "coach can delete" on public.%I', t);
    execute format(
      'create policy "coach can delete" on public.%I for delete
         using (public.is_coach(auth.uid()))', t);
  end loop;
end $$;

-- ─── Seed: the standard onboarding checklist for a new client ─────────────
-- Replace 'client@example.com' with the client's sign-in email, then run
-- once their profiles row exists (i.e. after they've signed in / been
-- invited at least once). Safe to re-run — it only inserts if empty.
--
-- do $$
-- declare
--   cid uuid;
-- begin
--   select id into cid from public.profiles where email = 'client@example.com';
--   if cid is null then
--     raise notice 'No profile found for that email yet — sign the client in first.';
--     return;
--   end if;
--
--   if not exists (select 1 from public.client_onboarding_items where client_id = cid) then
--     insert into public.client_onboarding_items (client_id, label, position) values
--       (cid, 'Payment', 0),
--       (cid, 'Waiver', 1),
--       (cid, 'Welcome Letter', 2),
--       (cid, 'Audit Form', 3),
--       (cid, 'Share Progress Tracker', 4),
--       (cid, 'Share Notion Homepage', 5),
--       (cid, 'Equipment Procurement', 6),
--       (cid, 'Make / Share Calendar', 7),
--       (cid, 'Goal Intake (Nutrition, Cardio, Fitness)', 8),
--       (cid, 'Set Exercise Day 1', 9),
--       (cid, 'Set Cardio Day 1', 10),
--       (cid, 'Set Exercise Day 2', 11),
--       (cid, 'Set Exercise Day 3', 12),
--       (cid, 'Set Exercise Day 4', 13);
--   end if;
-- end $$;
