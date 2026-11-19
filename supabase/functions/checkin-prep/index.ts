// Receives "call prep" from the weekly Fathom review (the scheduled run that
// reads the last Fathom meeting with each client and lists what to bring up
// on the next call) and saves it to public.client_checkin_prep, where the
// portal shows it on that week's check-in — to the coach only.
//
// Auth: the CHECKIN_PREP_SECRET shared secret in an `x-prep-key` header
// (scheduled run, Zapier, etc.), or the coach's own Supabase session.
//
// Deploy:
//   supabase secrets set CHECKIN_PREP_SECRET=<long random string>
//   supabase functions deploy checkin-prep --no-verify-jwt
//
// ── Requests (POST JSON) ────────────────────────────────────────────────
//
// 1. List clients, so the run can match meeting attendees to clients:
//      { "action": "clients" }
//    → { ok: true, clients: [{ id, name, email }] }
//
// 2. Save prep (one item, or several as { "items": [ ... ] }):
//      {
//        "client_email":   "jane@example.com",    // or client_id, or client_name
//        "talking_points": "- Ask how the 5am workouts went\n- …",
//        "next_meeting_date": "2026-11-24",       // optional: date of the call this preps
//        "week_start":     "2026-11-23",          // optional: overrides next_meeting_date
//        "source_title":   "Jane x Tyler",        // optional: the Fathom meeting reviewed
//        "source_url":     "https://fathom.video/calls/…",
//        "source_date":    "2026-11-17"
//      }
//    Which week it lands on: week_start if given, else the week (Mon–Sun) of
//    next_meeting_date, else the current week (on Sat/Sun: the coming week),
//    in US Central time. Saving the same client + week again replaces it.
//    → { ok: true, results: [{ ok, client, week_start } | { ok: false, error, input }] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-prep-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const TZ = "America/Chicago";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ITEMS = 100;
const MAX_TEXT = 20000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// YYYY-MM-DD of "today" in the coach's time zone.
function todayLocal(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

// Monday of the week containing a YYYY-MM-DD date (date-only math in UTC).
function mondayOf(ymd: string): string {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function defaultWeek(): string {
  const t = new Date(todayLocal() + "T00:00:00Z");
  const dow = t.getUTCDay(); // 0 Sun … 6 Sat
  if (dow === 6) t.setUTCDate(t.getUTCDate() + 2);
  if (dow === 0) t.setUTCDate(t.getUTCDate() + 1);
  return mondayOf(t.toISOString().slice(0, 10));
}

function dateOnly(v: unknown): string | null {
  const s = String(v ?? "").trim().slice(0, 10);
  return DATE_RE.test(s) && !isNaN(Date.parse(s + "T00:00:00Z")) ? s : null;
}

type Client = { id: string; name: string; email: string };

function norm(s: string) { return s.toLowerCase().replace(/\s+/g, " ").trim(); }

function findClient(clients: Client[], item: Record<string, unknown>): Client | string {
  const id = String(item.client_id ?? "").trim();
  if (id) {
    if (!UUID_RE.test(id)) return "client_id isn't a valid id.";
    return clients.find((c) => c.id === id) ?? "No client with that client_id.";
  }
  const email = norm(String(item.client_email ?? ""));
  if (email) {
    const hit = clients.find((c) => norm(c.email) === email);
    if (hit) return hit;
  }
  const name = norm(String(item.client_name ?? ""));
  if (name) {
    let hits = clients.filter((c) => norm(c.name) === name);
    if (!hits.length) {
      const first = name.split(" ")[0];
      hits = clients.filter((c) => norm(c.name).split(" ")[0] === first);
    }
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return `More than one client matches "${item.client_name}" — send client_email or client_id.`;
  }
  return email || name ? "No client matches that email or name." : "Pass client_email, client_id or client_name.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Who's calling: the scheduled run (shared secret) or the coach ─────
  const secret = Deno.env.get("CHECKIN_PREP_SECRET") ?? "";
  if (!(secret !== "" && safeEqual(req.headers.get("x-prep-key") ?? "", secret))) {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const caller = userData?.user;
    if (!caller) return json({ ok: false, error: "not_authorized" }, 401);
    const { data: isCoach } = await admin.rpc("is_coach", { uid: caller.id });
    if (!isCoach) return json({ ok: false, error: "Only the coach can do this." }, 403);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ ok: false, error: "Send a JSON body." }, 400);

  const { data: rows, error: listErr } = await admin.from("profiles").select("id, full_name, email, role");
  if (listErr) return json({ ok: false, error: listErr.message }, 500);
  const clients: Client[] = (rows ?? [])
    .filter((p: { role?: string }) => p.role !== "coach")
    .map((p: { id: string; full_name?: string; email?: string }) => ({ id: p.id, name: p.full_name ?? "", email: p.email ?? "" }));

  if (body.action === "clients") return json({ ok: true, clients });

  const items: Record<string, unknown>[] = Array.isArray(body.items) ? body.items : [body];
  if (!items.length) return json({ ok: false, error: "Nothing to save." }, 400);
  if (items.length > MAX_ITEMS) return json({ ok: false, error: `At most ${MAX_ITEMS} items per call.` }, 400);

  const results = [];
  for (const item of items) {
    const input = { client_email: item.client_email, client_id: item.client_id, client_name: item.client_name };
    const text = String(item.talking_points ?? "").trim();
    if (!text) { results.push({ ok: false, error: "talking_points is empty.", input }); continue; }
    const client = findClient(clients, item);
    if (typeof client === "string") { results.push({ ok: false, error: client, input }); continue; }

    const ws = dateOnly(item.week_start);
    const meeting = dateOnly(item.next_meeting_date);
    const week = ws ? mondayOf(ws) : meeting ? mondayOf(meeting) : defaultWeek();
    const now = new Date().toISOString();
    const { error } = await admin.from("client_checkin_prep").upsert({
      client_id: client.id,
      week_start: week,
      talking_points: text.slice(0, MAX_TEXT),
      source_title: String(item.source_title ?? "").slice(0, 300),
      source_url: String(item.source_url ?? "").slice(0, 1000),
      source_date: dateOnly(item.source_date),
      generated_at: now,
      updated_at: now,
    }, { onConflict: "client_id,week_start" });
    results.push(error
      ? { ok: false, error: error.message, input }
      : { ok: true, client: client.name || client.email, client_id: client.id, week_start: week });
  }
  return json({ ok: results.every((r) => r.ok), results });
});
