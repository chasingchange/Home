// Keeps a client's Google Calendar connected between portal visits.
//
// The portal (client-portal/portal.js) gets a one-time authorization code
// from Google's popup and sends it here. This function swaps it for a
// refresh token, keeps that in public.client_google_tokens (no browser
// access — see scripts/client_google_tokens.sql), and from then on hands
// the portal a fresh hour-long access token whenever it asks. The refresh
// token itself never leaves the server.
//
// Actions (POST JSON, signed-in Supabase user required):
//   { action: "exchange", code }  → { access_token, expires_in, email }
//   { action: "token" }           → { access_token, expires_in, email }
//   { action: "disconnect" }      → { ok: true }
// App-level failures come back as 200 { error: "..." } so the portal can
// tell "function deployed, needs reconnect" from "function not deployed".
//
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are set by Supabase).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function googleToken(params: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID") ?? "",
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "",
      ...params,
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

async function googleEmail(accessToken: string) {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: "Bearer " + accessToken },
  });
  if (!res.ok) return "";
  const info = await res.json().catch(() => ({}));
  return info.email ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "not_signed_in" }, 401);
  const clientId = userData.user.id;

  const body = await req.json().catch(() => ({}));
  const action = body.action;

  if (action === "exchange") {
    if (!body.code) return json({ error: "missing_code" });
    // "postmessage" is the redirect URI for Google's popup code flow.
    const { ok, data } = await googleToken({ code: body.code, grant_type: "authorization_code", redirect_uri: "postmessage" });
    if (!ok || !data.access_token) return json({ error: data.error_description || data.error || "exchange_failed" });
    const scopes = String(data.scope ?? "").split(" ");
    if (!scopes.includes(CALENDAR_SCOPE)) {
      await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(data.access_token), { method: "POST" });
      return json({ error: "calendar_scope_missing" });
    }
    const email = await googleEmail(data.access_token);
    let refresh = data.refresh_token as string | undefined;
    if (!refresh) {
      // Google only issues a refresh token on a fresh approval. Reuse the
      // one we already have; if there isn't one, revoke this grant so the
      // next Connect shows the approval screen and issues one.
      const { data: row } = await admin.from("client_google_tokens").select("refresh_token").eq("client_id", clientId).maybeSingle();
      refresh = row?.refresh_token;
      if (!refresh) {
        await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(data.access_token), { method: "POST" });
        return json({ error: "no_refresh_token" });
      }
    }
    const { error } = await admin.from("client_google_tokens").upsert({
      client_id: clientId, refresh_token: refresh, account_email: email, scope: data.scope ?? "", updated_at: new Date().toISOString(),
    });
    if (error) return json({ error: "store_failed" });
    return json({ access_token: data.access_token, expires_in: data.expires_in ?? 3600, email });
  }

  if (action === "token") {
    const { data: row } = await admin.from("client_google_tokens").select("refresh_token, account_email").eq("client_id", clientId).maybeSingle();
    if (!row) return json({ error: "not_linked" });
    const { ok, data } = await googleToken({ refresh_token: row.refresh_token, grant_type: "refresh_token" });
    if (!ok || !data.access_token) {
      // invalid_grant = the client revoked access (or it expired): forget it.
      if (data.error === "invalid_grant") await admin.from("client_google_tokens").delete().eq("client_id", clientId);
      return json({ error: data.error === "invalid_grant" ? "not_linked" : "refresh_failed" });
    }
    return json({ access_token: data.access_token, expires_in: data.expires_in ?? 3600, email: row.account_email });
  }

  if (action === "disconnect") {
    const { data: row } = await admin.from("client_google_tokens").select("refresh_token").eq("client_id", clientId).maybeSingle();
    if (row) {
      await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(row.refresh_token), { method: "POST" }).catch(() => {});
      await admin.from("client_google_tokens").delete().eq("client_id", clientId);
    }
    return json({ ok: true });
  }

  return json({ error: "unknown_action" }, 400);
});
