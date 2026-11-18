-- Run this once in the Supabase SQL editor. Safe to re-run.
-- Needs public.is_coach(uuid) (client_portal_profile.sql). Everything else it
-- needs (set_updated_at() and the client_assignments table behind the
-- portal's Homework tab) is created here if it doesn't exist yet, with the
-- same definitions as client_portal_alpha.sql.
--
-- Backs the master Assignment Library (/assignment-library/):
--   - public.assignment_library  -> every reusable assignment template, in
--     one place. The coach writes/edits them in the library editor, imports
--     them from Notion (live sync through the notion-assignments Edge
--     Function, or a Notion "Markdown & CSV" export), and exports them back.
--   - client_assignments.library_id -> which template a client's homework
--     came from, so the library can show "assigned to N clients" and skip
--     duplicates when assigning in bulk.
--
-- Assigning a template COPIES its title / instructions / core into the
-- client's own client_assignments row, so later edits to the template never
-- rewrite homework a client is already working on.
--
-- Access: coach only. Clients never read the library directly — they only
-- see the copies in their own Homework tab.

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── Homework assignments (same as client_portal_alpha.sql) ─────────────
create table if not exists public.client_assignments (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.profiles(id) on delete cascade,
  title           text not null,
  instructions    text not null default '',
  core_key        text not null default '',
  due_date        date,
  status          text not null default 'assigned'
                  check (status in ('assigned','in_progress','submitted','needs_revision','complete')),
  client_note     text not null default '',
  coach_feedback  text not null default '',
  files           jsonb not null default '[]',
  submitted_at    timestamptz,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists client_assignments_client_id_idx
  on public.client_assignments (client_id, due_date);

drop trigger if exists client_assignments_set_updated_at on public.client_assignments;
create trigger client_assignments_set_updated_at
  before update on public.client_assignments
  for each row execute procedure public.set_updated_at();

alter table public.client_assignments enable row level security;

drop policy if exists "own or coach can select" on public.client_assignments;
create policy "own or coach can select" on public.client_assignments for select
  using (client_id = auth.uid() or public.is_coach(auth.uid()));

drop policy if exists "own or coach can update" on public.client_assignments;
create policy "own or coach can update" on public.client_assignments for update
  using (client_id = auth.uid() or public.is_coach(auth.uid()))
  with check (client_id = auth.uid() or public.is_coach(auth.uid()));

drop policy if exists "coach can insert" on public.client_assignments;
create policy "coach can insert" on public.client_assignments for insert
  with check (public.is_coach(auth.uid()));

drop policy if exists "coach can delete" on public.client_assignments;
create policy "coach can delete" on public.client_assignments for delete
  using (public.is_coach(auth.uid()));

grant select, insert, update, delete on public.client_assignments to authenticated;

-- ─── Assignment library ─────────────────────────────────────────────────
create table if not exists public.assignment_library (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  instructions      text not null default '',
  core_key          text not null default '',       -- body | mind | art | soul | career | life | ''
  category          text not null default '',       -- free-form grouping, e.g. "Onboarding", "Week 3"
  tags              text[] not null default '{}',
  default_due_days  int check (default_due_days is null or default_due_days >= 0),
  source            text not null default 'manual'
                    check (source in ('manual','notion','import')),
  notion_page_id    text unique,                    -- set once synced with Notion
  notion_url        text not null default '',
  notion_synced_at  timestamptz,
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists assignment_library_core_idx
  on public.assignment_library (core_key, title);

drop trigger if exists assignment_library_set_updated_at on public.assignment_library;
create trigger assignment_library_set_updated_at
  before update on public.assignment_library
  for each row execute procedure public.set_updated_at();

alter table public.assignment_library enable row level security;

drop policy if exists "coach can read library" on public.assignment_library;
create policy "coach can read library" on public.assignment_library for select
  using (public.is_coach(auth.uid()));

drop policy if exists "coach can write library" on public.assignment_library;
create policy "coach can write library" on public.assignment_library for all
  using (public.is_coach(auth.uid()))
  with check (public.is_coach(auth.uid()));

grant select, insert, update, delete on public.assignment_library to authenticated;

-- Link each client's homework back to the template it came from.
alter table public.client_assignments
  add column if not exists library_id uuid references public.assignment_library(id) on delete set null;

create index if not exists client_assignments_library_id_idx
  on public.client_assignments (library_id);
