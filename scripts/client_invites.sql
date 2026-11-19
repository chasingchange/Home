-- Run once in the Supabase SQL editor, AFTER client_portal_profile.sql and
-- client_profiles_autocreate.sql. Safe to re-run.
--
-- Client invitations from the portal roster / the CRM go through the
-- invite-client Edge Function (supabase/functions/invite-client). This adds
-- the timestamp it stamps on each send, so the coach roster can show
-- "Invite sent Nov 19 · Resend" for clients who haven't set a password yet.
--
-- Also needed (one-time, in the Supabase dashboard):
--   • Authentication → URL Configuration → Redirect URLs: add the portal URL,
--     e.g. https://chasingchange.co/client-portal/ (and the dashboard's own
--     URL if the CRM passes redirect_to).
--   • Authentication → Email Templates → "Invite user": the email the client
--     receives. Keep {{ .ConfirmationURL }} as the button link.
--   • Deploy the function:
--       supabase functions deploy invite-client
--       supabase secrets set PORTAL_URL=https://chasingchange.co/client-portal/
--       supabase secrets set INVITE_CLIENT_SECRET=<long random string>   -- only for server-side CRM / Zapier calls

alter table public.profiles
  add column if not exists invited_at timestamptz;
