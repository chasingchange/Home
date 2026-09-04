-- Run this once in the Supabase SQL editor, AFTER client_portal_profile.sql
-- (depends on public.is_coach(uuid)).
--
-- Adds the Non-Negotiables workflow to the client portal:
--
--   The coach sets a client's non-negotiables. The client can claim one as
--   done, which moves it into "pending review" rather than closing it out.
--   The coach does the final review — approving moves it to the archive
--   (a permanent record of everything completed and confirmed), rejecting
--   sends it back to active so the client can re-claim it later.
--
-- Status lifecycle: active -> claimed -> archived
--                           <- (coach rejects) -
--
-- Access model matches every other client_* table: the client can read and
-- write their own row(s), the coach can read and write every client's.

create table if not exists public.client_nonnegotiables (
  id           bigint generated always as identity primary key,
  client_id    uuid not null references public.profiles(id) on delete cascade,
  label        text not null,
  status       text not null default 'active' check (status in ('active','claimed','archived')),
  position     int not null default 0,
  claimed_at   timestamptz,
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.client_nonnegotiables enable row level security;

drop policy if exists "own or coach can select" on public.client_nonnegotiables;
create policy "own or coach can select" on public.client_nonnegotiables for select
  using (client_id = auth.uid() or public.is_coach(auth.uid()));

drop policy if exists "own or coach can update" on public.client_nonnegotiables;
create policy "own or coach can update" on public.client_nonnegotiables for update
  using (client_id = auth.uid() or public.is_coach(auth.uid()))
  with check (client_id = auth.uid() or public.is_coach(auth.uid()));

drop policy if exists "own or coach can insert" on public.client_nonnegotiables;
create policy "own or coach can insert" on public.client_nonnegotiables for insert
  with check (client_id = auth.uid() or public.is_coach(auth.uid()));

drop policy if exists "coach can delete" on public.client_nonnegotiables;
create policy "coach can delete" on public.client_nonnegotiables for delete
  using (public.is_coach(auth.uid()));
