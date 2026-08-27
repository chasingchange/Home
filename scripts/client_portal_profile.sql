-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
-- Supports two client-portal features:
--   1. First-time name capture (Welcome to Your Race, [First Name]).
--   2. "You don't have a password yet — set one" prompt for OTP/invite-only
--      accounts, plus the invite / forgot-password flows.
--
-- Adjust "public.profiles" if your profiles table lives elsewhere or already
-- has a different primary key / column set — this only adds what's missing.

-- 1. Track whether the user has ever set a password.
--    New rows default to false (prompt them); existing rows are backfilled
--    to true below on the assumption your current clients already sign in
--    with a password. Remove that backfill line if that assumption is wrong
--    for your data — anyone left at false will just be asked to set one on
--    their next sign-in, which is harmless.
alter table public.profiles
  add column if not exists has_password boolean not null default false;

update public.profiles set has_password = true;

-- 2. Make sure signed-in users can read and update their OWN profile row
--    (needed for the name-capture step and the has_password self-heal).
--    Skip any of these that you already have equivalent policies for.
alter table public.profiles enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'Users can view their own profile') then
    create policy "Users can view their own profile" on public.profiles for select using (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'Users can update their own profile') then
    create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'Users can insert their own profile') then
    create policy "Users can insert their own profile" on public.profiles for insert with check (auth.uid() = id);
  end if;
end $$;

-- 3. For the "Forgot password?" email link and the invite email to land back
--    on the portal correctly, add this site's client-portal URL (both the
--    exact page and, if you use it, a wildcard) to
--    Supabase → Authentication → URL Configuration → Redirect URLs.

-- 4. Fix "infinite recursion detected in policy for relation profiles".
--    This happens when a policy on public.profiles (commonly a "coaches/
--    admins can view all profiles" policy added by hand in the Supabase
--    dashboard) checks the caller's role by querying public.profiles
--    itself, e.g.:
--      using (exists (
--        select 1 from public.profiles where id = auth.uid() and role = 'coach'
--      ))
--    Postgres has to re-run the profiles SELECT policy to evaluate that
--    subquery, which re-runs the same policy again, forever.
--
--    The fix is to read the caller's role through a SECURITY DEFINER
--    function, which runs with the function owner's privileges and so
--    bypasses RLS on profiles instead of re-triggering it.

create or replace function public.is_coach(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = uid and role = 'coach'
  );
$$;

grant execute on function public.is_coach(uuid) to authenticated;

-- Drop any existing self-referencing "coach"/"admin" policy on profiles
-- before re-creating it — adjust the name(s) below to match whatever shows
-- up in Supabase → Authentication → Policies for the profiles table.
drop policy if exists "Coaches can view all profiles" on public.profiles;
drop policy if exists "Admins can view all profiles" on public.profiles;

create policy "Coaches can view all profiles" on public.profiles
  for select using (public.is_coach(auth.uid()));
