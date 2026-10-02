-- Run this once in the Supabase SQL editor, AFTER client_portal_profile.sql,
-- client_dashboard_data.sql, client_pre_call_submissions.sql and
-- goal_tab_migration.sql (depends on public.is_coach(uuid) and the tables
-- those create). Safe to re-run.
--
-- Backs the client-portal alpha features:
--   - Homework tab        -> public.client_assignments
--   - Education tab       -> public.education_questions (one shared curriculum,
--                            organized core -> competency -> question; clients
--                            answer verbally on calls, so no answers are stored)
--   - Check-ins tab       -> clients can now submit the weekly pre-call form
--                            straight from the portal (public.client_pre_call_submissions)
--   - Goals tab           -> progress % on public.client_goals
--   - File uploads        -> private storage bucket "client-uploads"
--
-- Access model matches the rest of the portal: a client reads/writes their
-- own rows, the coach reads/writes everyone's. Only the coach can create or
-- delete assignments (clients update status, notes, uploads). The education
-- curriculum is readable by every signed-in user and editable only by the
-- coach.

-- ─── Homework assignments ────────────────────────────────────────────────
create table if not exists public.client_assignments (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.profiles(id) on delete cascade,
  title           text not null,
  instructions    text not null default '',
  core_key        text not null default '',       -- body | mind | art | soul | career | life | ''
  due_date        date,
  status          text not null default 'assigned'
                  check (status in ('assigned','in_progress','submitted','needs_revision','complete')),
  client_note     text not null default '',       -- the client's written response / submission note
  coach_feedback  text not null default '',
  files           jsonb not null default '[]',    -- [{ name, path, size, uploaded_at }] in bucket client-uploads
  submitted_at    timestamptz,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists client_assignments_client_id_idx
  on public.client_assignments (client_id, due_date);

-- ─── Education curriculum (shared by every client) ───────────────────────
create table if not exists public.education_questions (
  id          uuid primary key default gen_random_uuid(),
  core_key    text not null,                  -- body | mind | art | soul | career | life
  competency  text not null default '',       -- competency the question builds, e.g. "Protein basics"
  question    text not null,
  position    int not null default 0,         -- order within the core
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists education_questions_core_idx
  on public.education_questions (core_key, position);

-- updated_at triggers (set_updated_at() is defined in goal_tab_migration.sql;
-- redefined here so this file also works on its own)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists client_assignments_set_updated_at on public.client_assignments;
create trigger client_assignments_set_updated_at
  before update on public.client_assignments
  for each row execute procedure public.set_updated_at();

drop trigger if exists education_questions_set_updated_at on public.education_questions;
create trigger education_questions_set_updated_at
  before update on public.education_questions
  for each row execute procedure public.set_updated_at();

-- RLS (assignments): own or coach can select/update; only the coach inserts/deletes.
do $$
declare
  t text;
begin
  foreach t in array array['client_assignments']
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "own or coach can select" on public.%I', t);
    execute format(
      'create policy "own or coach can select" on public.%I for select
         using (client_id = auth.uid() or public.is_coach(auth.uid()))', t);

    execute format('drop policy if exists "own or coach can update" on public.%I', t);
    execute format(
      'create policy "own or coach can update" on public.%I for update
         using (client_id = auth.uid() or public.is_coach(auth.uid()))
         with check (client_id = auth.uid() or public.is_coach(auth.uid()))', t);

    execute format('drop policy if exists "coach can insert" on public.%I', t);
    execute format(
      'create policy "coach can insert" on public.%I for insert
         with check (public.is_coach(auth.uid()))', t);

    execute format('drop policy if exists "coach can delete" on public.%I', t);
    execute format(
      'create policy "coach can delete" on public.%I for delete
         using (public.is_coach(auth.uid()))', t);

    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- RLS (curriculum): any signed-in user reads; only the coach writes.
alter table public.education_questions enable row level security;

drop policy if exists "signed in can read curriculum" on public.education_questions;
create policy "signed in can read curriculum" on public.education_questions for select
  using (auth.uid() is not null);

drop policy if exists "coach can write curriculum" on public.education_questions;
create policy "coach can write curriculum" on public.education_questions for all
  using (public.is_coach(auth.uid()))
  with check (public.is_coach(auth.uid()));

grant select, insert, update, delete on public.education_questions to authenticated;

-- ─── Weekly pre-call form submitted from the portal ──────────────────────
-- Notion-synced rows keep their notion_page_id; portal submissions have none.
alter table public.client_pre_call_submissions
  alter column notion_page_id drop not null;

alter table public.client_pre_call_submissions
  add column if not exists source text not null default 'notion';   -- 'notion' | 'portal'

drop policy if exists "Clients can submit their own pre-call form" on public.client_pre_call_submissions;
create policy "Clients can submit their own pre-call form"
  on public.client_pre_call_submissions for insert
  with check (client_id = auth.uid() or public.is_coach(auth.uid()));

drop policy if exists "Own or coach can update pre-call submissions" on public.client_pre_call_submissions;
create policy "Own or coach can update pre-call submissions"
  on public.client_pre_call_submissions for update
  using (client_id = auth.uid() or public.is_coach(auth.uid()))
  with check (client_id = auth.uid() or public.is_coach(auth.uid()));

grant insert, update on public.client_pre_call_submissions to authenticated;

-- ─── Goal progress ───────────────────────────────────────────────────────
-- status now uses: not_started | in_progress | on_hold | achieved
-- (legacy 'active' rows are shown as in_progress by the portal).
alter table public.client_goals
  add column if not exists progress int not null default 0;

-- ─── Private bucket for homework + check-in uploads ──────────────────────
-- Paths: "<client_id>/homework/<assignment_id>/<file>" and
--        "<client_id>/check-ins/<timestamp>/<file>".
-- Private: the portal reads files through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit)
values ('client-uploads', 'client-uploads', false, 26214400)
on conflict (id) do update set
  public = false,
  file_size_limit = 26214400;

drop policy if exists "client uploads own or coach read" on storage.objects;
create policy "client uploads own or coach read" on storage.objects for select
  using (
    bucket_id = 'client-uploads'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_coach(auth.uid()))
  );

drop policy if exists "client uploads own or coach insert" on storage.objects;
create policy "client uploads own or coach insert" on storage.objects for insert
  with check (
    bucket_id = 'client-uploads'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_coach(auth.uid()))
  );

drop policy if exists "client uploads own or coach update" on storage.objects;
create policy "client uploads own or coach update" on storage.objects for update
  using (
    bucket_id = 'client-uploads'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_coach(auth.uid()))
  )
  with check (
    bucket_id = 'client-uploads'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_coach(auth.uid()))
  );

drop policy if exists "client uploads own or coach delete" on storage.objects;
create policy "client uploads own or coach delete" on storage.objects for delete
  using (
    bucket_id = 'client-uploads'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_coach(auth.uid()))
  );
