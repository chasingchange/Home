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
//   Category | Type | Section → category
//   Tags                     → tags (multi-select)
//   Due in days | Due days   → default_due_days (number)
//   Instructions | Description → instructions, used when the page body is empty
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

async function rowFromPage(page: Json) {
  const props = page.properties ?? {};
  const titleProp = Object.values(props).find((p: Json) => p?.type === "title");
  const title = propText(titleProp).trim();
  const coreLabel = propText(findProp(props, ["core", "cores", "core key"]));
  const category = propText(findProp(props, ["category", "type", "section", "group"])).trim();
  const tagsProp = findProp(props, ["tags", "tag", "labels"]);
  const tags = tagsProp?.type === "multi_select"
    ? (tagsProp.multi_select ?? []).map((o: Json) => o.name)
    : propText(tagsProp).split(",").map((s) => s.trim()).filter(Boolean);
  const dueRaw = propText(findProp(props, ["due in days", "due days", "default due days", "days to complete", "due"]));
  const due = dueRaw && /^\d+$/.test(dueRaw.trim()) ? Number(dueRaw.trim()) : null;
  const propInstructions = propText(findProp(props, ["instructions", "description", "details", "body"])).trim();
  const body = tidy(await pageBody(page.id));

  return {
    title: title || "Untitled assignment",
    instructions: body || propInstructions,
    core_key: coreKeyFrom(coreLabel),
    category,
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
  props[titleName] = { title: chunks(row.title || "Untitled assignment") };

  const named = (names: string[]) => entries.find(([k]) => names.includes(k.trim().toLowerCase()));
  const setText = (entry: [string, Json] | undefined, value: string, list?: string[]) => {
    if (!entry) return;
    const [name, def] = entry;
    if (def.type === "select") props[name] = { select: value ? { name: value.replace(/,/g, " ") } : null };
    else if (def.type === "multi_select") props[name] = { multi_select: (list ?? (value ? [value] : [])).map((n) => ({ name: n.replace(/,/g, " ") })) };
    else if (def.type === "rich_text") props[name] = { rich_text: chunks(list ? list.join(", ") : value) };
  };

  setText(named(["core", "cores", "core key"]), CORES[row.core_key] ?? "");
  setText(named(["category", "type", "section", "group"]), row.category ?? "");
  setText(named(["tags", "tag", "labels"]), (row.tags ?? []).join(", "), row.tags ?? []);
  const due = named(["due in days", "due days", "default due days", "days to complete"]);
  if (due && due[1].type === "number") props[due[0]] = { number: row.default_due_days ?? null };
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
        const { error } = await admin.from("assignment_library").upsert(rows, { onConflict: "notion_page_id" });
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
          const blocks = textBlocks(row.instructions);
          let page: Json = null;

          if (row.notion_page_id) {
            try {
              page = await notion(`/pages/${row.notion_page_id}`, { method: "PATCH", body: { properties } });
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
              body: { parent: { database_id: databaseId }, properties, children: blocks.slice(0, 100) },
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
