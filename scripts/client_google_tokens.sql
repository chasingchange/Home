-- Run this once in the Supabase SQL editor, AFTER client_calendar_connections.sql.
--
-- Keeps Google Calendar connected between visits. Google's browser-only
-- sign-in hands out an access token that lasts one hour and can't be
-- renewed without a popup, so the portal used to ask clients to
-- "Reconnect Google" on nearly every visit. With this table and the
-- google-calendar-token Edge Function, the client approves once and the
-- function swaps a long-lived refresh token for a fresh access token
-- whenever the portal needs one — no popup.
--
-- The refresh token is a credential, so this table has row level security
-- turned on and NO policies: the browser can't read or write it at all.
-- Only the Edge Function (which uses the service role key) touches it.
create table if not exists public.client_google_tokens (
  client_id     uuid primary key references public.profiles(id) on delete cascade,
  refresh_token text not null,
  account_email text not null default '',
  scope         text not null default '',
  updated_at    timestamptz not null default now()
);

alter table public.client_google_tokens enable row level security;
revoke all on public.client_google_tokens from anon, authenticated;

-- ─── Deploying the Edge Function ──────────────────────────────────────────
--
-- 1. Google Cloud Console → APIs & Services → Credentials → the same OAuth
--    client the portal already uses (CALENDAR_CONFIG.googleClientId).
--    Copy its Client secret. No new redirect URI is needed: the popup code
--    flow uses the special "postmessage" redirect.
-- 2. Set the secrets (Supabase dashboard → Edge Functions → Secrets, or CLI):
--      supabase secrets set GOOGLE_CLIENT_ID=976458437286-ufpguk5m0aoa3ob8ghjhf1bvqih747h0.apps.googleusercontent.com
--      supabase secrets set GOOGLE_CLIENT_SECRET=<the client secret>
--    (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.)
-- 3. Deploy from the repo root:
--      supabase functions deploy google-calendar-token --project-ref datrgkjqwyfcbmtwwifm
-- 4. IMPORTANT: if the OAuth consent screen is still in "Testing", Google
--    expires refresh tokens after 7 days. Publish the app (OAuth consent
--    screen → Publish app) so the connection lasts until the client
--    disconnects or revokes it.
--
-- Until the function is deployed the portal falls back to the old browser-
-- only sign-in, but still remembers the hour-long token across reloads.
