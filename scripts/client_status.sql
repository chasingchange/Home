-- Run this once in the Supabase SQL editor, AFTER client_portal_profile.sql
-- (depends on public.is_coach(uuid)). Safe to re-run.
--
-- A client's program status (Onboarding, Core Client, College Client,
-- Paused, Graduated, Terminated) — the same list the CRM in the Chasing
-- Change Dashboard uses. The coach can change it from the portal roster OR
-- from the CRM; the dashboard syncs the two whenever it's connected to the
-- portal (Clients tab → "Client Portal roster").
--
-- Kept in its own table instead of client_dashboard because clients can
-- write their own client_dashboard row. Here clients can only read theirs;
-- only the coach can change it.

create table if not exists public.client_status (
  client_id   uuid primary key references public.profiles(id) on delete cascade,
  status      text not null default ''
              check (status in ('', 'Onboarding', 'Core Client', 'College Client', 'Paused', 'Graduated', 'Terminated')),
  updated_at  timestamptz not null default now()
);

alter table public.client_status enable row level security;

drop policy if exists "read own status or coach" on public.client_status;
create policy "read own status or coach" on public.client_status for select
  using (client_id = auth.uid() or public.is_coach(auth.uid()));

drop policy if exists "coach writes status" on public.client_status;
create policy "coach writes status" on public.client_status for all
  using (public.is_coach(auth.uid()))
  with check (public.is_coach(auth.uid()));

grant select, insert, update, delete on public.client_status to authenticated;
