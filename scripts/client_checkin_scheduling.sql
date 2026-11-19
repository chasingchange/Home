-- Run this once in the Supabase SQL editor, AFTER client_checkin_coach_notes.sql.
--
-- Two per-client, per-week checkboxes on the coach's Check-in Notes page
-- (checkin-notes/):
--
--   calendar_reviewed  "Went over their calendar" — ticked by the coach.
--   next_scheduled     "Next meeting scheduled". NULL means "go by my
--                      calendar": the page ticks it when the coach's Google
--                      Calendar shows a meeting with that client after this
--                      week. true / false is the coach's own answer and wins
--                      over the calendar (clients get moved around).
--
-- Same table and policies as the Wins / Objectives notes, so nothing else
-- to set up.
alter table public.client_checkin_coach_notes
  add column if not exists calendar_reviewed boolean not null default false,
  add column if not exists next_scheduled    boolean;
