-- Run this once in the Supabase SQL editor, AFTER client_portal_profile.sql
-- (this depends on public.is_coach(uuid)).
--
-- Backs the weekly training routine on the Body page
-- (client-portal/body/index.html): one row per client holding the split for
-- each day of the week (Push / Pull / Legs / Upper / Rest / …). The routine
-- repeats every week, so the Body page can show this week or next week from
-- the same row — that's the card clients screenshot and send to friends.
--
-- days:   7 entries, Monday first:
--           [{ "type":"push", "label":"Push", "time":"07:00", "duration":60, "notes":"" }, …]
--         type 'rest' (or an empty label) = rest day. time '' = no set time.
-- synced: the Google / Outlook series the portal's Calendar tab created from
--         this routine ("Sync routine"), so re-syncing replaces them instead
--         of piling up duplicates: { "google":["google:abc…"], "outlook":[…] }.

create table if not exists public.client_routines (
  client_id   uuid primary key references public.profiles(id) on delete cascade,
  days        jsonb not null default '[]'::jsonb,
  synced      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.client_routines enable row level security;

drop policy if exists "own or coach can select" on public.client_routines;
create policy "own or coach can select" on public.client_routines for select
  using (client_id = auth.uid() or public.is_coach(auth.uid()));

drop policy if exists "own or coach can insert" on public.client_routines;
create policy "own or coach can insert" on public.client_routines for insert
  with check (client_id = auth.uid() or public.is_coach(auth.uid()));

drop policy if exists "own or coach can update" on public.client_routines;
create policy "own or coach can update" on public.client_routines for update
  using (client_id = auth.uid() or public.is_coach(auth.uid()))
  with check (client_id = auth.uid() or public.is_coach(auth.uid()));

drop policy if exists "own or coach can delete" on public.client_routines;
create policy "own or coach can delete" on public.client_routines for delete
  using (client_id = auth.uid() or public.is_coach(auth.uid()));
