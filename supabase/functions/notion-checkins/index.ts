// Imports weekly check-ins from Notion into the portal. The Check-in Notes
// page (checkin-notes/import.js) calls this; the Notion token stays here and
// never reaches the browser. Only the coach (public.is_coach) can call it.
//
// Two Notion databases, two destinations:
//
//   "Client Pre Call Form"  → public.client_pre_call_submissions
//       One row per Notion page, keyed on notion_page_id, so running the
//       import again updates rows instead of duplicating them.
//         Client Name                          → client_id (matched by name)
//         Created                              → submitted_at
//         Status (To Do / Done)                → status (Submitted / Done)
//         Client Objective                     → coaching_call_objective
//         Weight                               → current_weight
//         Are you participating in the Body Core? → body_core
//         Tracked                              → tracked_food
//         Food tracking Obstacle               → obstacle
//         Did you upload Progress Photos…?     → progress_photos
//         Missed                               → missed_workouts
//         Reschedule (Push/Pull/Legs/…)        → workout_days
//         Review (Homework / Calendar)         → review_items
//         Homework (files)                     → files
//         Homework 2                           → text_url_upload
//         URL Upload Bin                       → url_upload
//         Calendar (files)                     → calendar_upload
//         Suggestions *Optional                → suggestions
//       Files uploaded to Notion are copied into the private client-uploads
//       bucket (Notion's file links expire after an hour).
//
//   "Check In"  → the coach's side of that client's week
//         📊 Client Canon (or Client)          → client_id (matched by name)
//         Check-In Time (else created time)    → week_start (Monday, US Central)
//         Wins                                 → client_checkin_coach_notes.wins
//         Tyler's Notes                        → client_checkin_coach_notes.coach_objectives
//         Talking Points                       → client_checkin_prep.talking_points
//       By default Notion text only fills fields that are still empty on the
//       site; pass overwrite: true to replace what's there.
//
// Clients are matched to profiles by full name or preferred name, then by
// first + last name, then by a unique first name. A pre-call row that matches
// no one is still saved, with client_id null, and comes back in `unmatched`
// (it gets attached on a later import once the name matches). A Check In row
// that matches no one is skipped and listed in `unmatched`.
//
// Actions (POST JSON, signed-in coach required):
//   { action: "status" } → { configured, databases: { precall, checkin } }
//   { action: "pull", source: "precall" | "checkin", since?: "YYYY-MM-DD",
//     cursor?, overwrite?, client_id? }
//     client_id (precall only) imports just that client's forms — the
//     portal's per-client "Import from Notion" uses it.
//     → { created, updated, unchanged, unmatched: [{ name, url }],
//         errors: [string], next_cursor }
//     Handles one page of 25 Notion rows; the caller loops while
//     next_cursor is set.
// App-level failures come back as 200 { error: "..." }.
//
// Secrets: NOTION_TOKEN (the same integration secret notion-assignments uses;
// share both databases with that integration in Notion: ••• → Connections).
// Optional: NOTION_PRECALL_DATABASE_ID, NOTION_CHECKIN_DATABASE_ID to point at
// other databases.
//
// Deploy:  supabase functions deploy notion-checkins

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const NOTION_VERSION = "2022-06-28";
const PAGE_SIZE = 25;
const TZ = "America/Chicago";
const UPLOAD_BUCKET = "client-uploads";
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const DEFAULT_DBS = {
  precall: "365a17b3a0bb8001aa88d797ae2f935b", // Client Pre Call Form
  checkin: "33ba17b3a0bb80d5bf90fba786fa015a", // Check In
};

