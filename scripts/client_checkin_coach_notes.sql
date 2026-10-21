-- Run this once in the Supabase SQL editor, AFTER client_portal_alpha.sql.
-- Safe to re-run.
--
-- Coach side of the weekly check-in (client-portal Check-ins tab):
--   • coach_todos — my to-dos for the call, shown next to the client's
--                   coaching_call_objective.
--   • coach_wins  — wins to celebrate since the last check-in.
--
-- The coach can start a check-in before the client submits: that row has
-- source = 'coach' and an empty coaching_call_objective, and the client's
-- pre-call form fills it in (switching source to 'portal') rather than
-- adding a second row for the week. Existing insert/update policies from
-- client_portal_alpha.sql already let the coach write any client's rows.

alter table public.client_pre_call_submissions
  add column if not exists coach_todos text not null default '',
  add column if not exists coach_wins  text not null default '';
