-- Run this once in the Supabase SQL editor, AFTER client_portal_profile.sql
-- (depends on public.is_coach(uuid)). Safe to re-run.
--
-- The client's row in the Notion CRM ("Current Clients"), copied in by the
-- "Client details" step of Import from Notion
-- (supabase/functions/notion-client-import, action "crm").
--
-- Program dates go to client_dashboard.onboard_date / offboard_date (the
-- portal works out the week and route from them) and Client Status goes to
-- client_status. Everything else lands here. Coach only: clients can't read
-- or write this table.

create table if not exists public.client_crm (
  client_id      uuid primary key references public.profiles(id) on delete cascade,
  email          text not null default '',   -- CRM "Email" (may differ from their login)
  time_zone      text not null default '',   -- CRM "Time Zone" formula
  address        text not null default '',   -- rollup from the Onboarding Audit
  cores          text not null default '',   -- rollup "Core(s)", comma-separated
  weight         numeric,                    -- rollup "Weight" (at onboarding)
  goal_weight    numeric,                    -- rollup "Goal"
  notion_status  text not null default '',   -- CRM "Client Status", as Notion has it
  renewal        text not null default '',
  testimonial    text not null default '',
  case_study     text not null default '',
  notion_url     text not null default '',
  synced_at      timestamptz,
  updated_at     timestamptz not null default now()
);

alter table public.client_crm enable row level security;

drop policy if exists "coach manages crm" on public.client_crm;
create policy "coach manages crm" on public.client_crm for all
  using (public.is_coach(auth.uid()))
  with check (public.is_coach(auth.uid()));

grant select, insert, update, delete on public.client_crm to authenticated;
