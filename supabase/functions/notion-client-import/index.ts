// Ports one client's Notion dashboard into the client portal. The coach runs
// it from that client's portal ("Import from Notion", client-portal/
// notion-import.js); the Notion token stays here. Coach only.
//
// The import runs in steps, one call each, so no call runs long:
//
//   link      Finds the client in Notion and remembers it on client_dashboard:
//             their CRM page ("Current Clients", matched by email, then name),
//             their Notion person (the "Client" property on the shared
//             Homework / Goals databases), the Chasing Change Dashboard and
//             the Cook Book on it, and their Onboarding Audit.
//             Also fills program dates (CRM "Chasing Change Dates") and
//             cardio goal / preferred cardio (Onboarding Audit) when empty.
//   homework  Notion "Assigned Homework" rows for that person →
//             client_assignments. A row that links a Master Assignment page
//             is an ASSIGNMENT (linked to assignment_library by its Notion
//             page, with the library's instructions); a plain-text row is a
//             TO-DO (kind 'todo'). Status and due date carry over.
//   goals     Notion "Client Goals" rows for that person → client_goals.
//             Sub-items become the goal's milestones; Core, Status and Quest
//             carry over; "by <date>" in the goal sets its target date. The
//             Onboarding Audit "Goal" comes in as The Quest.
//   uploads   Homework the client uploaded on past pre-call forms (already
//             imported by notion-checkins) is attached to the assignment it
//             belongs to, matched on file name / first line + due date.
//   cookbook  The Cook Book page (or database) → client_cookbooks, shown on
//             the client's Body page. Images are copied into client-uploads.
//   cover     The cover photo on their Notion dashboard (or, failing that,
//             their CRM page) → the banner on their portal dashboard. The
//             image is copied into the vision-boards bucket. A banner already
//             set in the portal is kept unless overwrite is on.
//
// Every step is safe to re-run: rows are keyed on their Notion page id. By
// default a re-run leaves status / milestones the coach or client already
// changed on the site alone; pass overwrite: true to take Notion's again.
//
// Actions (POST JSON, signed-in coach required):
//   { action: "status" }                                → { configured }
//   { action: "link", client_id }                       → { link, notes }
//   { action: "homework"|"goals"|"uploads"|"cookbook"|"cover", client_id, overwrite? }
//                                                       → { created, updated, unchanged, notes, … }
// App-level failures come back as 200 { error: "..." }.
//
// Needs scripts/notion_client_import.sql. Secrets: NOTION_TOKEN (shared with
// notion-assignments / notion-checkins; share the CRM, Assigned Homework,
// Client Goals and Onboarding Audit databases and the client dashboards with
// the integration). Optional overrides: NOTION_CRM_DATABASE_ID,
// NOTION_HOMEWORK_DATABASE_ID, NOTION_GOALS_DATABASE_ID.
//
// Deploy:  supabase functions deploy notion-client-import

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const NOTION_VERSION = "2022-06-28";
const UPLOAD_BUCKET = "client-uploads";
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const DEFAULT_DBS = {
  crm: "287a17b3a0bb802a9e87cbb7463477c5",      // CRM → Current Clients
  homework: "32ea17b3a0bb8083bba8d90d3099768b", // Assigned Homework
  goals: "29aa17b3a0bb80b8ab63da55b135a60e",    // Client Goals
};
const CORES = ["body", "mind", "art", "soul", "career", "life"];
const CORE_BY_LETTER: Record<string, string> = { B: "body", M: "mind", A: "art", S: "soul", C: "career", L: "life" };

// deno-lint-ignore no-explicit-any
type Json = any;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function normalizeId(raw: unknown): string {
  const m = String(raw ?? "").trim().replace(/-/g, "").match(/[0-9a-f]{32}/i);
  return m ? m[0].toLowerCase() : "";
}

function notionUrl(id: string): string {
  return id ? "https://www.notion.so/" + normalizeId(id) : "";
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

// Every row of a database query (Notion pages through 100 at a time).
async function queryAll(dbId: string, body: Json, max = 1000): Promise<Json[]> {
  const out: Json[] = [];
  let cursor: string | undefined;
  do {
    const data = await notion(`/databases/${dbId}/query`, {
      method: "POST",
      body: { page_size: 100, ...body, ...(cursor ? { start_cursor: cursor } : {}) },
    });
    out.push(...(data.results ?? []));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor && out.length < max);
  return out;
}

async function children(blockId: string, max = 500): Promise<Json[]> {
  const out: Json[] = [];
  let cursor: string | undefined;
  do {
    const data = await notion(`/blocks/${blockId}/children?page_size=100${cursor ? "&start_cursor=" + cursor : ""}`);
    out.push(...(data.results ?? []));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor && out.length < max);
  return out;
}

function dbError(e: unknown, name: string): string {
  const status = (e as Json)?.status;
  if (status === 404) return `Notion can't see the "${name}" database. In Notion, open it → ••• → Connections and add your integration.`;
  if (status === 401) return "NOTION_TOKEN was rejected by Notion. Check the integration secret.";
  return (e as Error).message;
}

// ─── property readers ────────────────────────────────────────────────────

function richText(rt: Json[] | undefined): string {
  return (rt ?? []).map((t: Json) => t.plain_text ?? "").join("");
}

function prop(props: Json, ...names: string[]): Json | null {
  for (const n of names) if (props?.[n]) return props[n];
  const wanted = names.map((n) => n.trim().toLowerCase());
  for (const [key, value] of Object.entries(props ?? {})) {
    if (wanted.includes(key.trim().toLowerCase())) return value;
  }
  return null;
}

function titleProp(props: Json): Json | null {
  return Object.values(props ?? {}).find((p: Json) => p?.type === "title") ?? null;
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
    case "phone_number": return p.phone_number ?? "";
    case "checkbox": return p.checkbox ? "Yes" : "";
    case "date": return p.date?.start ?? "";
    case "formula": {
      const f = p.formula ?? {};
      return f.type === "string" ? (f.string ?? "") : f.type === "number" ? (f.number == null ? "" : String(f.number)) : "";
    }
    default: return "";
  }
}

