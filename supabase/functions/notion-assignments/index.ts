// Two-way sync between a Notion database and the master Assignment Library
// (public.assignment_library — see scripts/assignment_library.sql).
//
// The library page (assignment-library/library.js) calls this; the Notion
// integration token stays here and never reaches the browser. Only the coach
// (public.is_coach) can call it.
//
// Actions (POST JSON, signed-in Supabase user required):
//   { action: "status" }                         → { configured, default_database_id }
//   { action: "databases" }                      → { databases: [{ id, title, url }] }
//   { action: "pull", database_id, cursor? }     → { created, updated, skipped, next_cursor }
//       Reads one page (25 rows) of the Notion database plus each row's page
//       body, and upserts them into the library keyed on notion_page_id. The
//       caller loops while next_cursor is set.
//   { action: "fetch_url", url }                → { text, content_type, url }
//       Fetches a public web page / file for "Import → From URL" when the
//       browser can't (CORS). http(s) only, private hosts refused, 2 MB cap.
//       Works without NOTION_TOKEN.
//   { action: "notion_url", url }               → { rows: [library row…] }
//       Reads one Notion page — or the first 100 rows of a database — for the
//       import preview, without saving anything.
//   { action: "push", database_id, ids: [uuid] } → { created, updated, failed: [{ id, error }] }
//       Writes up to 25 library rows to Notion: creates a page for rows that
//       were never synced, otherwise updates the page's properties and
//       replaces its body with the current instructions.
// App-level failures come back as 200 { error: "..." } so the page can tell
// "function deployed, needs setup" from "function not deployed".
//
// Notion database columns it understands (names are case-insensitive, all
// optional except the title column):
//   <title column>           → title
//   Core                     → core_key (Body / Mind / Art / Soul / Career / Life)
//   Week                     → week (number, or text like "Week 3")
//   Code                     → e.g. "B.1" (Body, Week 1); fills core/week when
//                              those columns are missing. Written on push when
//                              it is a text column (formula columns are left alone).
//   Category | Type | Section → category
//   Tags                     → tags (multi-select)
//   Due in days | Due days   → default_due_days (number)
//   Instructions | Description → instructions, used when the page body is empty
//   Page cover               → cover_url. Notion's own gallery covers and
//                              linked images are kept as links; images
//                              uploaded to Notion are copied into the
//                              assignment-files bucket (Notion's file links
//                              expire after an hour). Push sets the cover.
//   Relevance / Outcome / Implementation / Alternative / Examples (text) →
//                              editor sections. The page body is also split on
//                              "## Relevance", "## To Do", … headings (or
//                              "RELEVANCE | …" lines); push writes it that way.
//
// Secrets: NOTION_TOKEN (an internal integration secret; share the database
// with that integration in Notion), optionally NOTION_ASSIGNMENTS_DATABASE_ID
// as the default database. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are set by
// Supabase.
//
// Deploy:  supabase functions deploy notion-assignments
//          supabase secrets set NOTION_TOKEN=secret_xxx

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const NOTION_VERSION = "2022-06-28";
const PAGE_SIZE = 25;

const CORES: Record<string, string> = {
  body: "Body", mind: "Mind", art: "Art", soul: "Soul", career: "Career", life: "Life",
};