// deno-lint-ignore no-explicit-any
type Json = any;
type Client = { id: string; names: string[] };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function normalizeId(raw: unknown): string {
  const m = String(raw ?? "").trim().replace(/-/g, "").match(/[0-9a-f]{32}/i);
  return m ? m[0].toLowerCase() : "";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function notion(path: string, init: { method?: string; body?: unknown } = {}): Promise<Json> {
  const token = Deno.env.get("NOTION_TOKEN") ?? "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch("https://api.notion.com/v1" + path, {
      method: init.method ?? "GET",
      headers: { Authorization: "Bearer " + token, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after") ?? "1");
      await sleep(Math.min(10, Math.max(1, wait)) * 1000);
      continue;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.message || `Notion request failed (${res.status})`);
      (err as Json).status = res.status;
      throw err;
    }
    return data;
  }
  throw new Error("Notion is rate-limiting requests — try again in a minute.");
}

// ─── Notion property readers ─────────────────────────────────────────────

function richText(rt: Json[] | undefined): string {
  return (rt ?? []).map((t: Json) => t.plain_text ?? "").join("");
}

// Exact name first, then case/space-insensitive ("Client Name " has a trailing space).
function prop(props: Json, ...names: string[]): Json | null {
  for (const n of names) if (props?.[n]) return props[n];
  const wanted = names.map((n) => n.trim().toLowerCase());
  for (const [key, value] of Object.entries(props ?? {})) {
    if (wanted.includes(key.trim().toLowerCase())) return value;
  }
  return null;
}

function text(p: Json): string {
  if (!p) return "";
  switch (p.type) {
    case "title": return richText(p.title).trim();
    case "rich_text": return richText(p.rich_text).trim();
    case "select": return p.select?.name ?? "";
    case "status": return p.status?.name ?? "";
    case "multi_select": return (p.multi_select ?? []).map((o: Json) => o.name).join(", ");
    case "number": return p.number == null ? "" : String(p.number);
    case "url": return p.url ?? "";
    case "email": return p.email ?? "";
    default: return "";
  }
}

function list(p: Json): string[] {
  if (!p) return [];
  if (p.type === "multi_select") return (p.multi_select ?? []).map((o: Json) => o.name).filter(Boolean);
  const t = text(p);
  return t ? [t] : [];
}

// ─── client matching ─────────────────────────────────────────────────────

function norm(s: string): string {
  return String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9' -]+/g, " ").replace(/\s+/g, " ").trim();
}

function matchClient(clients: Client[], raw: string): Client | null {
  const name = norm(raw);
  if (!name) return null;
  const unique = (hits: Client[]) => (hits.length === 1 ? hits[0] : null);
  const exact = clients.filter((c) => c.names.includes(name));
  if (exact.length) return unique(exact);
  const parts = name.split(" ");
  const first = parts[0], last = parts.length > 1 ? parts[parts.length - 1] : "";
  if (last) {
    const fl = clients.filter((c) => c.names.some((n) => {
      const p = n.split(" ");
      return p[0] === first && p.length > 1 && p[p.length - 1] === last;
    }));
    if (fl.length) return unique(fl);
  }
  return unique(clients.filter((c) => c.names.some((n) => n.split(" ")[0] === first)));
}

// ─── dates ───────────────────────────────────────────────────────────────

function localDay(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  // A date without a time ("2026-11-18") is already a calendar day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function mondayOf(ymd: string): string {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// ─── files ───────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
let storage: any = null;

function safeName(name: string): string {
  return String(name || "file").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120) || "file";
}

// Notion-hosted files are copied into client-uploads under the client's own
// folder (so they can open them too); already-copied files are reused.
async function importFiles(p: Json, folder: string, prev: Json[]): Promise<Json[]> {
  const out: Json[] = [];
  const files = p?.type === "files" ? (p.files ?? []) : [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const name = String(f.name || "File");
    if (f.type === "external") {
      if (f.external?.url) out.push({ name, url: f.external.url });
      continue;
    }
    if (f.type !== "file" || !f.file?.url) continue;
    const path = `${folder}/${i + 1}-${safeName(name)}`;
    const had = (prev ?? []).find((x: Json) => x && x.path === path);
    if (had) { out.push(had); continue; }
    try {
      const res = await fetch(f.file.url);
      if (!res.ok) continue;
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length > MAX_FILE_BYTES) continue;
      const type = (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim();
      const up = await storage.from(UPLOAD_BUCKET).upload(path, buf, { contentType: type, upsert: true });
      if (up.error) continue;
      out.push({ name, path, size: buf.length, uploaded_at: new Date().toISOString() });
    } catch {
      // Skip a file that can't be fetched; the rest of the row still imports.
    }
  }
  return out;
}

