-- Run this once in the Supabase SQL editor, AFTER client_portal_alpha.sql,
-- client_todos.sql, assignment_library.sql, client_goals_milestones.sql and
-- client_program_dates.sql. Safe to re-run.
--
-- Backs "Import from Notion" on a client's portal (coach only), which ports a
-- client's Notion dashboard into the portal through the notion-client-import
-- Edge Function (supabase/functions/notion-client-import):
--
--   Notion "Assigned Homework"  → client_assignments
--       A row that links a Master Assignment page = an assignment (kind
--       'assignment', linked to assignment_library by notion_page_id).
--       A plain-text row = a to-do (kind 'todo').
--   Notion "Client Goals"       → client_goals (sub-items become milestones,
--                                 Quest is kept)
--   Onboarding Audit "Goal"     → client_goals, quest 'the_quest'
--   Pre Call Form homework      → attached to the matching assignment
--   Cook Book page / database   → client_cookbooks (shown on the Body page)
--
-- notion_page_id on each table makes re-running the import update rows in
-- place instead of duplicating them.

-- ─── Assignments + to-dos ────────────────────────────────────────────────
alter table public.client_assignments
  add column if not exists notion_page_id text;

create unique index if not exists client_assignments_notion_page_id_key
  on public.client_assignments (notion_page_id);

-- ─── Goals ───────────────────────────────────────────────────────────────
-- quest: '' | 'the_quest' | 'main' | 'side'  (Notion "Quest" select)
alter table public.client_goals
  add column if not exists notion_page_id text,
  add column if not exists quest text not null default '';

create unique index if not exists client_goals_notion_page_id_key
  on public.client_goals (notion_page_id);

-- ─── Where each client lives in Notion (filled in by the import) ────────
alter table public.client_dashboard
  add column if not exists notion_page_id text not null default '',   -- CRM "Current Clients" page
  add column if not exists notion_user_id text not null default '';   -- the client's Notion person (Client property)

-- ─── Cook Book (Body page) ───────────────────────────────────────────────
-- One per client. `blocks` is the cookbook as a simple, safe block list the
-- Body page renders (no HTML is stored):
--   { "t": "h1"|"h2"|"h3"|"p"|"quote"|"callout", "rt": [span…] }
--   { "t": "ul"|"ol"|"todo", "items": [{ "rt": [span…], "done"?: bool, "children"?: [block…] }] }
--   { "t": "table", "header": bool, "rows": [[ [span…], … ], …] }
--   { "t": "image", "path"?: "<client>/cookbook/…" | "url"?: "https://…", "caption"?: [span…] }
--   { "t": "divider" }
--   { "t": "toggle", "rt": [span…], "children": [block…] }
-- span = { "text": "…", "b"?: true, "i"?: true, "href"?: "https://…" }
create table if not exists public.client_cookbooks (
  client_id       uuid primary key references public.profiles(id) on delete cascade,
  title           text not null default 'Cook Book',
  blocks          jsonb not null default '[]',
  notion_page_id  text not null default '',
  notion_url      text not null default '',
  synced_at       timestamptz,
  updated_at      timestamptz not null default now()
);

drop trigger if exists client_cookbooks_set_updated_at on public.client_cookbooks;
create trigger client_cookbooks_set_updated_at
  before update on public.client_cookbooks
  for each row execute procedure public.set_updated_at();

alter table public.client_cookbooks enable row level security;

drop policy if exists "own or coach can read cookbook" on public.client_cookbooks;
create policy "own or coach can read cookbook" on public.client_cookbooks for select
  using (client_id = auth.uid() or public.is_coach(auth.uid()));

drop policy if exists "coach can write cookbook" on public.client_cookbooks;
create policy "coach can write cookbook" on public.client_cookbooks for all
  using (public.is_coach(auth.uid()))
  with check (public.is_coach(auth.uid()));

grant select, insert, update, delete on public.client_cookbooks to authenticated;
