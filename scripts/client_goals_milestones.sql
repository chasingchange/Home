-- Run this once in the Supabase SQL editor, AFTER goal_tab_migration.sql.
--
-- Backs the redesigned Goals tab on the client portal (client-portal/portal.js
-- → renderGoalsTab): every goal can now be broken into milestones the client
-- ticks off, and carry a note from the coach.
--
--   milestones  — ordered steps, as [{ "label": "Run 3 miles", "done": true }, …]
--   coach_note  — written by the coach, read-only for the client
--
-- Access is unchanged: the client_goals RLS policies already let the client
-- and the coach read and write the whole row.

alter table public.client_goals
  add column if not exists milestones jsonb not null default '[]'::jsonb,
  add column if not exists coach_note text  not null default '';