// ─── Pre Call Form → client_pre_call_submissions ─────────────────────────

// deno-lint-ignore no-explicit-any
async function importPreCall(admin: any, page: Json, clients: Client[], out: Json) {
  const props = page.properties ?? {};
  const pageId = normalizeId(page.id);
  const titleProp = Object.values(props).find((p: Json) => p?.type === "title");
  const name = text(titleProp);
  const client = matchClient(clients, name);

  const { data: existing } = await admin.from("client_pre_call_submissions")
    .select("id, client_id, status, files, calendar_upload").eq("notion_page_id", pageId).maybeSingle();

  const clientId = client?.id ?? existing?.client_id ?? null;
  if (!clientId) out.unmatched.push({ name: name || "(no name)", url: page.url ?? "" });

  const folder = `${clientId ?? "unmatched"}/notion/${pageId}`;
  const done = /^done$/i.test(text(prop(props, "Status")));
  const review = list(prop(props, "Review")).map((v) => (v === "Calendar" ? "Next Week's Calendar" : v));

  const row: Json = {
    client_id: clientId,
    notion_page_id: pageId,
    source: "notion",
    submitted_at: page.created_time,
    coaching_call_objective: text(prop(props, "Client Objective")),
    current_weight: text(prop(props, "Weight")),
    body_core: list(prop(props, "Are you participating in the Body Core?")).join(", "),
    tracked_food: list(prop(props, "Tracked")).join(", "),
    obstacle: text(prop(props, "Food tracking Obstacle")),
    progress_photos: list(prop(props, "Did you upload Progress Photos this week?")).join(", "),
    missed_workouts: list(prop(props, "Missed")).join(", "),
    workout_days: list(prop(props, "Reschedule")),
    review_items: review,
    text_url_upload: text(prop(props, "Homework 2")),
    url_upload: text(prop(props, "URL Upload Bin")),
    suggestions: text(prop(props, "Suggestions *Optional", "Suggestions")),
    files: await importFiles(prop(props, "Homework"), folder + "/homework", existing?.files ?? []),
    calendar_upload: await importFiles(prop(props, "Calendar"), folder + "/calendar", existing?.calendar_upload ?? []),
    raw: props,
  };
  // Marking it reviewed on the site sticks; Notion "Done" also counts.
  row.status = done ? "Done" : (existing?.status || "Submitted");

  if (existing) {
    const { error } = await admin.from("client_pre_call_submissions").update(row).eq("id", existing.id);
    if (error) throw new Error(error.message);
    out.updated++;
  } else {
    const { error } = await admin.from("client_pre_call_submissions").insert(row);
    if (error) throw new Error(error.message);
    out.created++;
  }
}

// ─── Check In → coach notes + call prep ──────────────────────────────────

const titleCache = new Map<string, string>();
async function pageTitle(id: string): Promise<string> {
  if (titleCache.has(id)) return titleCache.get(id)!;
  let t = "";
  try {
    const p = await notion(`/pages/${id}`);
    t = text(Object.values(p.properties ?? {}).find((x: Json) => x?.type === "title"));
  } catch { /* not shared with the integration */ }
  titleCache.set(id, t);
  return t;
}

// Fill a field from Notion: only when the site's copy is empty, unless overwriting.
function pick(current: string, incoming: string, overwrite: boolean): string {
  const cur = String(current ?? ""), inc = String(incoming ?? "").trim();
  if (!inc) return cur;
  return overwrite || !cur.trim() ? inc : cur;
}

