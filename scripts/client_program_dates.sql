-- Run this once in the Supabase SQL editor, AFTER client_dashboard_data.sql.
--
-- Onboarding + offboarding dates on client_dashboard. The coach sets these
-- in the portal editor; client-portal/portal.js (programTimeline) derives
-- everything else from them:
--
--   • week_now / week_total — weeks since onboarding, out of the weeks
--     between the two dates, so the week moves forward on its own.
--   • route — from the program length: up to 12 weeks is The 5K, up to
--     6 months is The 10K, longer is The Marathon.
--
-- route / week_now / week_total are still written on save as a snapshot,
-- and are what the portal falls back to while no dates are set.

alter table public.client_dashboard
  add column if not exists onboard_date  date,
  add column if not exists offboard_date date;