function people(p: Json): Json[] {
  return p?.type === "people" ? (p.people ?? []) : [];
}

function relationIds(p: Json): string[] {
  return p?.type === "relation" ? (p.relation ?? []).map((r: Json) => normalizeId(r.id)).filter(Boolean) : [];
}

// ─── names ───────────────────────────────────────────────────────────────

function norm(s: string): string {
  return String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9' -]+/g, " ").replace(/\s+/g, " ").trim();
}

type Who = { id: string; full: string; preferred: string; email: string };

function nameMatches(who: Who, raw: string): boolean {
  const n = norm(raw);
  if (!n) return false;
  if (n === norm(who.full) || (who.preferred && n === norm(who.preferred))) return true;
  const a = norm(who.full).split(" "), b = n.split(" ");
  return a.length > 1 && b.length > 1 && a[0] === b[0] && a[a.length - 1] === b[b.length - 1];
}

function personMatches(who: Who, u: Json): boolean {
  const email = String(u?.person?.email ?? "").toLowerCase();
  if (email && who.email && email === who.email.toLowerCase()) return true;
  return nameMatches(who, u?.name ?? "");
}

// ─── dates ───────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function lastDay(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// "by January 1, 2027" / "by July 2027" / "by the end of 2026" / "by e.o.y. 2026" → a date.
function deadlineFrom(title: string): string | null {
  const s = String(title ?? "").toLowerCase();
  const re = /\bby\s+(?:the\s+)?(?:end\s+of\s+|e\.?o\.?y\.?\s*)?(?:([a-z]{3,9})\.?\s+(?:(\d{1,2})(?:st|nd|rd|th)?,?\s+)?)?(20\d{2})\b/g;
  let m: RegExpExecArray | null, best: string | null = null;
  while ((m = re.exec(s))) {
    const y = Number(m[3]);
    const mon = m[1] ? MONTHS[m[1].slice(0, m[1] === "sept" ? 4 : 3)] : 0;
    if (m[1] && !mon) continue;
    const date = !mon ? ymd(y, 12, 31) : m[2] ? ymd(y, mon, Math.min(Number(m[2]), lastDay(y, mon))) : ymd(y, mon, lastDay(y, mon));
    if (!best || date > best) best = date;
  }
  return best;
}

// ─── storage ─────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
let admin: any = null;

function safeName(name: string): string {
  return String(name || "file").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120) || "file";
}

function fileNameFromUrl(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() || "") || "file";
  } catch {
    return "file";
  }
}

// Copies a Notion-hosted file (links expire after an hour) into the bucket.
async function copyFile(url: string, path: string): Promise<{ path: string; size: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > MAX_FILE_BYTES) return null;
    const type = (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim();
    const up = await admin.storage.from(UPLOAD_BUCKET).upload(path, buf, { contentType: type, upsert: true });
    return up.error ? null : { path, size: buf.length };
  } catch {
    return null;
  }
}

// ─── link ────────────────────────────────────────────────────────────────

type Link = {
  crm_page_id: string; crm_url: string;
  notion_user_id: string; notion_user_name: string;
  dashboard_id: string; dashboard_url: string;
  cookbook: { type: "page" | "database"; id: string; url: string; title: string } | null;
  audit_id: string; audit_url: string;
};

async function findCrmPage(dbs: Json, who: Who): Promise<Json | null> {
  const first = norm(who.full).split(" ")[0] || norm(who.preferred);
  const tries: Json[] = [];
  if (who.email) tries.push({ property: "Email", email: { equals: who.email } }, { property: "Email", rich_text: { equals: who.email } });
  if (first) tries.push({ property: "Name", title: { contains: first } });
  for (const filter of tries) {
    let rows: Json[];
    try {
      rows = await queryAll(dbs.crm, { filter }, 200);
    } catch (e) {
      if ((e as Json)?.status === 400) continue; // property is another type — try the next filter
      throw e;
    }
    const hit = rows.find((r) => {
      const props = r.properties ?? {};
      const email = text(prop(props, "Email")).toLowerCase();
      return (who.email && email === who.email.toLowerCase()) || nameMatches(who, text(titleProp(props)));
    });
    if (hit) return hit;
  }
  return null;
}

// The client's Notion person: scan the shared Homework (then Goals) database
// for a row whose Client is them. Rows are newest first, so it's quick.
async function findNotionUser(dbs: Json, who: Who): Promise<Json | null> {
  for (const db of [dbs.homework, dbs.goals]) {
    let cursor: string | undefined, seen = 0;
    do {
      const data = await notion(`/databases/${db}/query`, {
        method: "POST",
        body: {
          page_size: 100,
          filter: { property: "Client", people: { is_not_empty: true } },
          sorts: [{ timestamp: "created_time", direction: "descending" }],
          ...(cursor ? { start_cursor: cursor } : {}),
        },
      });
      for (const row of data.results ?? []) {
        const u = people(prop(row.properties, "Client")).find((p: Json) => personMatches(who, p));
        if (u) return u;
      }
      seen += (data.results ?? []).length;
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor && seen < 3000);
  }
  return null;
}

function blockTitle(b: Json): string {
  if (b.type === "child_page") return b.child_page?.title ?? "";
  if (b.type === "child_database") return b.child_database?.title ?? "";
  return "";
}

// Breadth-first through a page's blocks (callouts, columns, toggles, untitled
// sub-pages) for a child page / database whose title matches.
async function findChild(rootId: string, re: RegExp, maxDepth = 3, budget = { calls: 40 }): Promise<Json | null> {
  let level = [rootId];
  for (let depth = 0; depth <= maxDepth && level.length; depth++) {
    const next: string[] = [];
    for (const id of level) {
      if (budget.calls-- <= 0) return null;
      let kids: Json[];
      try { kids = await children(id, 300); } catch { continue; }
      for (const b of kids) {
        const t = blockTitle(b);
        if ((b.type === "child_page" || b.type === "child_database") && re.test(t)) return b;
      }
      for (const b of kids) {
        if (b.type === "child_database") continue;
        if (b.has_children || b.type === "child_page") next.push(b.id);
      }
    }
    level = next;
  }
  return null;
}

