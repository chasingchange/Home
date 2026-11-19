-- Adds the coach-only assignment statuses: In review, Overdue, On hold.
-- Run once in the Supabase SQL editor. Safe to re-run.
alter table public.client_assignments drop constraint if exists client_assignments_status_check;
alter table public.client_assignments add constraint client_assignments_status_check
  check (status in ('assigned','in_progress','submitted','review','needs_revision','overdue','on_hold','complete'));
