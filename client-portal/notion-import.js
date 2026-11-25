// Client portal → "Import from Notion" (coach only).
//
// Ports one client's Notion dashboard into their portal, step by step:
//   link      find them in Notion (CRM page, Notion person, dashboard, Cook Book)
//   homework  Assigned Homework → assignments (linked to a Master Assignment)
//             and to-dos (plain-text rows)
//   goals     Client Goals (+ sub-items as milestones, Quest) and the
//             Onboarding Audit goal as The Quest
//   precall   past Client Pre Call Forms → Check-ins (notion-checkins)
//   uploads   homework uploaded on those forms → attached to its assignment
//   cookbook  Cook Book → their Body page
//   cover     the cover photo on their Notion dashboard → their portal banner
// Steps run through supabase/functions/notion-client-import, except precall,
// which reuses supabase/functions/notion-checkins with a client_id filter.
// Re-running is safe: everything is keyed on its Notion page.
//
// Also "Import Cook Books" and "Import cover photos" on the roster: that one
// step for every client.
//
// portal.js calls NotionClientImport.start(sb, hooks) once, where hooks are
//   client()  → { id, name } of the client being viewed (or null)
//   clients() → [{ id, name }] on the roster
//   done(id)  → called after an import so the portal reloads that client
(function () {
  var FN = 'notion-client-import';
  var $ = function(id){ return document.getElementById(id); };
  var sb = null, hooks = {}, running = false;

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
  function plural(n, one, many){ return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  async function call(fn, body){
    var r = await sb.functions.invoke(fn, { body: body });
    if (r.error) {
      var st = r.error.context && r.error.context.status;
      if (st === 404) throw new Error('The ' + fn + ' function is not deployed yet. Run: supabase functions deploy ' + fn);
      var msg = r.error.message;
      try { var j = await r.error.context.json(); if (j && j.error) msg = j.error; } catch (e) { /* not json */ }
      throw new Error(msg);
    }
    if (r.data && r.data.error) throw new Error(r.data.error);
    return r.data || {};
  }

  // ─── log ────────────────────────────────────────────────────────────────
  var lines = [];
  function log(html, cls){ lines.push('<p' + (cls ? ' class="' + cls + '"' : '') + '>' + html + '</p>'); paint(); }
  function logList(items, cls){ if (items.length) { lines.push('<ul' + (cls ? ' class="' + cls + '"' : '') + '>' + items.map(function(i){ return '<li>' + i + '</li>'; }).join('') + '</ul>'); paint(); } }
  function replaceLast(html, cls){ lines.pop(); log(html, cls); }
  function paint(){ var el = $('cpNiLog'); el.hidden = !lines.length; el.innerHTML = lines.join(''); el.scrollTop = el.scrollHeight; }
  function notes(d){ (d.notes || []).forEach(function(n){ log(esc(n), 'is-note'); }); }
  function counts(d){
    var parts = [];
    if (d.created) parts.push(d.created + ' added');
    if (d.updated) parts.push(d.updated + ' updated');
    if (d.unchanged) parts.push(d.unchanged + ' already up to date');
    return parts.join(', ') || 'nothing new';
  }

  // ─── steps ──────────────────────────────────────────────────────────────
  var STEPS = {
    link: async function(ctx){
      log('Finding ' + esc(ctx.name) + ' in Notion…');
      var d = await call(FN, { action:'link', client_id:ctx.id });
      ctx.link = d.link;
      var found = [];
      if (d.link.crm_url) found.push('<a href="' + esc(d.link.crm_url) + '" target="_blank" rel="noopener">CRM page</a>');
      if (d.link.notion_user_id) found.push('Notion person' + (d.link.notion_user_name ? ' (' + esc(d.link.notion_user_name) + ')' : ''));
      if (d.link.cookbook) found.push('<a href="' + esc(d.link.cookbook.url) + '" target="_blank" rel="noopener">' + esc(d.link.cookbook.title) + '</a>');
      replaceLast('<b>Found:</b> ' + (found.join(' · ') || 'nothing'));
      notes(d);
    },
    homework: async function(ctx){
      log('Homework…');
      var d = await call(FN, { action:'homework', client_id:ctx.id, link:ctx.link, overwrite:ctx.overwrite });
      replaceLast('<b>Homework:</b> ' + plural(d.assignments || 0, 'assignment') + ' and ' + plural(d.todos || 0, 'to-do') + ' — ' + counts(d) + '.');
      notes(d);
    },
    goals: async function(ctx){
      log('Goals…');
      var d = await call(FN, { action:'goals', client_id:ctx.id, link:ctx.link, overwrite:ctx.overwrite });
      replaceLast('<b>Goals:</b> ' + counts(d) + '.');
      notes(d);
    },
    precall: async function(ctx){
      log('Pre-call forms…');
      var t = { created:0, updated:0, unchanged:0, errors:[] }, cursor = null, page = 0;
      do {
        page++;
        var d = await call('notion-checkins', { action:'pull', source:'precall', client_id:ctx.id, cursor:cursor });
        t.created += d.created || 0; t.updated += d.updated || 0; t.unchanged += d.unchanged || 0;
        (d.errors || []).forEach(function(e){ if (t.errors.indexOf(e) < 0) t.errors.push(e); });
        cursor = d.next_cursor;
        if (cursor) replaceLast('Pre-call forms… page ' + (page + 1));
      } while (cursor);
      replaceLast('<b>Pre-call forms:</b> ' + counts(t) + '.');
      logList(t.errors.slice(0, 6).map(esc), 'is-error');
    },
    uploads: async function(ctx){
      log('Matching homework uploads to assignments…');
      var d = await call(FN, { action:'uploads', client_id:ctx.id });
      replaceLast('<b>Homework uploads:</b> ' + plural(d.attached || 0, 'upload') + ' attached to assignments'
        + (d.unmatched && d.unmatched.length ? ', ' + d.unmatched.length + ' didn’t match one:' : '.'));
      logList((d.unmatched || []).map(function(u){
        return esc(u.name) + (u.submitted_at ? ' <span class="is-note">(' + esc(new Date(u.submitted_at).toLocaleDateString()) + ')</span>' : '');
      }));
      notes(d);
    },
    cookbook: async function(ctx){
      log('Cook Book…');
      var d = await call(FN, { action:'cookbook', client_id:ctx.id, link:ctx.link });
      replaceLast('<b>Cook Book:</b> ' + (d.created || d.updated ? 'copied to the Body page (' + plural(d.blocks || 0, 'block') + ').' : 'not imported.'));
      notes(d);
    },
    cover: async function(ctx){
      log('Cover photo…');
      var d = await call(FN, { action:'cover', client_id:ctx.id, link:ctx.link, overwrite:ctx.overwrite });
      replaceLast('<b>Cover photo:</b> ' + (d.created || d.updated ? 'now the banner on their dashboard.' : (d.unchanged ? 'kept their current banner.' : 'not imported.')));
      notes(d);
    }
  };
  // Pre-calls before uploads: uploads are matched from the imported forms.
  var ORDER = ['homework', 'goals', 'precall', 'uploads', 'cookbook', 'cover'];

  // ─── one client ─────────────────────────────────────────────────────────
  function stepBoxes(){ return Array.prototype.slice.call(document.querySelectorAll('[data-ni-step]')); }
  // "Select all" until every step is ticked, then "Deselect all".
  function syncToggle(){
    var all = stepBoxes().every(function(el){ return el.checked; });
    $('cpNiToggleAll').textContent = all ? 'Deselect all' : 'Select all';
  }
  function toggleAll(){
    if (running) return;
    var boxes = stepBoxes();
    var check = !boxes.every(function(el){ return el.checked; });
    boxes.forEach(function(el){ el.checked = check; });
    syncToggle();
  }

  function open(){
    var c = hooks.client && hooks.client();
    if (!c) return;
    lines = []; paint();
    $('cpNiTitle').textContent = 'Import ' + (c.name || 'client') + ' from Notion';
    $('cpNiSub').textContent = 'Copies their Notion dashboard into this portal. Safe to run again — nothing is duplicated.';
    $('cpNiSteps').hidden = false;
    syncToggle();
    $('cpNiOverwrite').parentNode.hidden = false;
    $('cpNiRun').hidden = false;
    $('cpNiRun').disabled = false;
    $('cpNiRun').textContent = 'Import';
    $('cpNiRun').onclick = runOne;
    $('cpNiOverlay').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function close(){
    if (running) return;
    $('cpNiOverlay').hidden = true;
    document.body.style.overflow = '';
  }

  async function runOne(){
    if (running) return;
    var c = hooks.client && hooks.client();
    if (!c) return;
    var picked = ORDER.filter(function(k){ var el = document.querySelector('[data-ni-step="' + k + '"]'); return el && el.checked; });
    if (!picked.length) { lines = []; log('Pick at least one thing to import.', 'is-error'); return; }
    var ctx = { id:c.id, name:c.name || 'this client', overwrite:$('cpNiOverwrite').checked, link:null };
    running = true;
    $('cpNiRun').disabled = true;
    $('cpNiRun').textContent = 'Importing…';
    lines = []; paint();
    var failed = false;
    try {
      await STEPS.link(ctx);
      for (var i = 0; i < picked.length; i++) {
        try { await STEPS[picked[i]](ctx); }
        catch (e) { replaceLast('<b>' + esc(picked[i]) + ':</b> ' + esc(e.message), 'is-error'); failed = true; }
      }
    } catch (e) {
      replaceLast(esc(e.message), 'is-error'); failed = true;
    } finally {
      running = false;
      $('cpNiRun').disabled = false;
      $('cpNiRun').textContent = 'Import again';
      log(failed ? 'Finished with problems — see above.' : 'Done.', failed ? 'is-error' : '');
      if (hooks.done) { try { await hooks.done(c.id); } catch (e) { /* reload is best-effort */ } }
    }
  }

  // ─── one step for every client (roster) ─────────────────────────────────
  var BULK = {
    cookbook: {
      title: 'Import Cook Books', thing: 'Cook Book', none: 'No Cook Book found in Notion for: ',
      sub: function(n){ return 'Copies each client’s Cook Book from their Notion dashboard to their Body page (' + n + '). Safe to run again.'; },
      skip: function(link){ return !link.cookbook; },
      ok: function(d){ return d.created || d.updated; },
      line: function(d){ return plural(d.blocks || 0, 'block') + '.'; }
    },
    cover: {
      title: 'Import cover photos', thing: 'cover photo', none: 'No cover photo copied for: ',
      sub: function(n){ return 'Copies the cover photo on each client’s Notion dashboard to the banner on their portal dashboard (' + n + '). Banners already set in the portal are kept unless you tick the box below.'; },
      overwrite: true,
      skip: function(){ return false; },
      ok: function(d){ return d.created || d.updated; },
      line: function(d){ return d.created || d.updated ? 'banner set.' : ((d.notes || [])[0] ? esc(d.notes[0]) : 'nothing to copy.'); }
    }
  };

  function openAll(kind){
    var b = BULK[kind];
    var list = (hooks.clients && hooks.clients()) || [];
    lines = []; paint();
    $('cpNiTitle').textContent = b.title;
    $('cpNiSub').textContent = b.sub(plural(list.length, 'client'));
    $('cpNiSteps').hidden = true;
    $('cpNiOverwrite').checked = false;
    $('cpNiOverwrite').parentNode.hidden = !b.overwrite;
    $('cpNiRun').hidden = false;
    $('cpNiRun').disabled = !list.length;
    $('cpNiRun').textContent = b.title;
    $('cpNiRun').onclick = function(){ runAll(kind); };
    $('cpNiOverlay').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  async function runAll(kind){
    if (running) return;
    var b = BULK[kind];
    var list = (hooks.clients && hooks.clients()) || [];
    var overwrite = !!b.overwrite && $('cpNiOverwrite').checked;
    running = true;
    $('cpNiRun').disabled = true;
    $('cpNiRun').textContent = 'Importing…';
    lines = []; paint();
    var ok = 0, none = [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      log(esc(c.name) + '…');
      try {
        var l = await call(FN, { action:'link', client_id:c.id });
        if (b.skip(l.link)) { none.push(c.name); lines.pop(); paint(); continue; }
        var d = await call(FN, { action:kind, client_id:c.id, link:l.link, overwrite:overwrite });
        if (b.ok(d)) ok++; else none.push(c.name);
        replaceLast('<b>' + esc(c.name) + ':</b> ' + b.line(d), b.ok(d) ? '' : 'is-note');
      } catch (e) {
        replaceLast('<b>' + esc(c.name) + ':</b> ' + esc(e.message), 'is-error');
      }
    }
    log('<b>' + plural(ok, b.thing) + ' imported.</b>');
    if (none.length && kind === 'cookbook') log(b.none + esc(none.join(', ')) + '.', 'is-note');
    running = false;
    $('cpNiRun').disabled = false;
    $('cpNiRun').textContent = 'Import again';
  }

  window.NotionClientImport = {
    start: function(client, h){
      sb = client; hooks = h || {};
      $('cpNotionImportBtn').addEventListener('click', open);
      $('cpNiToggleAll').addEventListener('click', toggleAll);
      stepBoxes().forEach(function(el){ el.addEventListener('change', syncToggle); });
      $('cpNiCookAllBtn').addEventListener('click', function(){ openAll('cookbook'); });
      $('cpNiCoverAllBtn').addEventListener('click', function(){ openAll('cover'); });
      document.querySelectorAll('[data-ni-close]').forEach(function(el){ el.addEventListener('click', close); });
      document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && !$('cpNiOverlay').hidden) close(); });
    }
  };
})();