async function doLink(dbs: Json, who: Who): Promise<{ link: Link; notes: string[] }> {
  const notes: string[] = [];
  const link: Link = {
    crm_page_id: "", crm_url: "", notion_user_id: "", notion_user_name: "",
    dashboard_id: "", dashboard_url: "", cookbook: null, audit_id: "", audit_url: "",
  };

  let crm: Json | null = null;
  try {
    crm = await findCrmPage(dbs, who);
  } catch (e) {
    throw new Error(dbError(e, "Current Clients"));
  }
  if (crm) {
    link.crm_page_id = normalizeId(crm.id);
    link.crm_url = crm.url ?? notionUrl(crm.id);
    link.audit_id = relationIds(prop(crm.properties, "Client | Audit", "Client Audit", "Audit"))[0] ?? "";
    link.audit_url = notionUrl(link.audit_id);
  } else {
    notes.push(`No "Current Clients" page in Notion matches ${who.full || who.email}.`);
  }

  try {
    const u = await findNotionUser(dbs, who);
    if (u) { link.notion_user_id = u.id; link.notion_user_name = u.name ?? ""; }
    else notes.push(`${who.full || "This client"} isn't set as the Client on any Notion homework or goal, so those can't be imported.`);
  } catch (e) {
    throw new Error(dbError(e, "Assigned Homework"));
  }

  if (link.crm_page_id) {
    const dash = await findChild(link.crm_page_id, /dashboard/i, 1);
    const root = dash ? dash.id : link.crm_page_id;
    if (dash) { link.dashboard_id = normalizeId(dash.id); link.dashboard_url = notionUrl(dash.id); }
    const cook = await findChild(root, /cook\s*-?\s*book|recipes?/i, 3);
    if (cook) {
      link.cookbook = {
        type: cook.type === "child_database" ? "database" : "page",
        id: normalizeId(cook.id), url: notionUrl(cook.id), title: blockTitle(cook) || "Cook Book",
      };
    } else {
      notes.push("No Cook Book found on the client's Notion dashboard.");
    }
  }
  return { link, notes };
}

// Saves the link and fills program dates / cardio from Notion when empty.
async function saveLink(clientId: string, link: Link, notes: string[]) {
  const { data: cur, error } = await admin.from("client_dashboard")
    .select("client_id, onboard_date, offboard_date, cardio_goal, preferred_cardio").eq("client_id", clientId).maybeSingle();
  if (error) throw new Error(error.message);

  const patch: Json = { client_id: clientId, notion_page_id: link.crm_page_id, notion_user_id: link.notion_user_id };

  if (link.crm_page_id) {
    try {
      const page = await notion(`/pages/${link.crm_page_id}`);
      const d = prop(page.properties, "Chasing Change Dates")?.date;
      if (d?.start && !cur?.onboard_date) { patch.onboard_date = String(d.start).slice(0, 10); notes.push("Program start date set from Notion."); }
      if (d?.end && !cur?.offboard_date) { patch.offboard_date = String(d.end).slice(0, 10); notes.push("Program end date set from Notion."); }
    } catch { /* dates are a bonus */ }
  }
  if (link.audit_id) {
    try {
      const audit = await notion(`/pages/${link.audit_id}`);
      const goal = text(prop(audit.properties, "Cardio Goal"));
      const kind = text(prop(audit.properties, "Cardio(s)", "Cardio"));
      if (goal && !cur?.cardio_goal) patch.cardio_goal = goal.slice(0, 500);
      if (kind && !cur?.preferred_cardio) patch.preferred_cardio = kind.slice(0, 200);
    } catch { /* cardio is a bonus */ }
  }

  const { error: upErr } = await admin.from("client_dashboard").upsert(patch, { onConflict: "client_id" });
  if (upErr) {
    if (/notion_page_id|notion_user_id/.test(upErr.message)) throw new Error("Run scripts/notion_client_import.sql in Supabase first.");
    throw new Error(upErr.message);
  }
}

async function loadLink(clientId: string, dbs: Json, who: Who): Promise<Link> {
  const { link, notes } = await doLink(dbs, who);
  if (notes.length && !link.notion_user_id && !link.crm_page_id) throw new Error(notes.join(" "));
  return link;
}

// ─── homework ────────────────────────────────────────────────────────────

const HW_STATUS: Record<string, string> = {
  "not started": "assigned", "assigned": "assigned", "reminded": "assigned", "check in": "assigned",
  "cip": "in_progress", "review": "review", "overdue": "overdue",
  "habit": "complete", "non-negotiable": "complete", "done": "complete",
};

const HW_SECTIONS: [string, string][] = [
  ["relevance", "Relevance"], ["outcome", "Outcome"], ["instructions", "To Do"],
  ["implementation", "Implementation"], ["alternative", "Alternative"], ["examples", "Examples"],
];

// Same as clientText() in assignment-library/library.js.
function libraryText(r: Json): string {
  const has = HW_SECTIONS.some(([k]) => k !== "instructions" && String(r[k] ?? "").trim());
  if (!has) return String(r.instructions ?? "").trim();
  return HW_SECTIONS.filter(([k]) => String(r[k] ?? "").trim())
    .map(([k, label]) => label.toUpperCase() + "\n" + String(r[k]).trim()).join("\n\n");
}

// "B.6 | Progressive Overload" → { code: "B.6", title: "Progressive Overload", core: "body" }
function splitCode(raw: string): { code: string; title: string; core: string } {
  const s = String(raw ?? "").trim();
  const m = s.match(/^\[?\s*([A-Z]{1,3})\s*\.?\s*(\d{0,2})\.?\s*\]?\s*[|·:\-–—]\s*(.+)$/);
  if (!m) return { code: "", title: s, core: "" };
  const letters = m[1].toUpperCase();
  const core = letters === "ALL" ? "" : letters === "CJ" ? "career" : (CORE_BY_LETTER[letters[0]] ?? "");
  return { code: letters + (m[2] ? "." + m[2] : ""), title: m[3].trim(), core };
}

