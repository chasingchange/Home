-- General to-dos on the To Do's tab (client portal).
-- Run once in the Supabase SQL editor, AFTER client_portal_alpha.sql and
-- client_habits.sql. Safe to re-run.
--
-- A to-do is a lightweight row in client_assignments: just a title, an
-- optional core ('' = general) and an optional due date. The client ticks it
-- off — no submission or review. The coach can turn any to-do into a habit:
-- that marks the to-do complete and adds a client_habits row; habit_id
-- remembers which habit it became.

alter table public.client_assignments
  add column if not exists kind text not null default 'assignment';

alter table public.client_assignments drop constraint if exists client_assignments_kind_check;
alter table public.client_assignments add constraint client_assignments_kind_check
  check (kind in ('assignment','todo'));

alter table public.client_assignments
  add column if not exists habit_id bigint references public.client_habits(id) on delete set null;