// deno-lint-ignore no-explicit-any
type Json = any;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// Accepts a bare id, a dashed uuid or a full notion.so URL.
function normalizeId(raw: unknown): string {
  const s = String(raw ?? "").trim();
  const m = s.replace(/-/g, "").match(/[0-9a-f]{32}/i);
  return m ? m[0].toLowerCase() : "";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function notion(path: string, init: { method?: string; body?: unknown } = {}): Promise<Json> {
  const token = Deno.env.get("NOTION_TOKEN") ?? "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch("https://api.notion.com/v1" + path, {
      method: init.method ?? "GET",
      headers: {
        Authorization: "Bearer " + token,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
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

// ─── Notion → library ────────────────────────────────────────────────────

function richText(rt: Json[] | undefined): string {
  return (rt ?? []).map((t: Json) => {
    const text = t.plain_text ?? "";
    const href = t.href;
    return href && href !== text ? `${text} (${href})` : text;
  }).join("");
}

function findProp(props: Json, names: string[]): Json | null {
  const wanted = names.map((n) => n.toLowerCase());
  for (const [key, value] of Object.entries(props ?? {})) {
    if (wanted.includes(key.trim().toLowerCase())) return value;
  }
  return null;
}

function propText(p: Json): string {
  if (!p) return "";
  switch (p.type) {
    case "title": return richText(p.title);
    case "rich_text": return richText(p.rich_text);
    case "select": return p.select?.name ?? "";
    case "status": return p.status?.name ?? "";
    case "multi_select": return (p.multi_select ?? []).map((o: Json) => o.name).join(", ");
    case "number": return p.number == null ? "" : String(p.number);
    case "url": return p.url ?? "";
    case "formula": return p.formula?.string ?? (p.formula?.number != null ? String(p.formula.number) : "");
    default: return "";
  }
}

const LETTER_CORE: Record<string, string> = { B: "body", M: "mind", A: "art", S: "soul", C: "career", L: "life" };

function weekFrom(raw: string): number | null {
  const m = String(raw ?? "").trim().match(/^(?:w(?:ee)?k?\.?\s*)?(\d{1,2})$/i);
  const n = m ? Number(m[1]) : 0;
  return n >= 1 && n <= 99 ? n : null;
}

function codeFrom(raw: string): { core_key: string; week: number | null; category?: string } | null {
  const a = String(raw ?? "").trim().match(/^([BMASCLW])A(?:\s*[.\-]?\s*(\d{1,2}))?$/i);
  if (a) return { core_key: LETTER_CORE[a[1].toUpperCase()] ?? "", week: a[2] ? weekFrom(a[2]) : null, category: "Article" };
  const m = String(raw ?? "").trim().match(/^([A-Za-z])\s*[.\-]?\s*(\d{1,2})$/);
  const week = m ? weekFrom(m[2]) : null;
  return m && week != null ? { core_key: LETTER_CORE[m[1].toUpperCase()] ?? "", week } : null;
}

// Notion titles often lead with the code ("B.1 Journal", "[B.1] Journal",
// "B.1 - Journal"). The library shows the code on its own, so split it off.
const TITLE_CODE_RE = /^\s*[\[(]?\s*([BMASCL])\s*[.\-]?\s*(\d{1,2})(?![A-Za-z0-9])\s*[\])]?\s*(?:[-–—:·|.)]\s*)?(?=\S)/i;

function splitTitleCode(raw: string): { title: string; code: { core_key: string; week: number } | null } {
  const title = String(raw ?? "").trim();
  const m = title.match(TITLE_CODE_RE);
  const rest = m ? title.slice(m[0].length).trim() : "";
  if (!m || !rest) return { title, code: null };
  return { title: rest, code: { core_key: LETTER_CORE[m[1].toUpperCase()], week: Number(m[2]) } };
}

// Articles add an "A" after the core letter: BA (Body article), BA.2 with a week.
function isArticle(category: string | null | undefined): boolean {
  return /^articles?$/i.test(String(category ?? "").trim());
}

function codeFor(coreKey: string, week: number | null, category?: string | null): string {
  const art = isArticle(category);
  if (week == null && !art) return "";
  return (CORES[coreKey]?.[0] ?? "W") + (art ? "A" : "") + (week == null ? "" : "." + week);
}

// Page body ⇄ editor sections. The body is written as "## Relevance",
// "## Outcome", "## To Do", "## Implementation", "## Alternative",
// "## Examples" headings ("RELEVANCE | text" lines are read too). Text before
// any heading, or a body with none, is treated as To Do (instructions).
const SECTIONS: { key: string; label: string }[] = [
  { key: "relevance", label: "Relevance" },
  { key: "outcome", label: "Outcome" },
  { key: "instructions", label: "To Do" },
  { key: "implementation", label: "Implementation" },
  { key: "alternative", label: "Alternative" },
  { key: "examples", label: "Examples" },
];
const SECTION_ALIASES: Record<string, string> = {
  "relevance": "relevance", "why": "relevance",
  "outcome": "outcome", "outcomes": "outcome",
  "to do": "instructions", "todo": "instructions", "to-do": "instructions", "instructions": "instructions", "steps": "instructions",
  "implementation": "implementation",
  "alternative": "alternative", "alternatives": "alternative",
  "example": "examples", "examples": "examples",
};
const SECTION_RE = /^\s*(?:#{1,3}\s*)?\**\s*(relevance|why|outcomes?|to[ -]?do|instructions|steps|implementation|alternatives?|examples?)\s*\**\s*(?:[|:]\s*(.*))?$/i;

function splitSections(text: string): Record<string, string> {
  const out: Record<string, string[]> = {};
  SECTIONS.forEach((s) => out[s.key] = []);
  let cur = "instructions";
  for (const line of String(text ?? "").split("\n")) {
    const m = line.match(SECTION_RE);
    if (m) { cur = SECTION_ALIASES[m[1].toLowerCase()]; if (m[2]?.trim()) out[cur].push(m[2].trim()); continue; }
    out[cur].push(line);
  }
  const res: Record<string, string> = {};
  for (const k of Object.keys(out)) {
    // Undo the common indent of the section ("TO DO |\n  [ ] step").
    const lines = out[k];
    const ind = Math.min(...lines.filter((l) => l.trim()).map((l) => (l.match(/^ */) ?? [""])[0].length), 99);
    res[k] = lines.map((l) => l.slice(ind === 99 ? 0 : ind)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  return res;
}

function joinSections(row: Json): string {
  const filled = SECTIONS.filter((s) => String(row[s.key] ?? "").trim());
  if (filled.length === 1 && filled[0].key === "instructions") return String(row.instructions).trim();
  return filled.map((s) => "## " + s.label + "\n" + String(row[s.key]).trim()).join("\n\n");
}

function coreKeyFrom(label: string): string {
  const first = label.split(",")[0].trim().toLowerCase();
  return CORES[first] ? first : "";
}

function blockText(b: Json): string {
  const v = b[b.type] ?? {};
  const rt = richText(v.rich_text);
  switch (b.type) {
    case "paragraph": return rt;
    case "heading_1": return "# " + rt;
    case "heading_2": return "## " + rt;
    case "heading_3": return "### " + rt;
    case "bulleted_list_item": return "- " + rt;
    case "numbered_list_item": return "1. " + rt;
    case "to_do": return (v.checked ? "[x] " : "[ ] ") + rt;
    case "quote": return "> " + rt;
    case "callout": return (v.icon?.emoji ? v.icon.emoji + " " : "") + rt;
    case "toggle": return rt;
    case "code": return rt;
    case "divider": return "---";
    case "bookmark": case "embed": case "link_preview": return v.url ?? "";
    case "image": case "video": case "file": case "pdf": {
      const url = v.external?.url ?? "";
      const caption = richText(v.caption);
      return [caption, url].filter(Boolean).join(" ") || "";
    }
    case "child_page": return v.title ?? "";
    default: return rt;
  }
}

async function pageBody(blockId: string, depth = 0): Promise<string[]> {
  const lines: string[] = [];
  let cursor: string | undefined;
  do {
    const q = "?page_size=100" + (cursor ? "&start_cursor=" + cursor : "");
    const data = await notion(`/blocks/${blockId}/children${q}`);
    for (const b of data.results ?? []) {
      const text = blockText(b);
      const indent = "  ".repeat(depth);
      if (text || b.type === "paragraph") lines.push(text ? indent + text : "");
      if (b.has_children && depth < 2 && b.type !== "child_page" && b.type !== "child_database") {
        lines.push(...await pageBody(b.id, depth + 1));
      }
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return lines;
}

function tidy(lines: string[]): string {
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ─── Cover images ────────────────────────────────────────────────────────

const COVER_BUCKET = "assignment-files";
const COVER_TYPES: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
};
// deno-lint-ignore no-explicit-any
let storage: any = null;

// Notion gallery covers come back as "/images/page-cover/…" on older pages.
function absoluteCover(url: string): string {
  const u = String(url ?? "").trim();
  if (!u) return "";
  if (u.startsWith("/")) return "https://www.notion.so" + u;
  return /^https:\/\//i.test(u) ? u : "";
}

async function coverFromPage(page: Json): Promise<string> {
  const c = page.cover;
  if (!c) return "";
  if (c.type === "external") return absoluteCover(c.external?.url);
  if (c.type !== "file" || !c.file?.url) return "";
  // Uploaded to Notion: the signed URL dies in an hour, so keep a copy.
  if (!storage) return "";
  try {
    const res = await fetch(c.file.url);
    if (!res.ok) return "";
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const ext = COVER_TYPES[type];
    if (!ext) return "";
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > 25 * 1024 * 1024) return "";
    const path = `notion-covers/${normalizeId(page.id)}.${ext}`;
    const up = await storage.from(COVER_BUCKET).upload(path, buf, { contentType: type, upsert: true });
    if (up.error) return "";
    // Version the link so browsers pick up a changed cover after re-import.
    const stamp = Date.parse(page.last_edited_time ?? "") || Date.now();
    return storage.from(COVER_BUCKET).getPublicUrl(path).data.publicUrl + "?v=" + stamp;
  } catch {
    return "";
  }
}

async function rowFromPage(page: Json) {
  const props = page.properties ?? {};
  const titleProp = Object.values(props).find((p: Json) => p?.type === "title");
  const split = splitTitleCode(propText(titleProp));
  const title = split.title;
  const coreLabel = propText(findProp(props, ["core", "cores", "core key"]));
  const code = codeFrom(propText(findProp(props, ["code", "assignment code"]))) ?? split.code;
  const week = weekFrom(propText(findProp(props, ["week", "wk", "week #", "week number"])));
  const category = propText(findProp(props, ["category", "type", "section", "group"])).trim();
  const tagsProp = findProp(props, ["tags", "tag", "labels"]);
  const tags = tagsProp?.type === "multi_select"
    ? (tagsProp.multi_select ?? []).map((o: Json) => o.name)
    : propText(tagsProp).split(",").map((s) => s.trim()).filter(Boolean);
  const dueRaw = propText(findProp(props, ["due in days", "due days", "default due days", "days to complete", "due"]));
  const due = dueRaw && /^\d+$/.test(dueRaw.trim()) ? Number(dueRaw.trim()) : null;
  const propInstructions = propText(findProp(props, ["instructions", "description", "details", "body"])).trim();
  const body = splitSections(tidy(await pageBody(page.id)));

  return {
    title: title || "Untitled assignment",
    instructions: body.instructions || propInstructions,
    relevance: body.relevance || propText(findProp(props, ["relevance"])).trim(),
    outcome: body.outcome || propText(findProp(props, ["outcome", "outcomes"])).trim(),
    implementation: body.implementation || propText(findProp(props, ["implementation"])).trim(),
    alternative: body.alternative || propText(findProp(props, ["alternative", "alternatives"])).trim(),
    examples: body.examples || propText(findProp(props, ["examples", "example"])).trim(),
    cover_url: await coverFromPage(page),
    core_key: coreKeyFrom(coreLabel) || code?.core_key || "",
    week: week ?? code?.week ?? null,
    category: category || code?.category || "",
    tags,
    default_due_days: due,
    source: "notion",
    notion_page_id: normalizeId(page.id),
    notion_url: page.url ?? "",
    notion_synced_at: new Date().toISOString(),
  };
}

// ─── library → Notion ────────────────────────────────────────────────────

function chunks(text: string, size = 1900): Json[] {
  const out: Json[] = [];
  for (let i = 0; i < text.length; i += size) out.push({ type: "text", text: { content: text.slice(i, i + size) } });
  return out.length ? out : [];
}

function textBlocks(instructions: string): Json[] {
  const blocks: Json[] = [];
  for (const raw of String(instructions ?? "").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    const t = line.trim();
    if (!t) continue;
    let m: RegExpMatchArray | null;
    const block = (type: string, text: string, extra: Json = {}) =>
      blocks.push({ object: "block", type, [type]: { rich_text: chunks(text), ...extra } });
    if (t === "---") blocks.push({ object: "block", type: "divider", divider: {} });
    else if ((m = t.match(/^###\s+(.*)/))) block("heading_3", m[1]);
    else if ((m = t.match(/^##\s+(.*)/))) block("heading_2", m[1]);
    else if ((m = t.match(/^#\s+(.*)/))) block("heading_1", m[1]);
    else if ((m = t.match(/^\[( |x|X)\]\s+(.*)/))) block("to_do", m[2], { checked: m[1] !== " " });
    else if ((m = t.match(/^[-*•]\s+(.*)/))) block("bulleted_list_item", m[1]);
    else if ((m = t.match(/^\d+[.)]\s+(.*)/))) block("numbered_list_item", m[1]);
    else if ((m = t.match(/^>\s?(.*)/))) block("quote", m[1]);
    else block("paragraph", t);
  }
  return blocks;
}

function propsFor(row: Json, schema: Json): Json {
  const props: Json = {};
  const entries = Object.entries(schema.properties ?? {}) as [string, Json][];
  const titleName = entries.find(([, p]) => p.type === "title")?.[0] ?? "Name";
  const named = (names: string[]) => entries.find(([k]) => names.includes(k.trim().toLowerCase()));
  // No Code column in Notion → keep the code in the page title there, as the
  // database had it, so pushing doesn't strip "B.1" off Notion pages.
  const titleCode = named(["code", "assignment code"]) ? "" : codeFor(row.core_key, row.week, row.category);
  const bareTitle = splitTitleCode(row.title || "").title || "Untitled assignment";
  props[titleName] = { title: chunks(titleCode ? titleCode + " " + bareTitle : bareTitle) };

  const setText = (entry: [string, Json] | undefined, value: string, list?: string[]) => {
    if (!entry) return;
    const [name, def] = entry;
    if (def.type === "select") props[name] = { select: value ? { name: value.replace(/,/g, " ") } : null };
    else if (def.type === "multi_select") props[name] = { multi_select: (list ?? (value ? [value] : [])).map((n) => ({ name: n.replace(/,/g, " ") })) };
    else if (def.type === "rich_text") props[name] = { rich_text: chunks(list ? list.join(", ") : value) };
  };

  setText(named(["core", "cores", "core key"]), CORES[row.core_key] ?? "");
  setText(named(["category", "type", "section", "group"]), row.category ?? "");
  setText(named(["code", "assignment code"]), codeFor(row.core_key, row.week, row.category));
  const week = named(["week", "wk", "week #", "week number"]);
  if (week && week[1].type === "number") props[week[0]] = { number: row.week ?? null };
  else setText(week, row.week == null ? "" : "Week " + row.week);
  setText(named(["tags", "tag", "labels"]), (row.tags ?? []).join(", "), row.tags ?? []);
  const due = named(["due in days", "due days", "default due days", "days to complete"]);
  if (due && due[1].type === "number") props[due[0]] = { number: row.default_due_days ?? null };
  for (const [key, names] of [["relevance", ["relevance"]], ["outcome", ["outcome", "outcomes"]], ["implementation", ["implementation"]], ["alternative", ["alternative", "alternatives"]], ["examples", ["examples", "example"]]] as [string, string[]][]) {
    const col = named(names);
    if (col && col[1].type === "rich_text") props[col[0]] = { rich_text: chunks(row[key] ?? "").slice(0, 100) };
  }
  const instr = named(["instructions", "description", "details"]);
  if (instr && instr[1].type === "rich_text") props[instr[0]] = { rich_text: chunks(row.instructions ?? "").slice(0, 100) };
  return props;
}

async function appendBlocks(pageId: string, blocks: Json[]) {
  for (let i = 0; i < blocks.length; i += 100) {
    await notion(`/blocks/${pageId}/children`, { method: "PATCH", body: { children: blocks.slice(i, i + 100) } });
  }
}

async function clearBody(pageId: string) {
  let cursor: string | undefined;
  const ids: string[] = [];
  do {
    const q = "?page_size=100" + (cursor ? "&start_cursor=" + cursor : "");
    const data = await notion(`/blocks/${pageId}/children${q}`);
    for (const b of data.results ?? []) {
      if (b.type !== "child_page" && b.type !== "child_database") ids.push(b.id);
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  for (const id of ids) await notion(`/blocks/${id}`, { method: "DELETE" });
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
  if (!isCoach) return json({ error: "Only the coach can sync the assignment library." }, 403);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const configured = !!Deno.env.get("NOTION_TOKEN");
  const defaultDb = normalizeId(Deno.env.get("NOTION_ASSIGNMENTS_DATABASE_ID"));

  if (action === "status") return json({ configured, default_database_id: defaultDb });

  if (action === "fetch_url") {
    let url: URL;
    try { url = new URL(String(body.url ?? "")); } catch { return json({ error: "That doesn't look like a link." }); }
    if (!/^https?:$/.test(url.protocol)) return json({ error: "Only http(s) links can be imported." });
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") ||
        /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host.includes(":")) {
      return json({ error: "That host can't be fetched." });
    }
    try {
      const res = await fetch(url.toString(), { redirect: "follow", headers: { "User-Agent": "assignment-library-import" } });
      if (!res.ok) return json({ error: `The link returned ${res.status}. Is it public?` });
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length > 2_000_000) return json({ error: "That file is over 2 MB." });
      return json({ text: new TextDecoder().decode(buf), content_type: res.headers.get("content-type") ?? "", url: res.url });
    } catch (e) {
      return json({ error: "Could not fetch the link: " + (e as Error).message });
    }
  }

  if (!configured) {
    return json({ error: "NOTION_TOKEN is not set. Add it with: supabase secrets set NOTION_TOKEN=secret_…" });
  }

  try {
    if (action === "databases") {
      const data = await notion("/search", {
        method: "POST",
        body: { filter: { property: "object", value: "database" }, page_size: 50 },
      });
      const databases = (data.results ?? []).map((d: Json) => ({
        id: normalizeId(d.id),
        title: richText(d.title) || "Untitled database",
        url: d.url ?? "",
      }));
      return json({ databases });
    }

    if (action === "notion_url") {
      const id = normalizeId(body.url);
      if (!id) return json({ error: "That isn't a Notion link." });
      try {
        const page = await notion(`/pages/${id}`);
        return json({ rows: [await rowFromPage(page)] });
      } catch (e) {
        if ((e as Json).status !== 404 && (e as Json).status !== 400) throw e;
      }
      const data = await notion(`/databases/${id}/query`, { method: "POST", body: { page_size: 100 } });
      const rows = [];
      for (const page of data.results ?? []) {
        if (!page.archived && !page.in_trash) rows.push(await rowFromPage(page));
      }
      return json({ rows, more: !!data.has_more });
    }

    const databaseId = normalizeId(body.database_id) || defaultDb;
    if (!databaseId) return json({ error: "Pick a Notion database first." });

    if (action === "pull") {
      const query: Json = { page_size: PAGE_SIZE };
      if (body.cursor) query.start_cursor = String(body.cursor);
      const data = await notion(`/databases/${databaseId}/query`, { method: "POST", body: query });

      const rows = [];
      for (const page of data.results ?? []) {
        if (page.archived || page.in_trash) continue;
        rows.push(await rowFromPage(page));
      }

      const pageIds = rows.map((r) => r.notion_page_id);
      const { data: existing } = pageIds.length
        ? await admin.from("assignment_library").select("id, notion_page_id").in("notion_page_id", pageIds)
        : { data: [] as Json[] };
      const known = new Set((existing ?? []).map((r: Json) => r.notion_page_id));

      let created = 0, updated = 0;
      if (rows.length) {
        let { error } = await admin.from("assignment_library").upsert(rows, { onConflict: "notion_page_id" });
        if (error && /cover_url/.test(error.message)) {
          // scripts/assignment_library.sql not re-run yet — sync without covers.
          rows.forEach((r: Json) => delete r.cover_url);
          ({ error } = await admin.from("assignment_library").upsert(rows, { onConflict: "notion_page_id" }));
        }
        if (error) return json({ error: error.message });
        rows.forEach((r) => known.has(r.notion_page_id) ? updated++ : created++);
      }
      return json({
        created, updated, skipped: (data.results ?? []).length - rows.length,
        next_cursor: data.has_more ? data.next_cursor : null,
      });
    }

    if (action === "push") {
      const ids = (Array.isArray(body.ids) ? body.ids : []).slice(0, PAGE_SIZE).map(String);
      if (!ids.length) return json({ created: 0, updated: 0, failed: [] });
      const schema = await notion(`/databases/${databaseId}`);
      const { data: rows, error } = await admin.from("assignment_library").select("*").in("id", ids);
      if (error) return json({ error: error.message });

      let created = 0, updated = 0;
      const failed: Json[] = [];
      for (const row of rows ?? []) {
        try {
          const properties = propsFor(row, schema);
          const blocks = textBlocks(joinSections(row));
          // Cover: set it when the library has one. An empty cover leaves
          // Notion's alone, so a cover that couldn't be imported isn't wiped.
          const cover = /^https:\/\//i.test(String(row.cover_url ?? ""))
            ? { type: "external", external: { url: String(row.cover_url) } } : undefined;
          let page: Json = null;

          if (row.notion_page_id) {
            try {
              page = await notion(`/pages/${row.notion_page_id}`, { method: "PATCH", body: { properties, ...(cover ? { cover } : {}) } });
              if (page.archived || page.in_trash) page = null;
            } catch (e) {
              if ((e as Json).status !== 404) throw e;
              page = null; // deleted in Notion — recreate below
            }
            if (page) {
              await clearBody(page.id);
              await appendBlocks(page.id, blocks);
              updated++;
            }
          }
          if (!page) {
            page = await notion("/pages", {
              method: "POST",
              body: { parent: { database_id: databaseId }, properties, ...(cover ? { cover } : {}), children: blocks.slice(0, 100) },
            });
            if (blocks.length > 100) await appendBlocks(page.id, blocks.slice(100));
            created++;
          }

          await admin.from("assignment_library").update({
            notion_page_id: normalizeId(page.id),
            notion_url: page.url ?? "",
            notion_synced_at: new Date().toISOString(),
          }).eq("id", row.id);
        } catch (e) {
          failed.push({ id: row.id, title: row.title, error: (e as Error).message });
        }
      }
      return json({ created, updated, failed });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message });
  }
});