// deno-lint-ignore no-explicit-any
async function importCheckIn(admin: any, page: Json, clients: Client[], overwrite: boolean, out: Json) {
  const props = page.properties ?? {};
  const rel = prop(props, "📊 Client Canon", "Client Canon");
  const names: string[] = [];
  for (const r of rel?.relation ?? []) names.push(await pageTitle(normalizeId(r.id)));
  for (const u of prop(props, "Client")?.people ?? []) names.push(u.name ?? "", u.person?.email ?? "");

  let client: Client | null = null;
  for (const n of names.filter(Boolean)) {
    const byEmail = clients.find((c) => c.names.includes("email:" + n.toLowerCase()));
    client = byEmail ?? matchClient(clients, n);
    if (client) break;
  }
  if (!client) {
    out.unmatched.push({ name: names.filter(Boolean)[0] || text(prop(props, "Solutions")) || "(no client set)", url: page.url ?? "" });
    return;
  }

  const when = prop(props, "Check-In Time")?.date?.start || page.created_time;
  const week = mondayOf(localDay(when));
  const wins = text(prop(props, "Wins"));
  const objectives = text(prop(props, "Tyler's Notes", "Tylers Notes", "Coach's Objectives"));
  const talking = text(prop(props, "Talking Points"));
  let touched = false, created = false;

  if (wins || objectives) {
    const { data: cur } = await admin.from("client_checkin_coach_notes")
      .select("id, wins, coach_objectives").eq("client_id", client.id).eq("week_start", week).maybeSingle();
    const next = {
      wins: pick(cur?.wins ?? "", wins, overwrite),
      coach_objectives: pick(cur?.coach_objectives ?? "", objectives, overwrite),
    };
    if (!cur || next.wins !== cur.wins || next.coach_objectives !== cur.coach_objectives) {
      const { error } = await admin.from("client_checkin_coach_notes").upsert(
        { client_id: client.id, week_start: week, ...next, updated_at: new Date().toISOString() },
        { onConflict: "client_id,week_start" },
      );
      if (error) throw new Error(error.message);
      touched = true; created = created || !cur;
    }
  }

  if (talking) {
    const { data: cur } = await admin.from("client_checkin_prep")
      .select("id, talking_points").eq("client_id", client.id).eq("week_start", week).maybeSingle();
    const tp = pick(cur?.talking_points ?? "", talking, overwrite);
    if (!cur || tp !== cur.talking_points) {
      const row: Json = { client_id: client.id, week_start: week, talking_points: tp, updated_at: new Date().toISOString() };
      if (!cur || tp === talking) { row.source_title = "Notion Check In"; row.source_url = page.url ?? ""; }
      const { error } = await admin.from("client_checkin_prep").upsert(row, { onConflict: "client_id,week_start" });
      // Call prep is optional (scripts/client_checkin_prep.sql); say so once.
      if (error) {
        const msg = /client_checkin_prep/.test(error.message) ? "Talking Points skipped: run scripts/client_checkin_prep.sql first." : error.message;
        if (!out.errors.includes(msg)) out.errors.push(msg);
      } else {
        touched = true; created = created || !cur;
      }
    }
  }

  if (!touched) out.unchanged++;
  else if (created) out.created++;
  else out.updated++;
}