async function doHomework(dbs: Json, clientId: string, link: Link, overwrite: boolean) {
  const out: Json = { created: 0, updated: 0, unchanged: 0, assignments: 0, todos: 0, notes: [] as string[] };
  if (!link.notion_user_id) { out.notes.push("No Notion person for this client — nothing to import."); return out; }

  let rows: Json[];
  try {
    rows = await queryAll(dbs.homework, {
      filter: { property: "Client", people: { contains: link.notion_user_id } },
      sorts: [{ timestamp: "created_time", direction: "ascending" }],
    });
  } catch (e) {
    throw new Error(dbError(e, "Assigned Homework"));
  }

  // Master Assignment pages linked from the titles → library rows.
  const parsed = rows.map((page) => {
    const rt: Json[] = titleProp(page.properties)?.title ?? [];
    const mention = rt.find((t) => t.type === "mention" && t.mention?.type === "page");
    const masterId = mention ? normalizeId(mention.mention.page.id) : "";
    const rest = rt.filter((t) => t !== mention).map((t) => t.plain_text ?? "").join("").replace(/\s+/g, " ").trim();
    return { page, masterId, mentionText: mention ? String(mention.plain_text ?? "").trim() : "", rest };
  });
  const masterIds = [...new Set(parsed.map((p) => p.masterId).filter(Boolean))];
  const lib: Record<string, Json> = {};
  if (masterIds.length) {
    const { data, error } = await admin.from("assignment_library").select("*").in("notion_page_id", masterIds);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) lib[r.notion_page_id] = r;
  }

  const ids = parsed.map((p) => normalizeId(p.page.id));
  const { data: existingRows, error: exErr } = await admin.from("client_assignments")
    .select("id, notion_page_id, title, status, due_date, kind, instructions, library_id").in("notion_page_id", ids);
  if (exErr) {
    if (/notion_page_id/.test(exErr.message)) throw new Error("Run scripts/notion_client_import.sql in Supabase first.");
    throw new Error(exErr.message);
  }
  const existing: Record<string, Json> = {};
  for (const r of existingRows ?? []) existing[r.notion_page_id] = r;

  const missingLib: string[] = [];
  for (const p of parsed) {
    const props = p.page.properties ?? {};
    const pageId = normalizeId(p.page.id);
    const notionStatus = text(prop(props, "Status")).toLowerCase();
    const status = HW_STATUS[notionStatus] ?? "assigned";
    const due = prop(props, "Due Date", "Due")?.date?.start?.slice(0, 10) ?? null;
    const isAssignment = !!p.masterId;
    let row: Json;

    if (isAssignment) {
      const l = lib[p.masterId];
      const split = splitCode(p.mentionText);
      const code = (l?.code || split.code || "").trim();
      const base = l?.title || split.title || p.mentionText || "Assignment";
      row = {
        kind: "assignment",
        title: (code ? code + " · " : "") + base + (p.rest ? " — " + p.rest : ""),
        instructions: l ? libraryText(l) : "",
        core_key: l?.core_key || split.core || "",
        library_id: l?.id ?? null,
      };
      if (l?.cover_url) row.cover_url = l.cover_url;
      if (!l) missingLib.push(p.mentionText || base);
      out.assignments++;
    } else {
      row = { kind: "todo", title: p.rest || "To-do", core_key: "" };
      out.todos++;
    }
    row.due_date = due;

    const cur = existing[pageId];
    if (!cur) {
      Object.assign(row, { client_id: clientId, notion_page_id: pageId, status });
      if (status === "complete" && (notionStatus === "habit" || notionStatus === "non-negotiable")) {
        row.coach_feedback = notionStatus === "habit" ? "Became a habit (in Notion)." : "Became a non-negotiable (in Notion).";
      }
      const { error } = await admin.from("client_assignments").insert(row);
      if (error) throw new Error(`${row.title}: ${error.message}`);
      out.created++;
    } else {
      // Keep what's been edited on the site unless overwriting.
      const patch: Json = {};
      if (overwrite || cur.status === "assigned") { if (cur.status !== status) patch.status = status; }
      if (overwrite || !cur.due_date) { if (due && cur.due_date !== due) patch.due_date = due; }
      if (overwrite) { if (cur.title !== row.title) patch.title = row.title; if (cur.kind !== row.kind) patch.kind = row.kind; }
      if (row.library_id && !cur.library_id) patch.library_id = row.library_id;
      if (row.instructions && (overwrite || !cur.instructions)) { if (cur.instructions !== row.instructions) patch.instructions = row.instructions; }
      if (Object.keys(patch).length) {
        const { error } = await admin.from("client_assignments").update(patch).eq("id", cur.id);
        if (error) throw new Error(`${row.title}: ${error.message}`);
        out.updated++;
      } else out.unchanged++;
    }
  }
  if (missingLib.length) {
    out.notes.push(`${missingLib.length} assignment${missingLib.length === 1 ? " isn't" : "s aren't"} in the Assignment Library yet, so ${missingLib.length === 1 ? "it came" : "they came"} in without instructions: ${missingLib.join("; ")}. Sync the library from Notion, then import again.`);
  }
  return out;
}

// ─── goals ───────────────────────────────────────────────────────────────

const GOAL_STATUS: Record<string, string> = {
  "": "not_started", "not started": "not_started", "reception": "not_started", "schedule/reminder": "not_started",
  "in progress": "in_progress", "on pause": "on_hold",
  "habit created": "achieved", "will complete": "achieved", "complete": "achieved",
};
const QUEST: Record<string, string> = { "the quest": "the_quest", "main quest": "main", "side quest": "side" };

function firstSentence(s: string, max = 140): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  const one = m ? m[1] : t;
  return one.length > max ? one.slice(0, max - 1).replace(/\s+\S*$/, "") + "…" : one;
}

