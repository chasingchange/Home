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
