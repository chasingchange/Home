-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
-- Lets the coach change a client's nickname (profiles.preferred_name) from
-- that client's portal — the same ✎ next to "Welcome to Your Race, …" that
-- the client uses for themselves.
--
-- Relies on public.is_coach(uuid) from scripts/client_portal_profile.sql
-- (a SECURITY DEFINER check, so this policy can't recurse on profiles).

drop policy if exists "Coaches can update client profiles" on public.profiles;
create policy "Coaches can update client profiles" on public.profiles
  for update
  using (public.is_coach(auth.uid()))
  with check (public.is_coach(auth.uid()));
