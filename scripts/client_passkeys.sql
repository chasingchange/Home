-- Run this once in the Supabase SQL editor.
--
-- Face ID / Touch ID sign-in for the Client Portal (passkeys / WebAuthn).
--
-- A passkey is a key pair that lives in the device's secure enclave (and,
-- on Apple devices, syncs through iCloud Keychain). The private half never
-- leaves the device; Face ID / Touch ID unlocks it. The portal only ever
-- stores the PUBLIC half here, which the passkey-auth Edge Function uses to
-- check the signature on each sign-in before it hands back a session.
--
-- Both tables have row level security on. Clients may list and remove their
-- own passkeys; only the Edge Function (service role) can add one or read
-- challenges.

create table if not exists public.client_passkeys (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  credential_id text not null unique,          -- base64url
  public_key    text not null,                 -- base64url COSE key
  counter       bigint not null default 0,
  transports    text[] not null default '{}',
  device_label  text not null default '',
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create index if not exists client_passkeys_user_idx on public.client_passkeys(user_id);

alter table public.client_passkeys enable row level security;
revoke all on public.client_passkeys from anon;
revoke insert, update on public.client_passkeys from authenticated;
grant select, delete on public.client_passkeys to authenticated;

drop policy if exists "own passkeys readable" on public.client_passkeys;
create policy "own passkeys readable" on public.client_passkeys
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "own passkeys removable" on public.client_passkeys;
create policy "own passkeys removable" on public.client_passkeys
  for delete to authenticated using (user_id = auth.uid());

-- One-time challenges, valid for five minutes. No policies: Edge Function only.
create table if not exists public.passkey_challenges (
  id         uuid primary key default gen_random_uuid(),
  challenge  text not null,
  user_id    uuid references auth.users(id) on delete cascade,  -- set for registration
  created_at timestamptz not null default now()
);

alter table public.passkey_challenges enable row level security;
revoke all on public.passkey_challenges from anon, authenticated;

-- ─── Deploying the Edge Function ──────────────────────────────────────────
--
--   supabase functions deploy passkey-auth --no-verify-jwt --project-ref datrgkjqwyfcbmtwwifm
--
-- Optional secrets (defaults shown):
--   PASSKEY_RP_ID    chasingchange.co
--   PASSKEY_ORIGINS  https://chasingchange.co,https://www.chasingchange.co
-- localhost / 127.0.0.1 are always accepted for local testing.
