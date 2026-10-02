-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
-- Turns on Supabase Realtime for the tables the coach's quick-edit popup
-- writes to, so an open client portal (client-portal/portal.js →
-- subscribePortalRealtime) refreshes the moment the coach changes cores,
-- tasks, habits, goals or the dashboard. Realtime still respects each table's RLS policies.

do $$
declare t text;
begin
  foreach t in array array['client_tasks','client_cores','client_dashboard','client_habits','client_goals'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
