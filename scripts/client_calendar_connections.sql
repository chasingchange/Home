-- Run this once in the Supabase SQL editor, AFTER client_portal_profile.sql
-- (this depends on public.is_coach(uuid), defined there).
--
-- Backs the "Connect your calendar" card in the client portal. Only clients
-- connect and see their own calendar (not the coach) — see client-portal/
-- portal.js for the Google Calendar / Outlook OAuth flows.
--
-- The Next Session card's "Join call" button reads whichever connected
-- calendar(s) surface a video link (Google hangoutLink/conferenceData, or
-- Outlook onlineMeeting.joinUrl) on an event starting within the next 15
-- minutes or already underway. When nothing matches, the button falls back
-- to "Schedule a call" and opens Google Calendar's quick-add compose view
-- instead — see calJoinableMeeting() / renderSessionCTA() in portal.js.
--
-- IMPORTANT: this table never stores OAuth access or refresh tokens. Both
-- providers are wired up as browser-only OAuth (Google Identity Services'
-- token client, and MSAL.js for Microsoft) — the access token lives only in
-- the browser (memory / MSAL's own token cache) for the lifetime of the tab
-- or device, and is re-requested (silently where possible, otherwise via a
-- reconnect click) rather than persisted here. This table just remembers
-- which providers a client has connected and which account, so the portal
-- can render "Connected as you@gmail.com" / offer "Disconnect" across
-- reloads without holding any credential server-side.
create table if not exists public.client_calendar_connections (
  id            bigint generated always as identity primary key,
  client_id     uuid not null references public.profiles(id) on delete cascade,
  provider      text not null,            -- 'google' | 'outlook'
  connected     boolean not null default true,
  account_email text not null default '',
  connected_at  timestamptz not null default now(),
  unique (client_id, provider)
);

alter table public.client_calendar_connections enable row level security;

drop policy if exists "own or coach can select" on public.client_calendar_connections;
create policy "own or coach can select" on public.client_calendar_connections for select
  using (client_id = auth.uid() or public.is_coach(auth.uid()));

drop policy if exists "own can insert" on public.client_calendar_connections;
create policy "own can insert" on public.client_calendar_connections for insert
  with check (client_id = auth.uid());

drop policy if exists "own can update" on public.client_calendar_connections;
create policy "own can update" on public.client_calendar_connections for update
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

drop policy if exists "own can delete" on public.client_calendar_connections;
create policy "own can delete" on public.client_calendar_connections for delete
  using (client_id = auth.uid());

-- ─── Provider setup (do this before the "Connect" buttons will work) ──────
--
-- Google Calendar:
--   1. In Google Cloud Console, create (or reuse) a project → APIs & Services
--      → Credentials → Create Credentials → OAuth client ID → "Web application".
--   2. Add this portal's URL(s) (e.g. https://yourdomain.com) under
--      "Authorized JavaScript origins". No redirect URI is needed — the
--      portal uses Google Identity Services' token client (popup), not a
--      redirect flow.
--   3. Enable the "Google Calendar API" for the project.
--   4. Copy the Client ID into CALENDAR_CONFIG.googleClientId in
--      client-portal/portal.js.
--   5. While the OAuth consent screen is in "Testing" mode, add each client's
--      Google account as a test user, or publish the app for general use.
--
-- Outlook / Microsoft 365:
--   1. In the Azure Portal, Microsoft Entra ID → App registrations → New
--      registration.
--   2. Platform: "Single-page application (SPA)". Redirect URI: this
--      portal's URL (e.g. https://yourdomain.com/client-portal/).
--   3. API permissions → Microsoft Graph → Delegated → add "Calendars.Read".
--   4. No client secret is needed (SPA is a public client using PKCE).
--   5. Copy the Application (client) ID into
--      CALENDAR_CONFIG.microsoftClientId in client-portal/portal.js.
