-- One-off remediation for accounts stamped `has_password = true` by the
-- original unconditional backfill in client_portal_profile.sql (before it
-- was fixed to check auth.users.encrypted_password). Magic-link-only
-- clients — anyone who signed in via magic link and never actually set a
-- password — were incorrectly marked as already having one, so they were
-- never shown the "set a password" prompt.
--
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New
-- query) after re-running the fixed step 1 of client_portal_profile.sql.
--
-- Clears has_password back to false for any profile whose auth.users row
-- has no encrypted_password on file, so those clients get prompted to set
-- one on their next sign-in.
update public.profiles p
set has_password = false
from auth.users u
where u.id = p.id
  and u.encrypted_password is null
  and p.has_password = true;