// ─── handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  storage = admin.storage;

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData } = await admin.auth.getUser(jwt);
  const user = userData?.user;
  if (!user) return json({ error: "not_signed_in" }, 401);
  const { data: isCoach } = await admin.rpc("is_coach", { uid: user.id });
  if (!isCoach) return json({ error: "Only the coach can import check-ins." }, 403);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const dbs = {
    precall: normalizeId(Deno.env.get("NOTION_PRECALL_DATABASE_ID")) || DEFAULT_DBS.precall,
    checkin: normalizeId(Deno.env.get("NOTION_CHECKIN_DATABASE_ID")) || DEFAULT_DBS.checkin,
  };
  const configured = !!Deno.env.get("NOTION_TOKEN");

  if (action === "status") return json({ configured, databases: dbs });
  if (action !== "pull") return json({ error: "Unknown action." });
  if (!configured) return json({ error: "NOTION_TOKEN is not set. Run: supabase secrets set NOTION_TOKEN=secret_…" });

  const source = body.source === "checkin" ? "checkin" : body.source === "precall" ? "precall" : "";
  if (!source) return json({ error: "source must be precall or checkin." });
  const since = /^\d{4}-\d{2}-\d{2}$/.test(String(body.since ?? "")) ? String(body.since) : "";
  const overwrite = body.overwrite === true;

  const { data: profiles, error: pErr } = await admin.from("profiles").select("id, full_name, preferred_name, email, role");
  if (pErr) return json({ error: pErr.message });
  const clients: Client[] = (profiles ?? []).filter((p: Json) => p.role !== "coach").map((p: Json) => ({
    id: p.id,
    names: [norm(p.full_name), norm(p.preferred_name), p.email ? "email:" + String(p.email).toLowerCase() : ""].filter(Boolean),
  }));

  const query: Json = { page_size: PAGE_SIZE, sorts: [{ timestamp: "created_time", direction: "ascending" }] };
  const filters: Json[] = [];
  if (since) filters.push({ timestamp: "created_time", created_time: { on_or_after: since } });

  // One client's pre-call forms: narrow by their first name in the title,
  // then only keep the rows that actually match them.
  let onlyClient = "";
  if (source === "precall" && body.client_id) {
    onlyClient = String(body.client_id);
    const me = clients.find((c) => c.id === onlyClient);
    const prof = (profiles ?? []).find((p: Json) => p.id === onlyClient);
    if (!me || !prof) return json({ error: "That client wasn't found." });
    const first = norm(prof.full_name || prof.preferred_name).split(" ")[0];
    if (first) {
      try {
        const db = await notion(`/databases/${dbs.precall}`);
        const titleName = Object.entries(db.properties ?? {}).find(([, p]) => (p as Json)?.type === "title")?.[0];
        if (titleName) filters.push({ property: titleName, title: { contains: first } });
      } catch { /* fall back to reading every row */ }
    }
  }
  if (filters.length === 1) query.filter = filters[0];
  else if (filters.length > 1) query.filter = { and: filters };
  if (body.cursor) query.start_cursor = String(body.cursor);

  let data: Json;
  try {
    data = await notion(`/databases/${dbs[source]}/query`, { method: "POST", body: query });
  } catch (e) {
    const status = (e as Json).status;
    const name = source === "precall" ? "Client Pre Call Form" : "Check In";
    if (status === 404) return json({ error: `Notion can't see the "${name}" database. In Notion, open it → ••• → Connections and add your integration.` });
    if (status === 401) return json({ error: "NOTION_TOKEN was rejected by Notion. Check the integration secret." });
    return json({ error: (e as Error).message });
  }

  const out: Json = { created: 0, updated: 0, unchanged: 0, unmatched: [], errors: [] };
  for (const page of data.results ?? []) {
    try {
      if (source === "precall") {
        if (onlyClient) {
          const name = text(Object.values(page.properties ?? {}).find((p: Json) => p?.type === "title"));
          if (matchClient(clients, name)?.id !== onlyClient) continue;
        }
        await importPreCall(admin, page, clients, out);
      }
      else await importCheckIn(admin, page, clients, overwrite, out);
    } catch (e) {
      out.errors.push(`${page.url ?? page.id}: ${(e as Error).message}`);
    }
  }
  out.next_cursor = data.has_more ? data.next_cursor : null;
  return json(out);
});