async function doGoals(dbs: Json, clientId: string, link: Link, overwrite: boolean) {
  const out: Json = { created: 0, updated: 0, unchanged: 0, notes: [] as string[] };
  const upserts: Json[] = [];

  if (link.notion_user_id) {
    let rows: Json[];
    try {
      rows = await queryAll(dbs.goals, {
        filter: { property: "Client", people: { contains: link.notion_user_id } },
        sorts: [{ timestamp: "created_time", direction: "ascending" }],
      });
    } catch (e) {
      throw new Error(dbError(e, "Client Goals"));
    }
    const byId: Record<string, Json> = {};
    for (const r of rows) byId[normalizeId(r.id)] = r;
    const kids: Record<string, Json[]> = {};
    const tops: Json[] = [];
    for (const r of rows) {
      const parent = relationIds(prop(r.properties, "Parent item"))[0];
      if (parent && byId[parent]) (kids[parent] ??= []).push(r);
      else tops.push(r);
    }
    for (const r of tops) {
      const props = r.properties ?? {};
      const title = text(titleProp(props)) || "Untitled goal";
      const core = text(prop(props, "Core")).toLowerCase();
      upserts.push({
        notion_page_id: normalizeId(r.id),
        title,
        core_key: CORES.includes(core) ? core : "",
        status: GOAL_STATUS[text(prop(props, "Status")).toLowerCase()] ?? "not_started",
        quest: QUEST[text(prop(props, "Quest")).toLowerCase()] ?? "",
        target_date: deadlineFrom(title),
        milestones: (kids[normalizeId(r.id)] ?? []).map((k: Json) => {
          const st = GOAL_STATUS[text(prop(k.properties, "Status")).toLowerCase()] ?? "not_started";
          const label = text(titleProp(k.properties));
          const m: Json = { label, done: st === "achieved" };
          const d = deadlineFrom(label);
          if (d) m.date = d;
          return m;
        }).filter((m: Json) => m.label),
        created_by: "coach",
      });
    }
  } else {
    out.notes.push("No Notion person for this client — goals skipped.");
  }

  // The overall goal from the Onboarding Audit → The Quest.
  if (link.audit_id) {
    try {
      const audit = await notion(`/pages/${link.audit_id}`);
      const goal = text(prop(audit.properties, "Goal"));
      if (goal) {
        upserts.push({
          notion_page_id: "audit:" + link.audit_id,
          title: firstSentence(goal),
          description: goal,
          core_key: "",
          status: "in_progress",
          quest: "the_quest",
          target_date: null,
          milestones: [],
          created_by: "client",
        });
      }
    } catch (e) {
      out.notes.push("Couldn't read the Onboarding Audit: " + (e as Error).message);
    }
  }

  if (!upserts.length) return out;
  const { data: existingRows, error: exErr } = await admin.from("client_goals")
    .select("id, notion_page_id, title, description, core_key, status, quest, target_date, milestones")
    .in("notion_page_id", upserts.map((u) => u.notion_page_id));
  if (exErr) {
    if (/notion_page_id|quest/.test(exErr.message)) throw new Error("Run scripts/notion_client_import.sql in Supabase first.");
    throw new Error(exErr.message);
  }
  const existing: Record<string, Json> = {};
  for (const r of existingRows ?? []) existing[r.notion_page_id] = r;

  for (const g of upserts) {
    const cur = existing[g.notion_page_id];
    if (!cur) {
      const { error } = await admin.from("client_goals").insert({ ...g, client_id: clientId });
      if (error) throw new Error(`${g.title}: ${error.message}`);
      out.created++;
      continue;
    }
    const patch: Json = {};
    const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    if (cur.quest !== g.quest) patch.quest = g.quest;
    if (overwrite) {
      for (const k of ["title", "description", "core_key", "status", "target_date", "milestones"]) {
        if (k in g && !same(cur[k], g[k])) patch[k] = g[k];
      }
    } else {
      if (!cur.core_key && g.core_key) patch.core_key = g.core_key;
      if (!cur.target_date && g.target_date) patch.target_date = g.target_date;
      if (!(cur.milestones ?? []).length && g.milestones.length) patch.milestones = g.milestones;
    }
    if (Object.keys(patch).length) {
      const { error } = await admin.from("client_goals").update(patch).eq("id", cur.id);
      if (error) throw new Error(`${g.title}: ${error.message}`);
      out.updated++;
    } else out.unchanged++;
  }
  return out;
}

// ─── uploads → assignments ───────────────────────────────────────────────

const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "for", "to", "in", "on", "my", "your", "with", "at", "by", "from", "is",
  "png", "jpg", "jpeg", "heic", "gif", "pdf", "doc", "docx", "webp", "mov", "mp4", "txt", "xlsx", "csv",
  "screenshot", "screen", "shot", "img", "image", "photo", "scan", "copy", "final", "file", "upload", "homework",
  "assignment", "worksheet", "round", "v", "pm", "am",
]);
const SYNONYMS = [
  ["day", "week", "schedule", "calendar", "routine"],
  ["meal", "food", "eat", "eating", "nutrition", "recipe"],
  ["grocery", "groceries", "shopping"],
  ["restaurant", "travel", "eating out"],
  ["gym", "gyms", "fitness"],
];

function stem(w: string): string {
  return w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;
}

function tokens(s: string, drop: Set<string>): string[] {
  return [...new Set(
    String(s ?? "").toLowerCase().replace(/\.[a-z0-9]{2,5}$/, "").split(/[^a-z0-9]+/)
      .filter((w) => w && !/^\d+$/.test(w) && !STOP.has(w) && !drop.has(w)).map(stem),
  )];
}

function overlap(a: string[], b: string[]): number {
  let score = 0;
  for (const w of a) {
    if (b.includes(w)) { score += 1; continue; }
    if (SYNONYMS.some((g) => g.map(stem).includes(w) && g.map(stem).some((x) => b.includes(x)))) score += 0.5;
  }
  return score;
}

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(a.slice(0, 10) + "T00:00:00Z").getTime() - new Date(b.slice(0, 10) + "T00:00:00Z").getTime()) / 864e5;
}

