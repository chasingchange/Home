-- Client portal: create a profiles row for every auth user automatically.
--
-- Why: the coach roster (client-portal/portal.js → loadRoster) lists people
-- from public.profiles. Until now a profiles row was only written when the
-- client finished signing in (set password → name step), so a client who was
-- invited / added in Supabase Auth but hadn't completed sign-in never showed
-- up on the coach dashboard, no matter how often it was refreshed.
--
-- This script:
--   1. Adds a trigger so every new auth.users row gets a profiles row
--      (email + any full_name passed in the invite metadata).
--   2. Backfills profiles rows for auth users that already exist without one.
--
-- has_password is left false/null, so the client is still asked to set a
-- password on first sign-in, and full_name stays empty unless the invite
-- supplied one, so the name step still runs. Safe to run more than once.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')), '')
  )
  on conflict (id) do update
    set email = coalesce(public.profiles.email, excluded.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Backfill: anyone already in auth.users with no profiles row.
insert into public.profiles (id, email, full_name)
select
  u.id,
  u.email,
  nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), '')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- Check: every auth user and whether the coach roster will list them.
-- (Roster hides role = 'coach' and the coach's own email.)
select u.email,
       p.id is not null           as has_profile,
       p.full_name,
       p.role,
       u.last_sign_in_at
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at desc;
