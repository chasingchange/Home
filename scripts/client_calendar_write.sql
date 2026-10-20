-- Run this once in the Supabase SQL editor, AFTER client_calendar_snapshot.sql.
--
-- Backs the redesigned Calendar tab (Week / Month / Agenda, add events, drag
-- to move, core colors). Calendar writes go straight to Google / Outlook from
-- the client's browser using the client's own token, so — like the rest of
-- the calendar tables — nothing here stores an OAuth token.
--
-- Scopes changed for write access (see CALENDAR_CONFIG in
-- client-portal/portal.js):
--   Google:    https://www.googleapis.com/auth/calendar.events (+ email)
--   Microsoft: Calendars.ReadWrite
-- Clients who connected before this change see "Reconnect Google/Outlook"
-- and have to click it once to grant the new permission.
--
-- Provider setup changes:
--   Google:  OAuth consent screen → Data access → add the
--            ".../auth/calendar.events" scope (it's a "sensitive" scope:
--            fine in Testing mode for listed test users; publishing the app
--            for everyone needs Google's verification).
--   Outlook: App registration → API permissions → Microsoft Graph →
--            Delegated → add "Calendars.ReadWrite".

-- ─── Portal-only metadata per event ──────────────────────────────────────
-- Core tag (body / mind / art / soul / career / life) and who created the
-- event from the portal. Never written to Google / Outlook. event_id is the
-- portal's id, e.g. 'google:abc123' or 'outlook:AAMk…'.
create table if not exists public.client_calendar_event_meta (
  id          bigint generated always as identity primary key,
  client_id   uuid not null references public.profiles(id) on delete cascade,
  provider    text not null,              -- 'google' | 'outlook'
  event_id    text not null,
  core        text,                        -- null = no core
  created_by  text,                        -- 'client' | 'coach' | null (not created in the portal)
  updated_at  timestamptz not null default now(),
  unique (client_id, event_id)
);

alter table public.client_calendar_event_meta enable row level security;

drop policy if exists "own or coach can select" on public.client_calendar_event_meta;
create policy "own or coach can select" on public.client_calendar_event_meta for select
  using (client_id = auth.uid() or public.is_coach(auth.uid()));

drop policy if exists "own or coach can insert" on public.client_calendar_event_meta;
create policy "own or coach can insert" on public.client_calendar_event_meta for insert
  with check (client_id = auth.uid() or public.is_coach(auth.uid()));

drop policy if exists "own or coach can update" on public.client_calendar_event_meta;
create policy "own or coach can update" on public.client_calendar_event_meta for update
  using (client_id = auth.uid() or public.is_coach(auth.uid()))
  with check (client_id = auth.uid() or public.is_coach(auth.uid()));

drop policy if exists "own or coach can delete" on public.client_calendar_event_meta;
create policy "own or coach can delete" on public.client_calendar_event_meta for delete
  using (client_id = auth.uid() or public.is_coach(auth.uid()));

-- ─── Coach edits waiting for the client's token ──────────────────────────
-- The coach never holds the client's calendar token, so when the coach adds,
-- moves or removes an event it's queued here. The next time the client's
-- portal has a live token (on load for Outlook, on Connect/Reconnect for
-- Google) it applies each op against the client's calendar, then deletes it.
--   op = 'create': event_id null; payload {title,start,end,joinUrl,core}
--   op = 'move':   event_id set;  payload {start,end,allDay}
--   op = 'delete': event_id set;  payload {}
create table if not exists public.client_calendar_pending_ops (
  id          bigint generated always as identity primary key,
  client_id   uuid not null references public.profiles(id) on delete cascade,
  provider    text not null,              -- 'google' | 'outlook'
  op          text not null check (op in ('create','move','delete')),
  event_id    text,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists client_calendar_pending_ops_client_idx
  on public.client_calendar_pending_ops (client_id, created_at);

alter table public.client_calendar_pending_ops enable row level security;

drop policy if exists "own or coach can select" on public.client_calendar_pending_ops;
create policy "own or coach can select" on public.client_calendar_pending_ops for select
  using (client_id = auth.uid() or public.is_coach(auth.uid()));

drop policy if exists "coach can insert" on public.client_calendar_pending_ops;
create policy "coach can insert" on public.client_calendar_pending_ops for insert
  with check (public.is_coach(auth.uid()));

drop policy if exists "coach can update" on public.client_calendar_pending_ops;
create policy "coach can update" on public.client_calendar_pending_ops for update
  using (public.is_coach(auth.uid()))
  with check (public.is_coach(auth.uid()));

-- The client deletes ops once applied; the coach deletes ops they undo.
drop policy if exists "own or coach can delete" on public.client_calendar_pending_ops;
create policy "own or coach can delete" on public.client_calendar_pending_ops for delete
  using (client_id = auth.uid() or public.is_coach(auth.uid()));
