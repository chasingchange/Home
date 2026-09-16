-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
-- Adds a per-client Trainerize link, shown as its own "Trainerize" tab in the
-- client portal (client-portal/index.html + portal.js) so clients can see
-- their Trainerize stats alongside the rest of their portal.

alter table public.client_dashboard
  add column if not exists trainerize_url text not null default '';

-- Set from the coach's "Edit portal" screen (Overview → Trainerize link),
-- which writes here via the existing client_dashboard upsert — no extra
-- policy needed beyond what client_dashboard already has.
