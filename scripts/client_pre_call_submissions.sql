-- Run this once in the Supabase SQL editor, AFTER client_portal_profile.sql
-- (depends on public.is_coach(uuid)).
--
-- Pulls the coach's Notion "Client Pre Call Form" into the client portal:
-- clients fill that form out before each coaching call (objective, weight,
-- workout adherence, food tracking, homework, calendar upload, etc.), and
-- this table mirrors each submission so the client can see their own
-- history on their dashboard and the coach can see every client's.
--
-- This table is READ-ONLY from the portal's point of view — there is no
-- insert/update policy for regular users, only select. Rows are written by
-- a sync job (Notion API -> Supabase) running with the service role key,
-- which bypasses RLS entirely. See notes at the bottom of this file for
-- wiring that sync up.

create table if not exists public.client_pre_call_submissions (
  id                     bigint generated always as identity primary key,
  client_id              uuid references public.profiles(id) on delete cascade,
  notion_page_id         text not null unique,     -- Notion page id, used to dedupe on sync
  submitted_at           timestamptz not null,     -- Notion "Created time"
  status                 text not null default 'Not started',  -- Not started / In progress / Done
  coaching_call_objective text not null default '',
  current_weight         text not null default '',
  body_core              text not null default '', -- "Are you participating in the Body Core?" Yes/No
  tracked_food           text not null default '', -- Yes / No / Most Days / I've been instructed not to track
  missed_workouts        text not null default '', -- Yes/No
  obstacle               text not null default '', -- "What was the obstacle?"
  has_more_homework      text not null default '', -- Yes/No
  review_items           jsonb not null default '[]',  -- ["Homework","Next Week's Calendar"]
  workout_days           jsonb not null default '[]',  -- ["Push","Pull","Legs","Cardio"]
  text_url_upload        text not null default '', -- homework assignments pasted as text/URL
  url_upload             text not null default '',
  files                  jsonb not null default '[]',  -- [{ name, url }] for "Files & Media Upload Bin"
  calendar_upload        jsonb not null default '[]',  -- [{ name, url }] for the weekly calendar upload
  raw                    jsonb not null default '{}',  -- full Notion property payload, for anything not modeled above
  created_at             timestamptz not null default now()
);

create index if not exists client_pre_call_submissions_client_id_submitted_at_idx
  on public.client_pre_call_submissions (client_id, submitted_at desc);

alter table public.client_pre_call_submissions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'client_pre_call_submissions'
      and policyname = 'Clients can view their own pre-call submissions'
  ) then
    create policy "Clients can view their own pre-call submissions"
      on public.client_pre_call_submissions for select
      using (auth.uid() = client_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'client_pre_call_submissions'
      and policyname = 'Coaches can view all pre-call submissions'
  ) then
    create policy "Coaches can view all pre-call submissions"
      on public.client_pre_call_submissions for select
      using (public.is_coach(auth.uid()));
  end if;
end $$;

grant select on public.client_pre_call_submissions to authenticated;

-- ─── Wiring up the sync ─────────────────────────────────────────────────
-- Notion's "Client Name" field on the form is free text, not linked to a
-- Supabase user, so the sync job needs to resolve client_id itself —
-- typically by matching the submission's "Client Name" against
-- profiles.full_name (case-insensitive), falling back to leaving
-- client_id null (and flagging it) when no confident match is found so a
-- submission never silently attaches to the wrong client.
--
-- The sync job should, per Notion page in the "Client Pre Call Form"
-- database:
--   1. Look up notion_page_id in this table; skip rows already synced
--      whose Notion "last edited time" hasn't changed since.
--   2. Resolve client_id from the "Client Name " property.
--   3. Upsert (on conflict notion_page_id) the fields above using the
--      Supabase service role key (this table has no RLS insert policy for
--      anon/authenticated, so only the service role can write to it).
