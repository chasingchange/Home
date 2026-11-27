// Face ID / Touch ID sign-in (passkeys) for the Client Portal.
//
// The browser does the Face ID part; this function makes it a real sign-in:
// it issues one-time challenges, checks the device's signature against the
// stored public key, and only then mints a Supabase session for that user.
//
// Request (POST JSON) — { action, ... }
//   register-options   signed in   → WebAuthn creation options + challenge_id
//   register-verify    signed in   { challenge_id, response, device_label? }
//   login-options      anyone      → WebAuthn request options + challenge_id
//   login-verify       anyone      { challenge_id, response }
//                                  → { ok, token_hash, email }
//
// The portal turns token_hash into a session with
//   sb.auth.verifyOtp({ token_hash, type: "email" })
// (admin.generateLink makes the token; no email is sent).
//
// Tables: scripts/client_passkeys.sql
// Deploy: supabase functions deploy passkey-auth --no-verify-jwt
// Secrets (optional): PASSKEY_RP_ID, PASSKEY_ORIGINS (comma-separated)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "npm:@simplewebauthn/server@13.1.1";
import { isoBase64URL } from "npm:@simplewebauthn/server@13.1.1/helpers";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RP_NAME = "Chasing Change";
const RP_ID = Deno.env.get("PASSKEY_RP_ID") ?? "chasingchange.co";
const ORIGINS = (Deno.env.get("PASSKEY_ORIGINS") ?? "https://chasingchange.co,https://www.chasingchange.co")
  .split(",").map((s) => s.trim()).filter(Boolean);
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// Which relying party this request is for, from the page's Origin. Local
// dev pages get their own rpID ("localhost"); a passkey made there only
// works there, so it can't be used to reach anyone else's account.
function rpFor(req: Request): { origin: string; rpID: string } | null {
  const origin = req.headers.get("Origin") ?? "";
  if (ORIGINS.includes(origin)) return { origin, rpID: RP_ID };
  try {
    const u = new URL(origin);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return { origin, rpID: u.hostname };
  } catch { /* no / bad origin */ }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const rp = rpFor(req);
  if (!rp) return json({ ok: false, error: "origin_not_allowed" }, 403);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  // Expired challenges are swept on every call; there's never many.
  await admin.from("passkey_challenges").delete().lt("created_at", new Date(Date.now() - CHALLENGE_TTL_MS).toISOString());

  async function takeChallenge(id: string, userId: string | null) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { data } = await admin.from("passkey_challenges").delete().eq("id", id).select().maybeSingle();
    if (!data) return null;
    if ((data.user_id ?? null) !== userId) return null;
    if (Date.now() - new Date(data.created_at).getTime() > CHALLENGE_TTL_MS) return null;
    return data.challenge as string;
  }

  async function signedInUser() {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return null;
    const { data } = await admin.auth.getUser(jwt);
    return data?.user ?? null;
  }

  try {
    // ── Registration (adding Face ID to a signed-in account) ────────────
    if (action === "register-options" || action === "register-verify") {
      const user = await signedInUser();
      if (!user || !user.email) return json({ ok: false, error: "not_signed_in" }, 401);

      if (action === "register-options") {
        const { data: existing } = await admin.from("client_passkeys")
          .select("credential_id, transports").eq("user_id", user.id);
        const options = await generateRegistrationOptions({
          rpName: RP_NAME,
          rpID: rp.rpID,
          userName: user.email,
          userDisplayName: user.email,
          userID: new TextEncoder().encode(user.id),
          attestationType: "none",
          excludeCredentials: (existing ?? []).map((c) => ({ id: c.credential_id, transports: c.transports })),
          authenticatorSelection: { residentKey: "required", userVerification: "required" },
        });
        const { data: ch, error } = await admin.from("passkey_challenges")
          .insert({ challenge: options.challenge, user_id: user.id }).select("id").single();
        if (error) throw error;
        return json({ ok: true, challenge_id: ch.id, options });
      }

      const expectedChallenge = await takeChallenge(String(body.challenge_id ?? ""), user.id);
      if (!expectedChallenge) return json({ ok: false, error: "challenge_expired" });
      const v = await verifyRegistrationResponse({
        response: body.response,
        expectedChallenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        requireUserVerification: true,
      });
      if (!v.verified || !v.registrationInfo) return json({ ok: false, error: "not_verified" });
      const cred = v.registrationInfo.credential;
      const { error } = await admin.from("client_passkeys").upsert({
        user_id: user.id,
        credential_id: cred.id,
        public_key: isoBase64URL.fromBuffer(cred.publicKey),
        counter: cred.counter,
        transports: cred.transports ?? [],
        device_label: String(body.device_label ?? "").slice(0, 80),
      }, { onConflict: "credential_id" });
      if (error) throw error;
      return json({ ok: true });
    }

    // ── Sign-in (no email needed: the device picks the passkey) ─────────
    if (action === "login-options") {
      const options = await generateAuthenticationOptions({ rpID: rp.rpID, userVerification: "required" });
      const { data: ch, error } = await admin.from("passkey_challenges")
        .insert({ challenge: options.challenge }).select("id").single();
      if (error) throw error;
      return json({ ok: true, challenge_id: ch.id, options });
    }

    if (action === "login-verify") {
      const expectedChallenge = await takeChallenge(String(body.challenge_id ?? ""), null);
      if (!expectedChallenge) return json({ ok: false, error: "challenge_expired" });
      const credId = String(body.response?.id ?? "");
      const { data: row } = await admin.from("client_passkeys").select("*").eq("credential_id", credId).maybeSingle();
      if (!row) return json({ ok: false, error: "unknown_passkey" });

      const v = await verifyAuthenticationResponse({
        response: body.response,
        expectedChallenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        requireUserVerification: true,
        credential: {
          id: row.credential_id,
          publicKey: isoBase64URL.toBuffer(row.public_key),
          counter: Number(row.counter),
          transports: row.transports,
        },
      });
      if (!v.verified) return json({ ok: false, error: "not_verified" });

      await admin.from("client_passkeys")
        .update({ counter: v.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
        .eq("id", row.id);

      const { data: u, error: uErr } = await admin.auth.admin.getUserById(row.user_id);
      if (uErr || !u?.user?.email) return json({ ok: false, error: "account_missing" });
      const { data: link, error: lErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
      if (lErr || !link?.properties?.hashed_token) return json({ ok: false, error: lErr?.message ?? "session_failed" });
      return json({ ok: true, token_hash: link.properties.hashed_token, email: u.user.email });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message ?? "server_error" }, 500);
  }
});
