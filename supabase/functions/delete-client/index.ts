// Permanently deletes a client: their login, their profile, everything that
// hangs off the profile (goals, habits, assignments, check-ins, status,
// calendar links… all reference public.profiles ON DELETE CASCADE) and their
// files in storage.
//
// Called from two places, same auth as invite-client:
//   1. The coach roster in the portal (client-portal/portal.js → Edit →
//      "Delete client"). Auth = the coach's own Supabase session.
//   2. The CRM in the Chasing Change Dashboard (or Zapier, etc.). Auth = the
//      coach's session, or the INVITE_CLIENT_SECRET shared secret in an
//      `x-invite-secret` header for server-to-server calls.
//
// Request (POST JSON):   { client_id }   or   { email }
// Response (200 for app-level outcomes so callers can show the text):
//   { ok: true, result: "deleted" | "not_found", user_id?, message }
//   { ok: false, error }
//
// Coach accounts can never be deleted through this function.
//
// Deploy:  supabase functions deploy delete-client

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-invite-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Buckets whose objects live under "<client_id>/…".
const CLIENT_BUCKETS = ["client-uploads", "vision-boards"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// deno-lint-ignore no-explicit-any
async function removeFolder(admin: any, bucket: string, prefix: string) {
  // Walk the folder (one level of subfolders is plenty for these buckets)
  // and remove every object. Best-effort: a missing bucket is fine.
  const paths: string[] = [];
  const walk = async (dir: string, depth: number) => {
    const { data, error } = await admin.storage.from(bucket).list(dir, { limit: 1000 });
    if (error || !data) return;
    for (const item of data) {
      const path = `${dir}/${item.name}`;
      if (item.id === null && depth < 3) await walk(path, depth + 1); // folder
      else paths.push(path);
    }
  };
  await walk(prefix, 0);
  for (let i = 0; i < paths.length; i += 100) {
    await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
  }
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
  let callerId: string | null = null;
  if (!(secret !== "" && safeEqual(headerSecret, secret))) {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const caller = userData?.user;
    if (!caller) return json({ ok: false, error: "not_signed_in" }, 401);
    const { data: isCoach } = await admin.rpc("is_coach", { uid: caller.id });
    if (!isCoach) return json({ ok: false, error: "Only the coach can delete clients." }, 403);
    callerId = caller.id;
  }

  // ── Find the client ────────────────────────────────────────────────────
  const body = await req.json().catch(() => ({}));
  const clientId = String(body.client_id ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!clientId && !email) return json({ ok: false, error: "Pass client_id or email." });
  if (clientId && !UUID_RE.test(clientId)) return json({ ok: false, error: "client_id isn't a valid id." });

  let q = admin.from("profiles").select("id, email, full_name, role");
  q = clientId ? q.eq("id", clientId) : q.ilike("email", email.replace(/[\\%_]/g, "\\$&"));
  const { data: profile, error: findErr } = await q.maybeSingle();
  if (findErr) return json({ ok: false, error: findErr.message });

  let userId: string | null = profile?.id ?? (clientId || null);
  if (!profile && !userId) {
    // No profile row — the auth user may still exist (look it up by email).
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    userId = list?.users?.find((u: { email?: string }) => (u.email ?? "").toLowerCase() === email)?.id ?? null;
  }
  if (!userId) return json({ ok: true, result: "not_found", message: "No client with that email — nothing to delete." });

  if (profile?.role === "coach") return json({ ok: false, error: "That's a coach account — it can't be deleted here." });
  if (userId === callerId) return json({ ok: false, error: "You can't delete your own account." });
  const { data: targetIsCoach } = await admin.rpc("is_coach", { uid: userId });
  if (targetIsCoach) return json({ ok: false, error: "That's a coach account — it can't be deleted here." });

  // ── Delete: files, then profile (cascades to all client data), then login
  for (const bucket of CLIENT_BUCKETS) await removeFolder(admin, bucket, userId);

  const { error: profErr } = await admin.from("profiles").delete().eq("id", userId);
  if (profErr) return json({ ok: false, error: `Couldn't delete the client's data: ${profErr.message}` });

  const { error: authErr } = await admin.auth.admin.deleteUser(userId);
  if (authErr && !/not.?found/i.test(authErr.message)) {
    return json({ ok: false, error: `Their data was deleted, but the login wasn't: ${authErr.message}` });
  }

  const label = profile?.full_name || profile?.email || email || "Client";
  return json({ ok: true, result: "deleted", user_id: userId, message: `${label} was deleted.` });
});
