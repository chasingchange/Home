-- Run this once in the Supabase SQL editor, AFTER client_portal_profile.sql
-- (this depends on public.is_coach(uuid), defined there).
--
-- Backs the client-portal dashboard with real per-client data instead of the
-- hardcoded demo content that used to live in client-portal/portal.js.
--
-- One row of client_dashboard per client, plus one row per item in the list
-- tables (cores, tasks, notes, metrics, resources, wins, messages). All are
-- keyed by client_id = the client's public.profiles.id / auth.users.id.
--
-- Access model:
--   - The client can read and write their OWN rows (so the reminder toggle,
--     day/channel pickers, and weekly task checkboxes keep working exactly
--     like before, just persisted now instead of only living in local state).
--   - The coach can read and write EVERY client's rows (that's how the
--     "Edit portal" form in the coach dashboard saves changes).
--   - Nobody else can read or write any of this.
--
-- Note: policies below grant the client full UPDATE on their own row in
-- each table (not just the "done" / reminder_* columns they're expected to
-- touch from the UI). That's intentionally simple for a small trusted
-- roster — tighten with column-level triggers later if this ever needs to
-- hold up against an adversarial client.

-- ─── client_dashboard: one row per client, the scalar/overview fields ─────
create table if not exists public.client_dashboard (
  client_id            uuid primary key references public.profiles(id) on delete cascade,
  route                text not null default '',
  week_now             int  not null default 0,
  week_total           int  not null default 0,
  streak_weeks         int  not null default 0,
  adherence_pct        int  not null default 0,
  flag_status          text not null default 'On track',
  flag_color           text not null default '#77d770',
  next_session_label   text not null default '',
  next_session_agenda  text not null default '',
  reminder_day         text not null default 'Tuesday',
  reminder_channel     text not null default 'text',
  reminder_on          boolean not null default true,
  adherence_history    int[] not null default '{}',
  updated_at           timestamptz not null default now()
);

-- ─── client_cores: the six-core breakdown ─────────────────────────────────
create table if not exists public.client_cores (
  id         bigint generated always as identity primary key,
  client_id  uuid not null references public.profiles(id) on delete cascade,
  core_key   text not null,       -- body | mind | art | soul | career | life
  label      text not null,
  color      text not null,
  pct        int  not null default 0,
  note       text not null default '',
  position   int  not null default 0,
  unique (client_id, core_key)
);

-- ─── client_tasks: this week's assignments / checklist ────────────────────
create table if not exists public.client_tasks (
  id         bigint generated always as identity primary key,
  client_id  uuid not null references public.profiles(id) on delete cascade,
  label      text not null,
  core_key   text not null default '',
  color      text not null default '#77d770',
  done       boolean not null default false,
  position   int not null default 0
);

-- ─── client_notes: session recaps ──────────────────────────────────────────
create table if not exists public.client_notes (
  id         bigint generated always as identity primary key,
  client_id  uuid not null references public.profiles(id) on delete cascade,
  label      text not null,
  meta       text not null default '',
  body       text not null default '',
  created_at timestamptz not null default now()
);

-- ─── client_metrics: body metrics row list ─────────────────────────────────
create table if not exists public.client_metrics (
  id         bigint generated always as identity primary key,
  client_id  uuid not null references public.profiles(id) on delete cascade,
  label      text not null,
  value      text not null default '',
  position   int not null default 0
);

-- ─── client_resources: assigned resource-library chips ────────────────────
create table if not exists public.client_resources (
  id         bigint generated always as identity primary key,
  client_id  uuid not null references public.profiles(id) on delete cascade,
  label      text not null,
  color      text not null default '#2a9df0',
  position   int not null default 0
);

-- ─── client_wins: milestones ────────────────────────────────────────────────
create table if not exists public.client_wins (
  id         bigint generated always as identity primary key,
  client_id  uuid not null references public.profiles(id) on delete cascade,
  label      text not null,
  meta       text not null default '',
  color      text not null default '#77d770',
  position   int not null default 0
);

-- ─── client_messages: the "between sessions" thread ────────────────────────
create table if not exists public.client_messages (
  id         bigint generated always as identity primary key,
  client_id  uuid not null references public.profiles(id) on delete cascade,
  sender     text not null default 'coach',  -- 'coach' | 'client'
  body       text not null,
  created_at timestamptz not null default now()
);

-- ─── RLS ────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'client_dashboard','client_cores','client_tasks','client_notes',
    'client_metrics','client_resources','client_wins','client_messages'
  ]
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

-- ─── Seed: Tyler Fortenberry's starting data ───────────────────────────────
-- Replace 'client@example.com' with Tyler Fortenberry's actual sign-in email,
-- then run this block once his profiles row exists (i.e. after he's signed
-- in / been invited at least once). Safe to re-run — it upserts.
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
--   insert into public.client_dashboard
--     (client_id, route, week_now, week_total, streak_weeks, adherence_pct,
--      flag_status, flag_color, next_session_label, next_session_agenda,
--      reminder_day, reminder_channel, reminder_on, adherence_history)
--   values
--     (cid, 'The 10K', 1, 26, 0, 0, 'On track', '#77d770', '', '',
--      'Tuesday', 'text', true, '{}')
--   on conflict (client_id) do nothing;
--
--   insert into public.client_cores (client_id, core_key, label, color, pct, note, position) values
--     (cid, 'body',   'Body',   '#77d770', 0, '', 1),
--     (cid, 'mind',   'Mind',   '#2a9df0', 0, '', 2),
--     (cid, 'art',    'Art',    '#ffbd59', 0, '', 3),
--     (cid, 'soul',   'Soul',   '#aa70d7', 0, '', 4),
--     (cid, 'career', 'Career', '#f02348', 0, '', 5),
--     (cid, 'life',   'Life',   '#f58b1c', 0, '', 6)
--   on conflict (client_id, core_key) do nothing;
-- end $$;
