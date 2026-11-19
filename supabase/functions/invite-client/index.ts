// Sends a client their Client Portal invitation (or re-sends it).
//
// Called from two places:
//   1. The coach roster in the portal (client-portal/portal.js → "Invite
//      client" / "Resend invite"). Auth = the coach's own Supabase session.
//   2. The CRM in the Chasing Change Dashboard (or any automation — Zapier,
//      a Notion button, etc.). Auth = either the coach's Supabase session,
//      when the dashboard is signed in to this project, or the shared secret
//      below in an `x-invite-secret` header for server-to-server calls.
//
// Request (POST JSON):
//   { email, full_name?, status?, redirect_to? }
//     email        required
//     full_name    optional; prefills the client's name (the portal's name
//                  step is skipped when it's set)
//     status       optional client_status for a NEW client (default
//                  "Onboarding"); an existing status is never overwritten
//     redirect_to  optional; where the invite link lands. Must be on the
//                  Supabase Auth → URL Configuration → Redirect URLs list.
//                  Defaults to PORTAL_URL, then the project's Site URL.
//
// Response (always 200 for app-level outcomes so callers can show the text):
//   { ok: true, result: "invited" | "resent" | "already_active", user_id, message }
//   { ok: false, error }
//
//   invited        new auth user created, invite email sent
//   resent         account existed but the client never set a password —
//                  a fresh invite (or, if Supabase refuses to re-invite a
//                  confirmed address, a "set your password" email) was sent
//   already_active the client already has a password; nothing was sent
//
// The email the client receives is Supabase's "Invite user" template
// (Authentication → Email Templates). The link lands on the portal with
// type=invite, which drops the client on the "Set your password" step.
//
// Secrets (Supabase sets SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY itself):
//   PORTAL_URL             e.g. https://chasingchange.co/client-portal/
//   INVITE_CLIENT_SECRET   optional; enables header auth for the CRM / Zapier
//
// Deploy:  supabase functions deploy invite-client
//          supabase secrets set PORTAL_URL=https://chasingchange.co/client-portal/
//          supabase secrets set INVITE_CLIENT_SECRET=<long random string>   (optional)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-invite-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STATUSES = ["Onboarding", "Core Client", "College Client", "Paused", "Graduated", "Terminated"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// Constant-time compare so the shared secret can't be guessed byte by byte.
function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Who's calling: the coach (session) or the CRM (shared secret) ──────
  const secret = Deno.env.get("INVITE_CLIENT_SECRET") ?? "";
  const headerSecret = req.headers.get("x-invite-secret") ?? "";
  let authorized = secret !== "" && safeEqual(headerSecret, secret);
  if (!authorized) {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const caller = userData?.user;
    if (!caller) return json({ ok: false, error: "not_signed_in" }, 401);
    const { data: isCoach } = await admin.rpc("is_coach", { uid: caller.id });
    if (!isCoach) return json({ ok: false, error: "Only the coach can invite clients." }, 403);
    authorized = true;
  }

  // ── Input ──────────────────────────────────────────────────────────────
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const fullName = String(body.full_name ?? body.name ?? "").trim().slice(0, 120);
  const status = STATUSES.includes(String(body.status ?? "")) ? String(body.status) : "Onboarding";
  const redirectTo = String(body.redirect_to ?? "").trim() || Deno.env.get("PORTAL_URL") || undefined;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: "Enter a valid email address." });

  // ── Existing account? ──────────────────────────────────────────────────
  const { data: existing } = await admin
    .from("profiles")
    .select("id, has_password, role, full_name")
    .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
    .maybeSingle();

  if (existing?.role === "coach") return json({ ok: false, error: "That email belongs to a coach account." });
  if (existing?.has_password) {
    return json({
      ok: true, result: "already_active", user_id: existing.id,
      message: "This client already has a portal account. They can sign in (or use “Forgot password?”) at the portal.",
    });
  }

  let userId: string | null = existing?.id ?? null;
  let result: "invited" | "resent" = existing ? "resent" : "invited";

  const invite = await admin.auth.admin.inviteUserByEmail(email, {
    data: fullName ? { full_name: fullName } : undefined,
    redirectTo,
  });

  if (invite.error) {
    // Supabase won't re-invite an address that's already confirmed (e.g. the
    // client clicked an earlier link but never set a password). Send them a
    // "set your password" (recovery) email instead — the portal handles both
    // the same way: it opens on the Set Password step.
    const already = /already|registered|exists/i.test(invite.error.message);
    if (!already) return json({ ok: false, error: invite.error.message });
    const { error: recErr } = await admin.auth.resetPasswordForEmail(email, { redirectTo });
    if (recErr) return json({ ok: false, error: recErr.message });
    result = "resent";
  } else {
    userId = invite.data.user?.id ?? userId;
  }

  // ── Profile + status bookkeeping (best-effort; missing tables are fine) ─
  if (userId) {
    const profile: Record<string, unknown> = { id: userId, email, invited_at: new Date().toISOString() };
    if (fullName && !existing?.full_name) profile.full_name = fullName;
    let up = await admin.from("profiles").upsert(profile, { onConflict: "id" });
    if (up.error && /invited_at/.test(up.error.message)) {
      // scripts/client_invites.sql not run yet — save without the timestamp.
      delete profile.invited_at;
      up = await admin.from("profiles").upsert(profile, { onConflict: "id" });
    }

    const { data: st } = await admin.from("client_status").select("status").eq("client_id", userId).maybeSingle();
    if (!st || !st.status) {
      await admin.from("client_status").upsert(
        { client_id: userId, status, updated_at: new Date().toISOString() },
        { onConflict: "client_id" },
      );
    }
  }

  return json({
    ok: true, result, user_id: userId,
    message: result === "invited"
      ? `Invitation sent to ${email}.`
      : `Invitation re-sent to ${email}.`,
  });
});
