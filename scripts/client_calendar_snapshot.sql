-- Run this once in the Supabase SQL editor, AFTER client_calendar_connections.sql.
--
-- Lets the coach see a client's Calendar tab. Calendar OAuth tokens only
-- ever live in the client's own browser (see client_calendar_connections.sql),
-- so the coach can't fetch the client's events directly. Instead, each time
-- the client's browser loads their events it saves a copy here, and the
-- coach's view of that client's portal reads this copy (read-only).
--
-- No new policies needed: the existing "own or coach can select" policy lets
-- the coach read these columns, and "own can update" lets only the client
-- write them. Still no OAuth tokens are stored, just event titles, times and
-- join links for the next CAL_WINDOW_DAYS days.
alter table public.client_calendar_connections
  add column if not exists events    jsonb not null default '[]'::jsonb,
  add column if not exists synced_at timestamptz;