async function doUploads(clientId: string, who: Who) {
  const out: Json = { attached: 0, unmatched: [] as Json[], notes: [] as string[] };
  const [subsRes, hwRes] = await Promise.all([
    admin.from("client_pre_call_submissions")
      .select("id, submitted_at, files, text_url_upload, url_upload").eq("client_id", clientId).order("submitted_at"),
    admin.from("client_assignments")
      .select("id, title, due_date, created_at, files, client_note, submitted_at, kind").eq("client_id", clientId),
  ]);
  if (subsRes.error) throw new Error(subsRes.error.message);
  if (hwRes.error) throw new Error(hwRes.error.message);
  const assignments = (hwRes.data ?? []).filter((a: Json) => a.kind !== "todo");
  if (!assignments.length) { out.notes.push("No assignments to attach uploads to — import homework first."); return out; }

  // The client's initials ("AH - Core Planning.png") aren't a match signal.
  const parts = norm(who.full).split(" ").filter(Boolean);
  const drop = new Set<string>([...parts, parts.map((p) => p[0]).join("")].filter(Boolean));
  const hwTokens = assignments.map((a: Json) =>
    tokens(String(a.title).replace(/^[A-Z]{1,3}(\.\d{1,2})?\s*·\s*/, ""), drop));

  const changes: Record<string, Json> = {};
  const state = (a: Json) => changes[a.id] ??= {
    files: Array.isArray(a.files) ? [...a.files] : [], client_note: a.client_note ?? "", submitted_at: a.submitted_at,
  };

  for (const s of subsRes.data ?? []) {
    type Item = { kind: "file" | "text" | "url"; label: string; file?: Json; text?: string };
    const items: Item[] = [];
    for (const f of Array.isArray(s.files) ? s.files : []) items.push({ kind: "file", label: f.name ?? "", file: f });
    const txt = String(s.text_url_upload ?? "").trim();
    if (txt) {
      if (/^https?:\/\/\S+$/.test(txt)) items.push({ kind: "url", label: txt, file: { name: txt, url: txt } });
      else items.push({ kind: "text", label: txt.split("\n").find((l: string) => l.trim()) ?? "", text: txt });
    }
    const url = String(s.url_upload ?? "").trim();
    if (/^https?:\/\//.test(url)) items.push({ kind: "url", label: url, file: { name: url, url } });
    if (!items.length) continue;

    // Score each upload against each assignment due around that pre-call.
    const scored = items.map((it) => {
      const t = tokens(it.label, drop);
      const cands = assignments.map((a: Json, i: number) => {
        let sc = overlap(t, hwTokens[i]);
        const ref = a.due_date || a.created_at;
        const gap = ref ? daysBetween(s.submitted_at, ref) : 99;
        if (gap > 21) sc *= 0.4; // far from its due date: only a strong name match counts
        return { a, sc, gap };
      }).filter((c: Json) => c.sc >= 1).sort((x: Json, y: Json) => y.sc - x.sc || x.gap - y.gap);
      const margin = cands.length ? cands[0].sc - (cands[1]?.sc ?? 0) : -1;
      return { it, cands, margin };
    });
    // Most certain uploads first; each assignment takes one upload per pre-call.
    scored.sort((x, y) => y.margin - x.margin);
    const taken = new Set<string>();
    for (const { it, cands } of scored) {
      const c = cands.find((c: Json) => !taken.has(c.a.id));
      if (!c) {
        out.unmatched.push({ name: it.kind === "text" ? firstSentence(it.label, 60) : it.label, submitted_at: s.submitted_at });
        continue;
      }
      taken.add(c.a.id);
      const st = state(c.a);
      if (it.kind === "text") {
        if (!st.client_note.includes(it.text!.slice(0, 40))) {
          st.client_note = st.client_note.trim() ? st.client_note.trim() + "\n\n" + it.text : it.text!;
          out.attached++;
        }
      } else {
        const f = it.file!;
        const dup = st.files.some((x: Json) => (f.path && x.path === f.path) || (f.url && x.url === f.url));
        if (!dup) {
          st.files.push({ ...f, from_precall: s.id, uploaded_at: f.uploaded_at ?? s.submitted_at });
          out.attached++;
        }
      }
      if (!st.submitted_at || st.submitted_at > s.submitted_at) st.submitted_at = s.submitted_at;
    }
  }

  for (const [id, patch] of Object.entries(changes)) {
    const { error } = await admin.from("client_assignments").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  }
  if (out.unmatched.length) out.notes.push("Uploads that didn't match an assignment stay on their pre-call form in Check-ins.");
  return out;
}

// ─── cookbook ────────────────────────────────────────────────────────────

type Ctx = { clientId: string; budget: number; images: number };

function spans(rt: Json[] | undefined): Json[] {
  return (rt ?? []).map((t: Json) => {
    const s: Json = { text: t.plain_text ?? "" };
    if (t.annotations?.bold) s.b = true;
    if (t.annotations?.italic) s.i = true;
    const href = t.href || (t.type === "text" ? t.text?.link?.url : "");
    if (href && /^https?:\/\//i.test(href)) s.href = href;
    return s;
  }).filter((s: Json) => s.text);
}

async function fileBlock(b: Json, ctx: Ctx): Promise<Json | null> {
  const data = b[b.type] ?? {};
  const caption = spans(data.caption);
  const src = data.type === "external" ? data.external?.url : data.file?.url;
  if (!src) return null;
  if (b.type !== "image") {
    const name = caption.length ? caption.map((c: Json) => c.text).join("") : (data.name || fileNameFromUrl(src));
    if (data.type === "external") return { t: "p", rt: [{ text: name, href: src }] };
    const copied = await copyFile(src, `${ctx.clientId}/cookbook/${normalizeId(b.id)}-${safeName(data.name || fileNameFromUrl(src))}`);
    return copied ? { t: "file", path: copied.path, name } : null;
  }
  if (data.type === "external") return { t: "image", url: src, caption };
  if (ctx.images++ > 60) return null;
  const copied = await copyFile(src, `${ctx.clientId}/cookbook/${normalizeId(b.id)}-${safeName(fileNameFromUrl(src))}`);
  return copied ? { t: "image", path: copied.path, caption } : null;
}

async function convertBlocks(list: Json[], ctx: Ctx, depth: number): Promise<Json[]> {
  const out: Json[] = [];
  const kidsOf = async (b: Json) =>
    b.has_children && depth < 4 && ctx.budget-- > 0 ? await convertBlocks(await children(b.id), ctx, depth + 1) : [];

  for (const b of list) {
    const d = b[b.type] ?? {};
    switch (b.type) {
      case "paragraph": {
        const rt = spans(d.rich_text);
        if (rt.length) out.push({ t: "p", rt });
        out.push(...await kidsOf(b));
        break;
      }
      case "heading_1": case "heading_2": case "heading_3": {
        out.push({ t: "h" + b.type.slice(-1), rt: spans(d.rich_text) });
        if (d.is_toggleable) out.push(...await kidsOf(b));
        break;
      }
      case "bulleted_list_item": case "numbered_list_item": case "to_do": {
        const t = b.type === "to_do" ? "todo" : b.type === "numbered_list_item" ? "ol" : "ul";
        const item: Json = { rt: spans(d.rich_text) };
        if (t === "todo") item.done = !!d.checked;
        const sub = await kidsOf(b);
        if (sub.length) item.children = sub;
        const last = out[out.length - 1];
        if (last && last.t === t) last.items.push(item);
        else out.push({ t, items: [item] });
        break;
      }
      case "quote": case "callout": {
        const rt = spans(d.rich_text);
        const sub = await kidsOf(b);
        if (rt.length || sub.length) out.push({ t: b.type, rt, ...(sub.length ? { children: sub } : {}) });
        break;
      }
      case "toggle": {
        out.push({ t: "toggle", rt: spans(d.rich_text), children: await kidsOf(b) });
        break;
      }
      case "divider": out.push({ t: "divider" }); break;
      case "table": {
        if (ctx.budget-- <= 0) break;
        const rows = (await children(b.id)).filter((r: Json) => r.type === "table_row")
          .map((r: Json) => (r.table_row?.cells ?? []).map((c: Json[]) => spans(c)));
        if (rows.length) out.push({ t: "table", header: !!d.has_column_header, rows });
        break;
      }
      case "image": case "file": case "pdf": case "video": {
        const fb = await fileBlock(b, ctx);
        if (fb) out.push(fb);
        break;
      }
      case "bookmark": case "embed": case "link_preview": {
        const url = d.url;
        if (url) out.push({ t: "p", rt: spans(d.caption).length ? spans(d.caption).map((s: Json) => ({ ...s, href: url })) : [{ text: url, href: url }] });
        break;
      }
      case "column_list": case "column": case "synced_block": {
        out.push(...await kidsOf(b));
        break;
      }
      case "child_page": {
        // A recipe on its own page: its title as a heading, then the page.
        out.push({ t: "h3", rt: [{ text: d.title || "Untitled" }] });
        if (depth < 3 && ctx.budget-- > 0) out.push(...await convertBlocks(await children(b.id), ctx, depth + 1));
        break;
      }
      case "child_database": {
        if (depth < 3) out.push(...await databaseBlocks(normalizeId(b.id), d.title || "", ctx, depth + 1));
        break;
      }
      default: break; // link_to_page, breadcrumb, table_of_contents, equation…
    }
  }
  return out;
}

// A cookbook kept as a database: one section per row (title, its text
// properties, then the row's page).
async function databaseBlocks(dbId: string, title: string, ctx: Ctx, depth: number): Promise<Json[]> {
  const out: Json[] = [];
  let rows: Json[];
  try {
    rows = await queryAll(dbId, { sorts: [{ timestamp: "created_time", direction: "ascending" }] }, 200);
  } catch {
    return out;
  }
  if (title && depth > 1) out.push({ t: "h2", rt: [{ text: title }] });
  for (const r of rows) {
    const props = r.properties ?? {};
    out.push({ t: "h3", rt: [{ text: text(titleProp(props)) || "Untitled" }] });
    for (const [name, p] of Object.entries(props)) {
      const pp = p as Json;
      if (pp.type === "title") continue;
      if (pp.type === "files") {
        for (const f of pp.files ?? []) {
          const src = f.type === "external" ? f.external?.url : f.file?.url;
          if (!src) continue;
          if (f.type === "external") { out.push({ t: "image", url: src, caption: [] }); continue; }
          const copied = await copyFile(src, `${ctx.clientId}/cookbook/${normalizeId(r.id)}-${safeName(f.name || fileNameFromUrl(src))}`);
          if (copied) out.push({ t: "image", path: copied.path, caption: [] });
        }
        continue;
      }
      if (pp.type === "rich_text" && (pp.rich_text ?? []).length) {
        out.push({ t: "p", rt: [{ text: name + ": ", b: true }, ...spans(pp.rich_text)] });
        continue;
      }
      const v = text(pp);
      if (v) out.push({ t: "p", rt: [{ text: name + ": ", b: true }, pp.type === "url" ? { text: v, href: v } : { text: v }] });
    }
    if (ctx.budget-- > 0) {
      try { out.push(...await convertBlocks(await children(r.id), ctx, depth + 1)); } catch { /* row without a body */ }
    }
  }
  return out;
}

async function doCookbook(clientId: string, link: Link) {
  const out: Json = { created: 0, updated: 0, blocks: 0, notes: [] as string[] };
  if (!link.cookbook) { out.notes.push("No Cook Book found on the client's Notion dashboard."); return out; }
  const ctx: Ctx = { clientId, budget: 150, images: 0 };
  let blocks: Json[];
  try {
    blocks = link.cookbook.type === "database"
      ? await databaseBlocks(link.cookbook.id, link.cookbook.title, ctx, 1)
      : await convertBlocks(await children(link.cookbook.id), ctx, 1);
  } catch (e) {
    throw new Error(dbError(e, link.cookbook.title || "Cook Book"));
  }
  if (ctx.budget <= 0) out.notes.push("The Cook Book is very long — only the first part came across.");

  const { data: cur, error: exErr } = await admin.from("client_cookbooks").select("client_id").eq("client_id", clientId).maybeSingle();
  if (exErr) {
    if (/client_cookbooks/.test(exErr.message)) throw new Error("Run scripts/notion_client_import.sql in Supabase first.");
    throw new Error(exErr.message);
  }
  const { error } = await admin.from("client_cookbooks").upsert({
    client_id: clientId,
    title: link.cookbook.title || "Cook Book",
    blocks,
    notion_page_id: link.cookbook.id,
    notion_url: link.cookbook.url,
    synced_at: new Date().toISOString(),
  }, { onConflict: "client_id" });
  if (error) throw new Error(error.message);
  if (cur) out.updated++; else out.created++;
  out.blocks = blocks.length;
  if (!blocks.length) out.notes.push("The Cook Book in Notion is empty.");
  return out;
}

// ─── handler ─────────────────────────────────────────────────────────────

// ─── cover ───────────────────────────────────────────────────────────────

const VISION_BUCKET = "vision-boards";
const VISION_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const VISION_MAX_BYTES = 16 * 1024 * 1024;

function coverUrl(page: Json): string {
  const c = page?.cover;
  if (!c) return "";
  const u = String(c.type === "external" ? c.external?.url ?? "" : c.file?.url ?? "");
  // Notion's built-in covers can come back as a path on notion.so.
  return u.startsWith("/") ? "https://www.notion.so" + u : u;
}

async function doCover(clientId: string, link: Link, overwrite: boolean) {
  const out: Json = { created: 0, updated: 0, unchanged: 0, notes: [] as string[] };
  const { data: cur, error } = await admin.from("client_dashboard")
    .select("vision_board_url").eq("client_id", clientId).maybeSingle();
  if (error) {
    if (/vision_board_url/.test(error.message)) throw new Error("Run scripts/client_vision_board.sql in Supabase first.");
    throw new Error(error.message);
  }
  if (cur?.vision_board_url && !overwrite) {
    out.unchanged = 1;
    out.notes.push("They already have a dashboard banner — tick “Replace…” to swap it for the Notion cover.");
    return out;
  }

  let src = "", from = "";
  for (const [id, label] of [[link.dashboard_id, "dashboard"], [link.crm_page_id, "CRM page"]]) {
    if (!id) continue;
    try { src = coverUrl(await notion(`/pages/${id}`)); } catch { /* try the next page */ }
    if (src) { from = label; break; }
  }
  if (!src) { out.notes.push("No cover photo on their Notion dashboard."); return out; }

  let buf: Uint8Array, type: string;
  try {
    const res = await fetch(src);
    if (!res.ok) throw new Error(String(res.status));
    buf = new Uint8Array(await res.arrayBuffer());
    type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  } catch {
    out.notes.push("Couldn't download the Notion cover photo.");
    return out;
  }
  if (type === "image/jpg") type = "image/jpeg";
  if (!VISION_TYPES.includes(type)) { out.notes.push(`The Notion cover is a ${type || "non-image"} file, which the banner can't show.`); return out; }
  if (buf.length > VISION_MAX_BYTES) { out.notes.push("The Notion cover photo is over 16MB, too large for the banner."); return out; }

  const path = `${clientId}/vision-board`;
  const up = await admin.storage.from(VISION_BUCKET).upload(path, buf, { contentType: type, upsert: true });
  if (up.error) throw new Error("Saving the cover failed: " + up.error.message);
  const pub = admin.storage.from(VISION_BUCKET).getPublicUrl(path).data.publicUrl;
  const url = `${pub}?t=${Date.now()}#pos=50,50`;
  const { error: upErr } = await admin.from("client_dashboard")
    .upsert({ client_id: clientId, vision_board_url: url }, { onConflict: "client_id" });
  if (upErr) throw new Error(upErr.message);
  if (cur?.vision_board_url) out.updated = 1; else out.created = 1;
  if (from !== "dashboard") out.notes.push(`Used the cover from their ${from}.`);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData } = await admin.auth.getUser(jwt);
  const user = userData?.user;
  if (!user) return json({ error: "not_signed_in" }, 401);
  const { data: isCoach } = await admin.rpc("is_coach", { uid: user.id });
  if (!isCoach) return json({ error: "Only the coach can import from Notion." }, 403);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const configured = !!Deno.env.get("NOTION_TOKEN");
  if (action === "status") return json({ configured });
  if (!configured) return json({ error: "NOTION_TOKEN is not set. Run: supabase secrets set NOTION_TOKEN=secret_…" });

  const dbs = {
    crm: normalizeId(Deno.env.get("NOTION_CRM_DATABASE_ID")) || DEFAULT_DBS.crm,
    homework: normalizeId(Deno.env.get("NOTION_HOMEWORK_DATABASE_ID")) || DEFAULT_DBS.homework,
    goals: normalizeId(Deno.env.get("NOTION_GOALS_DATABASE_ID")) || DEFAULT_DBS.goals,
  };

  const clientId = String(body.client_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return json({ error: "client_id is required." });
  const { data: prof, error: pErr } = await admin.from("profiles")
    .select("id, full_name, preferred_name, email, role").eq("id", clientId).maybeSingle();
  if (pErr) return json({ error: pErr.message });
  if (!prof || prof.role === "coach") return json({ error: "That client wasn't found." });
  const who: Who = { id: prof.id, full: prof.full_name ?? "", preferred: prof.preferred_name ?? "", email: prof.email ?? "" };
  const overwrite = body.overwrite === true;

  try {
    if (action === "link") {
      const { link, notes } = await doLink(dbs, who);
      await saveLink(clientId, link, notes);
      return json({ link, notes });
    }
    // Later steps reuse the link the UI got from "link" (it round-trips),
    // and look it up again when called on their own.
    const link: Link = body.link && typeof body.link === "object" ? body.link : await loadLink(clientId, dbs, who);
    if (action === "homework") return json(await doHomework(dbs, clientId, link, overwrite));
    if (action === "goals") return json(await doGoals(dbs, clientId, link, overwrite));
    if (action === "uploads") return json(await doUploads(clientId, who));
    if (action === "cookbook") return json(await doCookbook(clientId, link));
    if (action === "cover") return json(await doCover(clientId, link, overwrite));
    return json({ error: "Unknown action." });
  } catch (e) {
    return json({ error: (e as Error).message });
  }
});
