-- Run this once in the Supabase SQL editor, AFTER client_portal_alpha.sql
-- (depends on public.is_coach(uuid), public.set_updated_at() and
-- public.client_assignments). Safe to re-run.
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

-- Week + code (e.g. B.1 = Body, Week 1). `week` is set by the coach; `code` is
-- built from the core's first letter and the week, so it can never drift.
-- Never write `code` directly — it is a generated column.
alter table public.assignment_library
  add column if not exists week int check (week is null or (week between 1 and 99));

alter table public.assignment_library
  add column if not exists code text generated always as (
    case
      when week is null then ''
      when core_key = '' then 'W.' || week::text
      else upper(left(core_key, 1)) || '.' || week::text
    end
  ) stored;

create index if not exists assignment_library_week_idx
  on public.assignment_library (week, core_key);

-- Editor sections. Each assignment is written as:
--   RELEVANCE       -> relevance       why this matters for the client
--   OUTCOME         -> outcome         what they walk away with
--   TO DO           -> instructions    the steps (existing column)
--   IMPLEMENTATION  -> implementation  how to put it into practice
--   ALTERNATIVE     -> alternative     another way to do it
--   EXAMPLES        -> examples        examples / links
-- When assigned, the filled-in sections are combined, in that order and under
-- those headings, into the client's homework instructions. Notion / Markdown
-- keep them as "## Relevance", "## To Do", … headings in the page body.
alter table public.assignment_library add column if not exists relevance      text not null default '';
alter table public.assignment_library add column if not exists outcome        text not null default '';
alter table public.assignment_library add column if not exists implementation text not null default '';
alter table public.assignment_library add column if not exists alternative    text not null default '';
alter table public.assignment_library add column if not exists examples       text not null default '';

-- Articles: category "Article" adds an "A" after the core letter, so a Body
-- article is BA (BA.2 if it also has a week). Generated columns can't be
-- altered in place, so drop and re-add `code` with the new rule.
alter table public.assignment_library drop column if exists code;
alter table public.assignment_library
  add column code text generated always as (
    case
      when week is null and lower(btrim(category)) not in ('article', 'articles') then ''
      else
        (case when core_key = '' then 'W' else upper(left(core_key, 1)) end)
        || (case when lower(btrim(category)) in ('article', 'articles') then 'A' else '' end)
        || (case when week is null then '' else '.' || week::text end)
    end
  ) stored;
