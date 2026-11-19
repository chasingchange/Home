// Master Assignment Library (coach only).
//
// Data: public.assignment_library + client_assignments.library_id
// (scripts/assignment_library.sql). Assigning copies a template into each
// client's client_assignments, which is what their portal To Do's tab reads.
// Notion live sync goes through the notion-assignments Edge Function
// (supabase/functions/notion-assignments); file import/export runs here in
// the browser (JSZip handles Notion's Markdown & CSV export).
(function () {
  var SUPABASE_URL = window.CC_SUPABASE_URL || 'https://datrgkjqwyfcbmtwwifm.supabase.co';
  var SUPABASE_KEY = window.CC_SUPABASE_KEY || 'sb_publishable_HrGR9fNaldor1FvDa0sDWA_VM3EPTZ9';
  var COACH_EMAIL = 'tywadebusiness@gmail.com';
  var NOTION_FN = 'notion-assignments';
  var DB_KEY = 'ccAssignLibNotionDb';
  var WEEK_KEY = 'ccAssignLibWeek';

  var CORE_DEFS = [
    { key:'body',   label:'Body',   color:'#77d770' },
    { key:'mind',   label:'Mind',   color:'#2a9df0' },
    { key:'art',    label:'Art',    color:'#ffbd59' },
    { key:'soul',   label:'Soul',   color:'#aa70d7' },
    { key:'career', label:'Career', color:'#f02348' },
    { key:'life',   label:'Life',   color:'#f58b1c' }
  ];
  var CORE_BY_KEY = {}, CORE_BY_LETTER = {};
  CORE_DEFS.forEach(function(c){ CORE_BY_KEY[c.key] = c; CORE_BY_LETTER[c.label[0]] = c.key; });

  // Editor sections, in order. `instructions` (TO DO) is the original column,
  // so homework sent before sections existed still reads fine.
  var SECTIONS = [
    { key:'relevance',      label:'Relevance' },
    { key:'outcome',        label:'Outcome' },
    { key:'instructions',   label:'To Do', main:true },
    { key:'implementation', label:'Implementation' },
    { key:'alternative',    label:'Alternative' },
    { key:'examples',       label:'Examples' }
  ];
  var SECTION_KEYS = SECTIONS.map(function(x){ return x.key; });
  var SECTION_ALIASES = {
    'relevance':'relevance', 'outcome':'outcome', 'outcomes':'outcome',
    'to do':'instructions', 'todo':'instructions', 'to-do':'instructions', 'instructions':'instructions', 'steps':'instructions',
    'implementation':'implementation', 'alternative':'alternative', 'alternatives':'alternative',
    'example':'examples', 'examples':'examples'
  };
  // "RELEVANCE | text", "## Relevance", "**To Do:**", "EXAMPLES |" …
  var SECTION_RE = /^\s*(?:#{1,3}\s*)?\**\s*(relevance|outcomes?|to[ -]?do|instructions|steps|implementation|alternatives?|examples?)\s*\**\s*(?:[|:]\s*(.*))?$/i;

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  var $ = function(id){ return document.getElementById(id); };

  // ─── state ──────────────────────────────────────────────────────────────
  var items = [];            // library rows
  var clients = [];          // { id, name, email }
  var uses = [];             // { library_id, client_id, status }
  var selected = {};         // id -> true
  var editingId = null;
  var assignIds = [];        // library ids in the assign modal
  var importRows = [];       // parsed rows in the import preview
  var presetClientId = new URLSearchParams(location.search).get('client');
  var weekFilter = '';       // '' = all weeks, 'none' = no week, else '1', '2', …

  // ─── helpers ────────────────────────────────────────────────────────────
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
  function norm(s){ return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function todayKey(d){ d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
  function addDaysKey(fromKey, n){ var p = fromKey.split('-').map(Number); return todayKey(new Date(p[0], p[1]-1, p[2] + n)); }
  function plural(n, w){ return n + ' ' + w + (n === 1 ? '' : 's'); }
  function coreFromLabel(s){ var k = norm(String(s || '').split(',')[0]); return CORE_BY_KEY[k] ? k : ''; }
  function parseTags(v){
    if (Array.isArray(v)) return v.map(function(t){ return String(t).trim(); }).filter(Boolean);
    return String(v || '').split(/[,;]/).map(function(t){ return t.trim(); }).filter(Boolean);
  }
  // Week: accepts 3, "3", "Week 3", "W3", "wk 3".
  function weekNum(v){
    var m = String(v == null ? '' : v).trim().match(/^(?:w(?:ee)?k?\.?\s*)?(\d{1,2})$/i);
    var n = m ? Number(m[1]) : 0;
    return n >= 1 && n <= 99 ? n : null;
  }
  // Code: core letter + "." + week, e.g. B.1 = Body, Week 1.
  // Articles add an "A" after the core letter: BA (Body article), BA.2 with a week.
  function isArticle(category){ return /^articles?$/i.test(String(category || '').trim()); }
  function codeFor(coreKey, week, category){
    var art = isArticle(category);
    var hasWeek = !(week == null || week === '');
    if (!hasWeek && !art) return '';
    var c = CORE_BY_KEY[coreKey];
    return (c ? c.label[0] : 'W') + (art ? 'A' : '') + (hasWeek ? '.' + week : '');
  }
  function itemCode(i){ return codeFor(i.core_key, i.week, i.category); }
  // "B.1" / "b 1" / "B1" → { core_key:'body', week:1 }
  // "BA" / "BA.1" → { core_key:'body', week:null|1, category:'Article' }
  function parseCode(v){
    var s = String(v || '').trim();
    var a = s.match(/^([BMASCLW])A(?:\s*[.\-]?\s*(\d{1,2}))?$/i);
    if (a) return { core_key: CORE_BY_LETTER[a[1].toUpperCase()] || '', week: a[2] ? weekNum(a[2]) : null, category: 'Article' };
    var m = s.match(/^([A-Za-z])\s*[.\-]?\s*(\d{1,2})$/);
    if (!m) return null;
    var week = weekNum(m[2]);
    if (week == null) return null;
    return { core_key: CORE_BY_LETTER[m[1].toUpperCase()] || '', week: week };
  }
  // "B.1 Journal" / "[B.1] Journal" / "B.1 - Journal" → { title:'Journal', code:{…} }.
  // The code is shown on its own, so it shouldn't repeat in the title.
  var TITLE_CODE_RE = /^\s*[\[(]?\s*([BMASCL])\s*[.\-]?\s*(\d{1,2})(?![A-Za-z0-9])\s*[\])]?\s*(?:[-–—:·|.)]\s*)?(?=\S)/i;
  function splitTitleCode(raw){
    var title = String(raw || '').trim();
    var m = title.match(TITLE_CODE_RE);
    var rest = m ? title.slice(m[0].length).trim() : '';
    if (!m || !rest) return { title: title, code: null };
    return { title: rest, code: parseCode(m[1] + '.' + m[2]) };
  }
  // Body text → { relevance, outcome, instructions, … }. Text before any
  // section heading counts as To Do.
  function splitSections(text){
    var out = {}; SECTION_KEYS.forEach(function(k){ out[k] = []; });
    var cur = 'instructions';
    String(text || '').split(/\r?\n/).forEach(function(line){
      var m = line.match(SECTION_RE);
      if (m) { cur = SECTION_ALIASES[m[1].toLowerCase().replace(/\s+/g, ' ')] || SECTION_ALIASES[m[1].toLowerCase()]; if (m[2] && m[2].trim()) out[cur].push(m[2].trim()); return; }
      out[cur].push(line);
    });
    var res = {};
    SECTION_KEYS.forEach(function(k){
      var lines = out[k];
      var ind = lines.filter(function(l){ return l.trim(); }).reduce(function(mn, l){ return Math.min(mn, l.match(/^ */)[0].length); }, 99);
      if (ind === 99) ind = 0;
      res[k] = lines.map(function(l){ return l.slice(ind); }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    });
    return res;
  }
  function hasSections(r){ return SECTION_KEYS.some(function(k){ return k !== 'instructions' && String(r[k] || '').trim(); }); }
  // What the client sees: filled sections under UPPERCASE labels (plain text).
  function clientText(r){
    if (!hasSections(r)) return String(r.instructions || '').trim();
    return SECTIONS.filter(function(x){ return String(r[x.key] || '').trim(); })
      .map(function(x){ return x.label.toUpperCase() + '\n' + String(r[x.key]).trim(); }).join('\n\n');
  }
  // Markdown / Notion body: "## Relevance" headings.
  function mdBody(r){
    if (!hasSections(r)) return String(r.instructions || '').trim();
    return SECTIONS.filter(function(x){ return String(r[x.key] || '').trim(); })
      .map(function(x){ return '## ' + x.label + '\n' + String(r[x.key]).trim(); }).join('\n\n');
  }
  function sectionFields(r){ var o = {}; SECTION_KEYS.forEach(function(k){ o[k] = String(r[k] || ''); }); return o; }
  function dueNum(v){ var s = String(v == null ? '' : v).trim(); return /^\d+$/.test(s) ? Math.min(365, Number(s)) : null; }
  function notionId(raw){ var m = String(raw || '').replace(/-/g, '').match(/[0-9a-f]{32}/i); return m ? m[0].toLowerCase() : ''; }
  function safeName(s){ return String(s || 'assignment').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'assignment'; }
  function byId(id){ return items.filter(function(i){ return i.id === id; })[0]; }
  function lsGet(k){ try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }

  var toastTimer;
  // links: optional [{ href, label }] shown after the message; the toast then
  // stays up longer so there's time to click.
  function toast(msg, isError, links){
    var el = $('alToast');
    if (!el) { el = document.createElement('div'); el.id = 'alToast'; el.className = 'al-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg; el.classList.toggle('is-error', !!isError); el.hidden = false;
    (links || []).forEach(function(l){
      var a = document.createElement('a'); a.className = 'al-toast-link'; a.href = l.href; a.textContent = l.label;
      el.appendChild(document.createTextNode(' ')); el.appendChild(a);
    });
    clearTimeout(toastTimer); toastTimer = setTimeout(function(){ el.hidden = true; }, links && links.length ? 10000 : 3800);
  }
  // Opens the coach portal on this client's To Do's tab.
  function clientTodosHref(clientId){ return '../client-portal/?client=' + encodeURIComponent(clientId) + '&tab=homework'; }
  function note(id, msg, isError){ var el = $(id); el.textContent = msg || ''; el.classList.toggle('is-error', !!isError); }
  function busy(btn, on, label){ btn.disabled = on; if (label) btn.textContent = label; }

  function openModal(id){ $(id).hidden = false; document.body.style.overflow = 'hidden'; }
  function closeModal(id){ $(id).hidden = true; if (!document.querySelector('.al-modal:not([hidden])')) document.body.style.overflow = ''; }
  document.addEventListener('click', function(e){
    var c = e.target.closest('[data-close]'); if (c) closeModal(c.getAttribute('data-close'));
  });
  document.addEventListener('keydown', function(e){
    if (e.key !== 'Escape') return;
    var open = Array.prototype.slice.call(document.querySelectorAll('.al-modal:not([hidden])'));
    if (open.length) closeModal(open[open.length - 1].id);
    closeMenus();
  });

  // ─── auth gate ──────────────────────────────────────────────────────────
  async function boot(){
    var { data: { session } } = await sb.auth.getSession();
    if (!session) return gate('Sign in to continue', 'The assignment library is for the coach. Sign in through the client portal, then come back here.');
    var user = session.user;
    var { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle();
    var coach = (profile && profile.role === 'coach') || user.email === COACH_EMAIL;
    if (!coach) return gate('Coach only', 'This page is where your coach manages assignments. Your homework lives in your client portal.');
    await loadAll();
    $('alLoading').hidden = true;
    $('alApp').hidden = false;
    if (presetClientId) {
      var c = clients.filter(function(x){ return x.id === presetClientId; })[0];
      if (c) toast('Pick assignments, then “Assign to clients” — ' + c.name + ' is preselected.');
    }
  }

  function gate(title, body){
    $('alLoading').hidden = true;
    $('alGateTitle').textContent = title;
    $('alGateBody').textContent = body;
    $('alGate').hidden = false;
  }

  // ─── data ───────────────────────────────────────────────────────────────
  async function loadAll(){
    var res = await Promise.all([
      sb.from('assignment_library').select('*').order('title'),
      sb.from('profiles').select('id, full_name, preferred_name, email, role'),
      sb.from('client_assignments').select('library_id, client_id, status').not('library_id', 'is', null)
    ]);
    if (res[0].error) {
      $('alLoading').hidden = true;
      gate('Library not set up yet', 'Run scripts/assignment_library.sql in the Supabase SQL editor, then reload. (' + res[0].error.message + ')');
      $('alGate').querySelector('a').hidden = true;
      throw res[0].error;
    }
    items = res[0].data || [];
    await cleanTitleCodes();
    clients = (res[1].data || []).filter(function(p){ return p.role !== 'coach' && p.email !== COACH_EMAIL; }).map(function(p){
      return { id: p.id, name: p.preferred_name || p.full_name || p.email || 'Client', email: p.email || '' };
    }).sort(function(a, b){ return a.name.localeCompare(b.name); });
    uses = res[2].data || [];
    renderAll();
  }

  // Titles imported as "B1 Journal" / "B.1 - Journal": move the code out of
  // the title (filling core/week if they're empty) and save the clean title.
  async function cleanTitleCodes(){
    var fixes = [];
    items.forEach(function(i){
      var sp = splitTitleCode(i.title);
      if (!sp.code) return;
      var patch = { title: sp.title };
      if (!i.core_key && sp.code.core_key) patch.core_key = sp.code.core_key;
      if (i.week == null) patch.week = sp.code.week;
      Object.assign(i, patch);
      fixes.push({ id: i.id, patch: patch });
    });
    for (var n = 0; n < fixes.length; n++) {
      await sb.from('assignment_library').update(fixes[n].patch).eq('id', fixes[n].id);
    }
  }

  async function reloadItems(){
    var r = await sb.from('assignment_library').select('*').order('title');
    if (!r.error) items = r.data || [];
    renderAll();
  }

  function useCount(id){
    var seen = {};
    uses.forEach(function(u){ if (u.library_id === id) seen[u.client_id] = true; });
    return Object.keys(seen).length;
  }

  // ─── list ───────────────────────────────────────────────────────────────
  function categories(){
    var s = {};
    items.forEach(function(i){ if (i.category) s[i.category] = true; });
    return Object.keys(s).sort();
  }

  function renderFilters(){
    var core = $('alCoreFilter').value, cat = $('alCatFilter').value;
    $('alCoreFilter').innerHTML = '<option value="">All cores</option>' + CORE_DEFS.map(function(c){ return '<option value="'+c.key+'">'+c.label+'</option>'; }).join('') + '<option value="none">No core</option>';
    $('alCoreFilter').value = core;
    var cats = categories();
    $('alCatFilter').innerHTML = '<option value="">All categories</option>' + cats.map(function(c){ return '<option>'+esc(c)+'</option>'; }).join('');
    $('alCatFilter').value = cats.indexOf(cat) === -1 ? '' : cat;
    $('alCatFilter').hidden = !cats.length;
    $('alCatList').innerHTML = cats.map(function(c){ return '<option value="'+esc(c)+'">'; }).join('');
  }

  function renderWeeks(){
    var showArchived = $('alShowArchived').checked;
    var pool = items.filter(function(i){ return !!i.archived_at === showArchived; });
    var none = 0, max = 0;
    pool.forEach(function(i){ if (i.week == null) none++; else if (i.week > max) max = i.week; });
    var weeks = [];
    for (var w = 1; w <= max; w++) weeks.push(w);
    if (weekFilter && weekFilter !== 'none' && weeks.indexOf(Number(weekFilter)) === -1) weekFilter = '';
    if (weekFilter === 'none' && !none) weekFilter = '';
    $('alWeekFilter').innerHTML = '<option value="">All weeks</option>'
      + weeks.map(function(w){ return '<option value="'+w+'">Week '+w+'</option>'; }).join('')
      + (none ? '<option value="none">No week</option>' : '');
    $('alWeekFilter').value = weekFilter;
    $('alWeekFilter').hidden = !max;
  }

  $('alWeekFilter').addEventListener('change', function(){
    weekFilter = this.value;
    lsSet(WEEK_KEY, weekFilter);
    renderList();
  });

  function visibleItems(){
    var q = norm($('alSearch').value), core = $('alCoreFilter').value, cat = $('alCatFilter').value;
    var showArchived = $('alShowArchived').checked;
    var list = items.filter(function(i){
      if (!!i.archived_at !== showArchived) return false;
      if (weekFilter === 'none' ? i.week != null : (weekFilter && String(i.week) !== weekFilter)) return false;
      if (core === 'none' ? i.core_key : (core && i.core_key !== core)) return false;
      if (cat && i.category !== cat) return false;
      if (q) {
        var hay = norm([itemCode(i), i.title, i.category, (i.tags || []).join(' ')].concat(SECTION_KEYS.map(function(k){ return i[k]; })).join(' '));
        if (q.split(' ').some(function(w){ return hay.indexOf(w) === -1; })) return false;
      }
      return true;
    });
    var sort = $('alSort').value;
    var coreIdx = function(k){ var n = CORE_DEFS.map(function(c){ return c.key; }).indexOf(k); return n === -1 ? 99 : n; };
    list.sort(function(a, b){
      if (sort === 'updated') return String(b.updated_at).localeCompare(String(a.updated_at));
      if (sort === 'used') return useCount(b.id) - useCount(a.id) || a.title.localeCompare(b.title);
      if (sort === 'core') return coreIdx(a.core_key) - coreIdx(b.core_key) || a.title.localeCompare(b.title);
      if (sort === 'code') {
        var wa = a.week == null ? 999 : a.week, wb = b.week == null ? 999 : b.week;
        return wa - wb || coreIdx(a.core_key) - coreIdx(b.core_key) || a.title.localeCompare(b.title);
      }
      return a.title.localeCompare(b.title);
    });
    return list;
  }

  function coreChip(key){
    var c = CORE_BY_KEY[key];
    return c ? '<span class="al-chip al-chip--core" style="--core:'+c.color+'">'+c.label+'</span>' : '<span class="al-row-meta">—</span>';
  }

  function renderList(){
    var list = visibleItems();
    if (!items.length) {
      $('alList').innerHTML = '<div class="al-empty"><strong>Your library is empty</strong>Create your first assignment, or use Import to pull everything in from Notion.</div>';
    } else if (!list.length) {
      $('alList').innerHTML = '<div class="al-empty"><strong>No matches</strong>'+(weekFilter ? 'Nothing in ' + (weekFilter === 'none' ? '“No week”' : 'Week ' + esc(weekFilter)) + ' matches — try another week or filter.' : 'Try a different search or filter.')+'</div>';
    } else {
      $('alList').innerHTML = list.map(function(i){
        var n = useCount(i.id);
        var snippet = String(i.outcome || i.relevance || i.instructions || '').replace(/\s+/g, ' ').slice(0, 160);
        var sub = [i.category, snippet].filter(Boolean).join(' · ');
        return '<div class="al-row'+(selected[i.id] ? ' is-selected' : '')+(i.archived_at ? ' is-archived' : '')+'" data-id="'+i.id+'">'
          + '<input type="checkbox" data-sel="'+i.id+'"'+(selected[i.id] ? ' checked' : '')+' aria-label="Select '+esc(i.title)+'" />'
          + '<div class="al-col-code">'+(itemCode(i) ? '<span class="al-code">'+esc(itemCode(i))+'</span>' : '<span class="al-code al-code--none">—</span>')+'</div>'
          + '<div class="al-col-week al-row-meta">'+(i.week != null ? 'Week ' + i.week : '—')+'</div>'
          + '<div style="min-width:0;"><p class="al-row-title">'+esc(i.title)
          + (i.source === 'notion' || i.notion_page_id ? '<span class="al-src">Notion</span>' : '') + '</p>'
          + (sub ? '<p class="al-row-sub">'+esc(sub)+'</p>' : '')
          + ((i.tags || []).length ? '<div>' + i.tags.map(function(t){ return '<span class="al-tag">'+esc(t)+'</span>'; }).join('') + '</div>' : '')
          + '</div>'
          + '<div class="al-col-core">'+coreChip(i.core_key)+'</div>'
          + '<div class="al-col-used al-row-meta">'+(n ? plural(n, 'client') : 'Not yet')+'</div>'
          + '<div class="al-row-actions"><button type="button" class="al-btn al-btn-sm" data-assign="'+i.id+'">Assign</button></div>'
          + '</div>';
      }).join('');
    }
    var allSel = list.length && list.every(function(i){ return selected[i.id]; });
    $('alSelectAll').checked = !!allSel;
    $('alSelectAll').indeterminate = !allSel && list.some(function(i){ return selected[i.id]; });
    renderBulk();
  }

  function renderStats(){
    var live = items.filter(function(i){ return !i.archived_at; });
    $('alStatTotal').textContent = live.length;
  }

  function selectedIds(){ return Object.keys(selected).filter(function(id){ return selected[id] && byId(id); }); }

  function renderBulk(){
    var ids = selectedIds();
    $('alBulk').hidden = !ids.length;
    $('alBulkCount').textContent = ids.length + ' selected';
    var allArchived = ids.length && ids.every(function(id){ return byId(id).archived_at; });
    $('alBulkArchive').textContent = allArchived ? 'Restore' : 'Archive';
  }

  function renderAll(){ renderFilters(); renderStats(); renderWeeks(); renderList(); }

  ['alSearch','alCoreFilter','alCatFilter','alSort'].forEach(function(id){
    $(id).addEventListener(id === 'alSearch' ? 'input' : 'change', renderList);
  });
  $('alShowArchived').addEventListener('change', function(){ renderWeeks(); renderList(); });
  weekFilter = lsGet(WEEK_KEY);

  $('alSelectAll').addEventListener('change', function(){
    var on = this.checked;
    visibleItems().forEach(function(i){ if (on) selected[i.id] = true; else delete selected[i.id]; });
    renderList();
  });

  $('alList').addEventListener('click', function(e){
    var sel = e.target.closest('[data-sel]');
    if (sel) { var id = sel.getAttribute('data-sel'); if (sel.checked) selected[id] = true; else delete selected[id]; renderList(); return; }
    var as = e.target.closest('[data-assign]');
    if (as) { openAssign([as.getAttribute('data-assign')]); return; }
    var row = e.target.closest('.al-row');
    if (row) openEditor(byId(row.getAttribute('data-id')));
  });

  // ─── menus ──────────────────────────────────────────────────────────────
  function closeMenus(){
    ['alImportMenu','alExportMenu'].forEach(function(m){ $(m).hidden = true; });
    ['alImportBtn','alExportBtn'].forEach(function(b){ $(b).setAttribute('aria-expanded', 'false'); });
  }
  function toggleMenu(btn, menu){
    var willOpen = $(menu).hidden;
    closeMenus();
    $(menu).hidden = !willOpen;
    $(btn).setAttribute('aria-expanded', String(willOpen));
  }
  $('alImportBtn').addEventListener('click', function(e){ e.stopPropagation(); toggleMenu('alImportBtn', 'alImportMenu'); });
  $('alExportBtn').addEventListener('click', function(e){ e.stopPropagation(); toggleMenu('alExportBtn', 'alExportMenu'); });
  document.addEventListener('click', function(e){ if (!e.target.closest('.al-menu')) closeMenus(); });

  $('alImportMenu').addEventListener('click', function(e){
    var b = e.target.closest('[data-open-import]'); if (!b) return;
    closeMenus(); openImport(b.getAttribute('data-open-import'));
  });
  $('alExportMenu').addEventListener('click', function(e){
    var b = e.target.closest('[data-export]'); if (!b) return;
    closeMenus();
    var ids = selectedIds();
    var rows = ids.length ? ids.map(byId) : visibleItems();
    runExport(b.getAttribute('data-export'), rows);
  });

  // ─── editor ─────────────────────────────────────────────────────────────
  $('alEdCore').innerHTML = '<option value="">— none —</option>' + CORE_DEFS.map(function(c){ return '<option value="'+c.key+'">'+c.label+'</option>'; }).join('');

  $('alEdSections').innerHTML = SECTIONS.map(function(x){
    var id = x.key === 'instructions' ? 'alEdInstructions' : 'alEd_' + x.key;
    return '<section class="al-ed-section'+(x.main ? ' al-ed-section--main' : '')+'">'
      + '<h3 class="al-ed-section-h"><label for="'+id+'">'+esc(x.label)+'</label>'
      + '<button type="button" class="al-ed-attach" data-attach="'+x.key+'" title="Upload a PNG, JPG or PDF into this section">+ Image / PDF</button></h3>'
      + '<textarea class="al-input" id="'+id+'" data-section="'+x.key+'"></textarea></section>';
  }).join('');
  function secEl(k){ return $(k === 'instructions' ? 'alEdInstructions' : 'alEd_' + k); }
  // Pasting a whole "RELEVANCE | … TO DO | …" block into any section
  // spreads it across the right boxes.
  $('alEdSections').addEventListener('paste', function(e){
    var ta = e.target.closest('[data-section]'); if (!ta) return;
    var text = (e.clipboardData || window.clipboardData).getData('text');
    var hits = String(text).split(/\r?\n/).filter(function(l){ return SECTION_RE.test(l); }).length;
    if (hits < 2) return;
    e.preventDefault();
    var parts = splitSections(text);
    SECTION_KEYS.forEach(function(k){ if (parts[k]) secEl(k).value = parts[k]; });
    toast('Split the pasted text into sections.');
  });

  // ─── Embedded images & PDFs ─────────────────────────────────────────────
  // Files go to the public `assignment-files` bucket (scripts/assignment_library.sql)
  // and a  ![name](url)  line is inserted where the cursor is. The preview and
  // the client's To Do sheet show the image / PDF itself.
  var FILE_BUCKET = 'assignment-files';
  var FILE_TYPES = { 'image/png':1, 'image/jpeg':1, 'image/webp':1, 'image/gif':1, 'application/pdf':1 };
  var FILE_MAX = 25 * 1024 * 1024;
  var attachInput = document.createElement('input');
  attachInput.type = 'file'; attachInput.multiple = true; attachInput.hidden = true;
  attachInput.accept = 'image/png,image/jpeg,image/webp,image/gif,application/pdf,.pdf';
  document.body.appendChild(attachInput);
  var attachTarget = null;

  function insertLines(ta, lines){
    var v = ta.value, at = ta.selectionStart == null ? v.length : ta.selectionEnd;
    var before = v.slice(0, at), after = v.slice(at);
    var block = (before && !/\n$/.test(before) ? '\n' : '') + lines.join('\n') + (after && !/^\n/.test(after) ? '\n' : '');
    ta.value = before + block + after;
    var pos = (before + block).length;
    try { ta.setSelectionRange(pos, pos); } catch (e) {}
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  async function uploadAttachments(ta, files){
    files = Array.prototype.slice.call(files || []);
    if (!ta || !files.length) return;
    var bad = files.filter(function(f){ return !FILE_TYPES[f.type] && !/\.pdf$/i.test(f.name); });
    if (bad.length) { toast('Only PNG, JPG, WebP, GIF or PDF files can be embedded.', true); return; }
    var big = files.filter(function(f){ return f.size > FILE_MAX; });
    if (big.length) { toast(big[0].name + ' is over 25 MB.', true); return; }
    note('alEdNote', 'Uploading ' + plural(files.length, 'file') + '…');
    var lines = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var name = String(f.name || (f.type === 'application/pdf' ? 'file.pdf' : 'image.png')).replace(/[\[\]()\r\n]+/g, ' ').trim();
      var ext = (name.match(/\.([a-z0-9]{2,5})$/i) || [, f.type === 'application/pdf' ? 'pdf' : (f.type.split('/')[1] || 'png')])[1].toLowerCase();
      var base = name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'file';
      var path = 'library/' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + '-' + base + '.' + ext;
      var up = await sb.storage.from(FILE_BUCKET).upload(path, f, { contentType: f.type || (ext === 'pdf' ? 'application/pdf' : undefined) });
      if (up.error) {
        var msg = /bucket not found/i.test(up.error.message) ? 'Run the latest scripts/assignment_library.sql to enable uploads.' : up.error.message;
        note('alEdNote', 'Could not upload ' + name + ': ' + msg, true);
        if (lines.length) insertLines(ta, lines);
        return;
      }
      lines.push('![' + name + '](' + sb.storage.from(FILE_BUCKET).getPublicUrl(path).data.publicUrl + ')');
    }
    insertLines(ta, lines);
    note('alEdNote', '');
    toast('Embedded ' + plural(lines.length, 'file') + '. Check Preview to see it.');
  }

  $('alEdSections').addEventListener('click', function(e){
    var b = e.target.closest('[data-attach]'); if (!b) return;
    attachTarget = secEl(b.getAttribute('data-attach'));
    attachInput.value = '';
    attachInput.click();
  });
  attachInput.addEventListener('change', function(){ uploadAttachments(attachTarget, attachInput.files); });
  // Paste a screenshot, or drop files, straight into a section.
  $('alEdSections').addEventListener('paste', function(e){
    var ta = e.target.closest('[data-section]'); if (!ta) return;
    var files = (e.clipboardData && e.clipboardData.files) || [];
    if (!files.length) return;
    e.preventDefault(); e.stopImmediatePropagation();
    uploadAttachments(ta, files);
  }, true);
  $('alEdSections').addEventListener('dragover', function(e){
    if (!e.target.closest('[data-section]') || !e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') < 0) return;
    e.preventDefault();
  });
  $('alEdSections').addEventListener('drop', function(e){
    var ta = e.target.closest('[data-section]'); if (!ta || !e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault();
    ta.focus();
    uploadAttachments(ta, e.dataTransfer.files);
  });

  function openEditor(item, draft){
    editingId = item ? item.id : null;
    var src = item || draft || {};
    $('alEdHeading').textContent = item ? 'Edit assignment' : 'New assignment';
    $('alEdTitle').value = src.title || '';
    $('alEdCore').value = src.core_key || '';
    $('alEdWeek').value = src.week == null ? '' : src.week;
    renderEdCode();
    $('alEdCategory').value = src.category || '';
    $('alEdDue').value = src.default_due_days == null ? '' : src.default_due_days;
    $('alEdTags').value = (src.tags || []).join(', ');
    SECTION_KEYS.forEach(function(k){ secEl(k).value = src[k] || ''; });
    $('alEdDelete').hidden = $('alEdArchive').hidden = $('alEdDuplicate').hidden = !item;
    $('alEdArchive').textContent = item && item.archived_at ? 'Restore' : 'Archive';
    var meta = [];
    if (item) {
      var n = useCount(item.id);
      meta.push(n ? 'Assigned to ' + plural(n, 'client') : 'Not assigned yet');
      if (item.notion_url) meta.push('<a href="'+esc(item.notion_url)+'" target="_blank" rel="noopener">Open in Notion ↗</a>');
      if (item.archived_at) meta.push('Archived');
    }
    $('alEdMeta').innerHTML = meta.join(' · ');
    $('alEdMeta').hidden = !meta.length;
    note('alEdNote', '');
    setEdView('write');
    openModal('alEditor');
    $('alEdTitle').focus();
  }

  function editorFields(){
    return {
      title: $('alEdTitle').value.trim(),
      core_key: $('alEdCore').value,
      week: weekNum($('alEdWeek').value),
      category: $('alEdCategory').value.trim(),
      default_due_days: dueNum($('alEdDue').value),
      tags: parseTags($('alEdTags').value),
      instructions: $('alEdInstructions').value.replace(/\s+$/, ''),
      relevance: secEl('relevance').value.replace(/\s+$/, ''),
      outcome: secEl('outcome').value.replace(/\s+$/, ''),
      implementation: secEl('implementation').value.replace(/\s+$/, ''),
      alternative: secEl('alternative').value.replace(/\s+$/, ''),
      examples: secEl('examples').value.replace(/\s+$/, '')
    };
  }

  async function saveEditor(){
    var f = editorFields();
    if (!f.title) { $('alEdTitle').focus(); note('alEdNote', 'Give it a title.', true); return null; }
    // Before the section columns exist (SQL not re-run), keep the old shape.
    if (!items.some(function(i){ return 'relevance' in i; }) && hasSections(f)) {
      note('alEdNote', 'Run the latest scripts/assignment_library.sql to save sections — or leave only To Do filled.', true); return null;
    }
    if (!items.some(function(i){ return 'relevance' in i; })) SECTION_KEYS.forEach(function(k){ if (k !== 'instructions') delete f[k]; });
    note('alEdNote', 'Saving…');
    var res = editingId
      ? await sb.from('assignment_library').update(f).eq('id', editingId).select().single()
      : await sb.from('assignment_library').insert(Object.assign({ source: 'manual' }, f)).select().single();
    if (res.error) { note('alEdNote', 'Could not save: ' + res.error.message, true); return null; }
    var row = res.data;
    items = items.filter(function(i){ return i.id !== row.id; }).concat([row]);
    editingId = row.id;
    renderAll();
    return row;
  }

  // ─── Write / Preview ────────────────────────────────────────────────────
  // Mirrors hwParse / hwInstructionsHtml in client-portal/portal.js so the
  // preview matches the client's To Do sheet. Keep the two in step.
  var HW_HEADINGS = { 'RELEVANCE':1, 'OUTCOME':1, 'TO DO':1, 'TODO':1, 'TO-DO':1, 'IMPLEMENTATION':1, 'ALTERNATIVE':1, 'EXAMPLES':1 };
  var HW_STEP_RE = /^(\s*)(?:\[( |x|X)?\]|[-*•]|\d{1,2}[.)])\s+(.*)$/;
  function hwLinkify(text){
    return esc(text).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  }
  function hwHeading(line){
    var t = String(line).trim().replace(/^#{1,3}\s*/, '').replace(/\s*[:|]\s*$/, '').toUpperCase();
    return HW_HEADINGS[t] ? (t === 'TODO' || t === 'TO-DO' ? 'TO DO' : t) : '';
  }
  // A line that is only  ![name](https://…)  is an embedded file: an image,
  // or a PDF (by extension). Mirrors hwEmbed in client-portal/portal.js.
  var HW_EMBED_RE = /^\s*!\[([^\]]*)\]\((https:\/\/[^\s)]+)\)\s*$/;
  function hwEmbedHtml(name, url){
    var u = esc(url), n = esc(name || 'Attachment');
    if (/\.pdf(?:[?#]|$)/i.test(url)) {
      return '<div class="hw-embed hw-embed--pdf"><iframe src="' + u + '#view=FitH" title="' + n + '" loading="lazy"></iframe>'
        + '<a href="' + u + '" target="_blank" rel="noopener">' + n + ' — open PDF ↗</a></div>';
    }
    return '<a class="hw-embed hw-embed--img" href="' + u + '" target="_blank" rel="noopener"><img src="' + u + '" alt="' + n + '" loading="lazy" /></a>';
  }
  function hwHtml(text){
    var sections = [], cur = { heading: '', lines: [] };
    String(text || '').split('\n').forEach(function(line){
      var hd = hwHeading(line);
      if (hd) { sections.push(cur); cur = { heading: hd, lines: [] }; return; }
      cur.lines.push(line);
    });
    sections.push(cur);
    var hasHeadings = sections.some(function(x){ return x.heading; });
    return sections.filter(function(x){ return x.heading || x.lines.some(function(l){ return l.trim(); }); }).map(function(x){
      var stepsOk = x.heading === 'TO DO' || !hasHeadings;
      var marked = x.lines.filter(function(l){ return HW_STEP_RE.test(l); }).length;
      var nonEmpty = x.lines.filter(function(l){ return l.trim() && !HW_EMBED_RE.test(l); });
      var everyLine = stepsOk && x.heading === 'TO DO' && !marked && nonEmpty.length > 1;
      var its = x.lines.map(function(l){
        var em = l.match(HW_EMBED_RE);
        if (em) return { embed: true, name: em[1], url: em[2] };
        var m = stepsOk ? l.match(HW_STEP_RE) : null;
        if (m) return { step: true, done: /x/i.test(m[2] || ''), text: m[3] };
        if (everyLine && l.trim()) return { step: true, done: false, text: l.trim() };
        return { step: false, text: l };
      });
      var steps = its.filter(function(it){ return it.step; });
      var h = '<div class="hw-block">';
      if (x.heading) h += '<p class="hw-head">' + esc(x.heading === 'TO DO' ? 'To Do' : x.heading.charAt(0) + x.heading.slice(1).toLowerCase())
        + (steps.length ? ' <span class="hw-progress">0 of ' + steps.length + ' done</span>' : '') + '</p>';
      var para = [];
      function flush(){
        var t = para.join('\n').replace(/^\n+|\n+$/g, '');
        if (t) h += '<div class="hw-text">' + hwLinkify(t) + '</div>';
        para = [];
      }
      its.forEach(function(it){
        if (it.embed) { flush(); h += hwEmbedHtml(it.name, it.url); return; }
        if (!it.step) { para.push(it.text); return; }
        flush();
        h += '<label class="hw-step"><input type="checkbox" disabled /><span>' + hwLinkify(it.text) + '</span></label>';
      });
      flush();
      return h + '</div>';
    }).join('');
  }
  function renderEdPreview(){
    var f = editorFields();
    var text = clientText(f).trim();
    $('alEdPreview').innerHTML = '<p class="al-kicker">To Do\'s</p>'
      + '<h3 class="al-ed-preview-title">' + (f.title ? esc(f.title) : '<span style="color:rgba(7,31,53,.35)">Untitled assignment</span>') + '</h3>'
      + '<p class="al-ed-preview-note">This is how it will look to the client.</p>'
      + (text ? hwHtml(text) : '<div class="hw-text"><span style="color:rgba(7,31,53,.45)">No written instructions.</span></div>');
  }
  function setEdView(view){
    var preview = view === 'preview';
    $('alEdTabWrite').setAttribute('aria-selected', String(!preview));
    $('alEdTabPreview').setAttribute('aria-selected', String(preview));
    $('alEdSections').hidden = $('alEdHint').hidden = preview;
    $('alEdPreview').hidden = !preview;
    if (preview) renderEdPreview();
  }
  $('alEdTabWrite').addEventListener('click', function(){ setEdView('write'); });
  $('alEdTabPreview').addEventListener('click', function(){ setEdView('preview'); });
  $('alEdTitle').addEventListener('input', function(){ if (!$('alEdPreview').hidden) renderEdPreview(); });

  function renderEdCode(){
    var code = codeFor($('alEdCore').value, weekNum($('alEdWeek').value), $('alEdCategory').value);
    $('alEdCode').textContent = code;
    $('alEdCode').hidden = !code;
  }
  $('alEdCore').addEventListener('change', renderEdCode);
  $('alEdWeek').addEventListener('input', renderEdCode);
  $('alEdCategory').addEventListener('input', renderEdCode);

  // New assignments start in the week you're looking at.
  $('alNewBtn').addEventListener('click', function(){
    openEditor(null, weekFilter && weekFilter !== 'none' ? { week: Number(weekFilter) } : null);
  });
  $('alEdSave').addEventListener('click', async function(){
    var row = await saveEditor(); if (!row) return;
    closeModal('alEditor'); toast('Saved “' + row.title + '”.');
  });
  $('alEdSaveAssign').addEventListener('click', async function(){
    var row = await saveEditor(); if (!row) return;
    closeModal('alEditor'); openAssign([row.id]);
  });
  $('alEdDuplicate').addEventListener('click', function(){
    var item = byId(editingId); if (!item) return;
    closeModal('alEditor');
    openEditor(null, Object.assign({}, editorFields(), { title: editorFields().title + ' (copy)' }));
  });
  $('alEdArchive').addEventListener('click', async function(){
    var item = byId(editingId); if (!item) return;
    await setArchived([item.id], !item.archived_at);
    closeModal('alEditor');
  });
  $('alEdDelete').addEventListener('click', async function(){
    var item = byId(editingId); if (!item) return;
    if (await deleteItems([item.id])) closeModal('alEditor');
  });

  async function setArchived(ids, archive){
    var r = await sb.from('assignment_library').update({ archived_at: archive ? new Date().toISOString() : null }).in('id', ids);
    if (r.error) { toast('Could not update: ' + r.error.message, true); return; }
    ids.forEach(function(id){ delete selected[id]; });
    await reloadItems();
    toast((archive ? 'Archived ' : 'Restored ') + plural(ids.length, 'assignment') + '.');
  }

  async function deleteItems(ids){
    var n = ids.reduce(function(s, id){ return s + useCount(id); }, 0);
    var msg = 'Delete ' + plural(ids.length, 'assignment') + ' from the library?'
      + (n ? '\n\nHomework already sent to clients stays in their portal.' : '')
      + '\n\nArchiving hides them without deleting.';
    if (!confirm(msg)) return false;
    var r = await sb.from('assignment_library').delete().in('id', ids);
    if (r.error) { toast('Could not delete: ' + r.error.message, true); return false; }
    ids.forEach(function(id){ delete selected[id]; });
    items = items.filter(function(i){ return ids.indexOf(i.id) === -1; });
    renderAll();
    toast('Deleted ' + plural(ids.length, 'assignment') + '.');
    return true;
  }

  // ─── bulk bar ───────────────────────────────────────────────────────────
  $('alBulkAssign').addEventListener('click', function(){ openAssign(selectedIds()); });
  $('alBulkExport').addEventListener('click', function(){
    closeMenus();
    var menu = $('alExportMenu');
    menu.hidden = false; $('alExportBtn').setAttribute('aria-expanded', 'true');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  $('alBulkPush').addEventListener('click', function(){ openPush(selectedIds().map(byId)); });
  $('alBulkArchive').addEventListener('click', function(){
    var ids = selectedIds();
    setArchived(ids, !ids.every(function(id){ return byId(id).archived_at; }));
  });
  $('alBulkDelete').addEventListener('click', function(){ deleteItems(selectedIds()); });
  $('alBulkClear').addEventListener('click', function(){ selected = {}; renderList(); });

  // ─── assign ─────────────────────────────────────────────────────────────
  var assignClientSel = {};

  function openAssign(ids){
    assignIds = ids.filter(byId);
    if (!assignIds.length) return;
    if (!clients.length) { toast('No clients on the roster yet.', true); return; }
    assignClientSel = {};
    if (presetClientId) assignClientSel[presetClientId] = true;
    var titles = assignIds.map(function(id){ return byId(id).title; });
    $('alAsWhat').textContent = assignIds.length === 1
      ? '“' + titles[0] + '” goes into each client\'s To Do\'s tab as a new assignment.'
      : plural(assignIds.length, 'assignment') + ': ' + titles.slice(0, 4).join(', ') + (titles.length > 4 ? ' and ' + (titles.length - 4) + ' more' : '') + '.';
    $('alAsSearch').value = '';
    $('alAsFrom').value = todayKey();
    $('alAsDate').value = '';
    var anyDefault = assignIds.some(function(id){ return byId(id).default_due_days != null; });
    document.querySelector('input[name="alAsDue"][value="' + (anyDefault ? 'default' : 'none') + '"]').checked = true;
    note('alAsNote', '');
    renderAssignClients(); renderAssignSummary();
    openModal('alAssign');
  }

  function renderAssignClients(){
    var q = norm($('alAsSearch').value);
    var list = clients.filter(function(c){ return !q || norm(c.name + ' ' + c.email).indexOf(q) !== -1; });
    $('alAsClients').innerHTML = list.length ? list.map(function(c){
      var has = assignIds.filter(function(id){ return openFor(id, c.id); }).length;
      return '<label class="al-pick"><input type="checkbox" data-client="'+c.id+'"'+(assignClientSel[c.id] ? ' checked' : '')+' />'
        + '<span class="al-pick-name">'+esc(c.name)+'</span>'
        + (has ? '<span class="al-pick-meta">has '+(assignIds.length === 1 ? 'it' : has + ' of these')+' open</span>' : '')
        + '</label>';
    }).join('') : '<div class="al-empty" style="padding:20px;">No clients match.</div>';
    $('alAsAll').checked = clients.length && clients.every(function(c){ return assignClientSel[c.id]; });
  }

  function openFor(libId, clientId){
    return uses.some(function(u){ return u.library_id === libId && u.client_id === clientId && u.status !== 'complete'; });
  }

  function plannedRows(){
    var mode = (document.querySelector('input[name="alAsDue"]:checked') || {}).value;
    var from = $('alAsFrom').value || todayKey();
    var fixed = $('alAsDate').value || null;
    var skip = $('alAsSkip').checked;
    var rows = [], skipped = 0;
    Object.keys(assignClientSel).filter(function(id){ return assignClientSel[id]; }).forEach(function(cid){
      assignIds.forEach(function(lid){
        var t = byId(lid);
        if (skip && openFor(lid, cid)) { skipped++; return; }
        var due = mode === 'date' ? fixed : mode === 'default' && t.default_due_days != null ? addDaysKey(from, t.default_due_days) : null;
        rows.push({ client_id: cid, library_id: lid, title: (itemCode(t) ? itemCode(t) + ' · ' : '') + t.title, instructions: clientText(t), core_key: t.core_key || '', due_date: due, status: 'assigned' });
      });
    });
    return { rows: rows, skipped: skipped };
  }

  function renderAssignSummary(){
    var p = plannedRows();
    var nClients = Object.keys(assignClientSel).filter(function(id){ return assignClientSel[id]; }).length;
    $('alAsSummary').innerHTML = nClients
      ? 'Creates <b>' + plural(p.rows.length, 'to-do') + '</b> across ' + plural(nClients, 'client') + (p.skipped ? ' · skips ' + p.skipped + ' already open' : '') + '.'
      : 'Pick at least one client.';
    $('alAsGo').disabled = !p.rows.length;
  }

  $('alAsSearch').addEventListener('input', renderAssignClients);
  $('alAsClients').addEventListener('change', function(e){
    var cb = e.target.closest('[data-client]'); if (!cb) return;
    var id = cb.getAttribute('data-client');
    if (cb.checked) assignClientSel[id] = true; else delete assignClientSel[id];
    $('alAsAll').checked = clients.every(function(c){ return assignClientSel[c.id]; });
    renderAssignSummary();
  });
  $('alAsAll').addEventListener('change', function(){
    var on = this.checked;
    assignClientSel = {};
    if (on) clients.forEach(function(c){ assignClientSel[c.id] = true; });
    renderAssignClients(); renderAssignSummary();
  });
  ['alAsSkip','alAsFrom','alAsDate'].forEach(function(id){ $(id).addEventListener('change', renderAssignSummary); });
  $('alAsDate').addEventListener('change', function(){ document.querySelector('input[name="alAsDue"][value="date"]').checked = true; renderAssignSummary(); });
  document.querySelectorAll('input[name="alAsDue"]').forEach(function(r){ r.addEventListener('change', renderAssignSummary); });

  $('alAsGo').addEventListener('click', async function(){
    var p = plannedRows();
    if (!p.rows.length) return;
    var mode = (document.querySelector('input[name="alAsDue"]:checked') || {}).value;
    if (mode === 'date' && !$('alAsDate').value) { note('alAsNote', 'Pick the due date.', true); return; }
    busy(this, true, 'Assigning…');
    var failed = null;
    for (var i = 0; i < p.rows.length; i += 200) {
      var r = await sb.from('client_assignments').insert(p.rows.slice(i, i + 200)).select('library_id, client_id, status');
      if (r.error) { failed = r.error; break; }
      uses = uses.concat(r.data || []);
    }
    busy(this, false, 'Assign');
    if (failed) { note('alAsNote', 'Could not assign: ' + failed.message, true); renderAll(); return; }
    closeModal('alAssign');
    selected = {};
    renderAll();
    var assignedIds = [];
    p.rows.forEach(function(r){ if (assignedIds.indexOf(r.client_id) === -1) assignedIds.push(r.client_id); });
    var links = assignedIds.slice(0, 4).map(function(cid){
      var c = clients.filter(function(x){ return x.id === cid; })[0];
      var name = c ? c.name : 'client';
      return { href: clientTodosHref(cid), label: assignedIds.length === 1 ? 'Open ' + name + '\u2019s To Do\u2019s \u2192' : name + ' \u2192' };
    });
    toast('Assigned ' + plural(p.rows.length, 'to-do') + '.', false, links);
  });

  // ─── export ─────────────────────────────────────────────────────────────
  function download(name, blob){
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 2000);
  }

  function csvCell(v){ v = String(v == null ? '' : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

  function toCsv(rows){
    var head = ['Title','Code','Week','Core','Category','Tags','Due in days'].concat(SECTIONS.map(function(x){ return x.label; }));
    var lines = [head.join(',')].concat(rows.map(function(i){
      return [i.title, itemCode(i), i.week == null ? '' : i.week, (CORE_BY_KEY[i.core_key] || {}).label || '', i.category, (i.tags || []).join(', '), i.default_due_days == null ? '' : i.default_due_days].concat(SECTION_KEYS.map(function(k){ return i[k] || ''; })).map(csvCell).join(',');
    }));
    return '﻿' + lines.join('\r\n');
  }

  function toMarkdown(i){
    var props = [];
    if (itemCode(i)) props.push('Code: ' + itemCode(i));
    if (i.week != null) props.push('Week: ' + i.week);
    if (CORE_BY_KEY[i.core_key]) props.push('Core: ' + CORE_BY_KEY[i.core_key].label);
    if (i.category) props.push('Category: ' + i.category);
    if ((i.tags || []).length) props.push('Tags: ' + i.tags.join(', '));
    if (i.default_due_days != null) props.push('Due in days: ' + i.default_due_days);
    return '# ' + i.title + '\n\n' + (props.length ? props.join('\n') + '\n\n' : '') + mdBody(i) + '\n';
  }

  async function runExport(kind, rows){
    if (kind === 'notion') { openPush(rows); return; }
    if (!rows.length) { toast('Nothing to export.', true); return; }
    var stamp = todayKey();
    if (kind === 'csv') download('assignment-library-' + stamp + '.csv', new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    if (kind === 'json') {
      var clean = rows.map(function(i){ return { title: i.title, code: itemCode(i), week: i.week, relevance: i.relevance || '', outcome: i.outcome || '', instructions: i.instructions, implementation: i.implementation || '', alternative: i.alternative || '', examples: i.examples || '', core_key: i.core_key, category: i.category, tags: i.tags, default_due_days: i.default_due_days, notion_page_id: i.notion_page_id, notion_url: i.notion_url }; });
      download('assignment-library-' + stamp + '.json', new Blob([JSON.stringify({ type: 'cc-assignment-library', version: 1, exported_at: new Date().toISOString(), assignments: clean }, null, 2)], { type: 'application/json' }));
    }
    if (kind === 'md') {
      if (!window.JSZip) { toast('Zip library did not load — try CSV instead.', true); return; }
      var zip = new JSZip(), used = {};
      rows.forEach(function(i){
        var base = safeName(i.title), name = base, n = 2;
        while (used[name.toLowerCase()]) name = base + ' ' + (n++);
        used[name.toLowerCase()] = true;
        zip.file(name + '.md', toMarkdown(i));
      });
      download('assignment-library-' + stamp + '.zip', await zip.generateAsync({ type: 'blob' }));
    }
    toast('Exported ' + plural(rows.length, 'assignment') + '.');
  }

  // ─── Notion (edge function) ─────────────────────────────────────────────
  async function callNotion(body){
    try {
      var r = await sb.functions.invoke(NOTION_FN, { body: body });
      if (r.error) {
        var msg = r.error.message || 'Request failed';
        try { var ctx = r.error.context && await r.error.context.json(); if (ctx && ctx.error) msg = ctx.error; } catch (e) {}
        return { error: msg, notDeployed: /Failed to send|not found|404|FunctionsFetchError|FunctionsRelayError/i.test(msg + ' ' + (r.error.name || '')) };
      }
      return r.data || {};
    } catch (e) { return { error: e.message, notDeployed: true }; }
  }

  var notionStatusChecked = false;
  async function checkNotionSetup(){
    if (notionStatusChecked) return;
    var s = await callNotion({ action: 'status' });
    var missing = s.error || !s.configured;
    $('alNotionSetup').hidden = !missing;
    $('alNotionSetupErr').textContent = s.error ? (s.notDeployed ? 'The notion-assignments function is not deployed yet.' : s.error) : (!s.configured ? 'NOTION_TOKEN is not set yet.' : '');
    if (!missing) notionStatusChecked = true;
    if (s.default_database_id && !$('alNotionDb').value) $('alNotionDb').value = s.default_database_id;
  }

  function setProgress(id, frac){ $(id).hidden = frac == null; $(id).firstElementChild.style.width = Math.round((frac || 0) * 100) + '%'; }

  $('alNotionFind').addEventListener('click', async function(){
    busy(this, true, 'Looking…');
    var r = await callNotion({ action: 'databases' });
    busy(this, false, 'Find databases');
    if (r.error) { note('alNotionNote', r.error, true); checkNotionSetup(); return; }
    var dbs = r.databases || [];
    if (!dbs.length) { note('alNotionNote', 'No databases are shared with the integration yet.', true); return; }
    $('alNotionDbPick').innerHTML = '<option value="">Choose a database…</option>' + dbs.map(function(d){ return '<option value="'+d.id+'">'+esc(d.title)+'</option>'; }).join('');
    $('alNotionDbPick').hidden = false;
    note('alNotionNote', plural(dbs.length, 'database') + ' found.');
  });
  $('alNotionDbPick').addEventListener('change', function(){ if (this.value) $('alNotionDb').value = this.value; });

  $('alNotionPull').addEventListener('click', async function(){
    var db = notionId($('alNotionDb').value);
    if (!db) { note('alNotionNote', 'Paste the database link or pick one.', true); $('alNotionDb').focus(); return; }
    lsSet(DB_KEY, db);
    var btn = this; busy(btn, true, 'Pulling…');
    var cursor = null, created = 0, updated = 0, pages = 0;
    setProgress('alNotionProgress', 0.05);
    do {
      var r = await callNotion({ action: 'pull', database_id: db, cursor: cursor });
      if (r.error) { note('alNotionNote', r.error, true); checkNotionSetup(); break; }
      created += r.created || 0; updated += r.updated || 0; pages++;
      cursor = r.next_cursor || null;
      setProgress('alNotionProgress', cursor ? Math.min(0.9, 0.1 + pages * 0.15) : 1);
      note('alNotionNote', 'Pulled ' + (created + updated) + ' so far…');
    } while (cursor);
    busy(btn, false, 'Pull from Notion');
    if (r && !r.error) {
      note('alNotionNote', 'Done — ' + created + ' new, ' + updated + ' updated.');
      toast('Notion sync: ' + created + ' new, ' + updated + ' updated.');
      var u = await sb.from('client_assignments').select('library_id, client_id, status').not('library_id', 'is', null);
      if (!u.error) uses = u.data || [];
      await reloadItems();
    }
    setTimeout(function(){ setProgress('alNotionProgress', null); }, 800);
  });

  var pushRows = [];
  function openPush(rows){
    pushRows = rows.filter(Boolean);
    if (!pushRows.length) { toast('Select assignments to push first.', true); return; }
    var linked = pushRows.filter(function(i){ return i.notion_page_id; }).length;
    $('alPuWhat').textContent = plural(pushRows.length, 'assignment') + ' → Notion'
      + (linked ? ' (' + linked + ' update existing pages, ' + (pushRows.length - linked) + ' new).' : ' as new pages.');
    $('alPuDb').value = $('alPuDb').value || lsGet(DB_KEY);
    note('alPuNote', ''); setProgress('alPuProgress', null);
    openModal('alPush');
  }

  $('alPuGo').addEventListener('click', async function(){
    var db = notionId($('alPuDb').value);
    if (!db) { note('alPuNote', 'Paste the database link or ID.', true); $('alPuDb').focus(); return; }
    lsSet(DB_KEY, db);
    var btn = this; busy(btn, true, 'Pushing…');
    var ids = pushRows.map(function(i){ return i.id; });
    var created = 0, updatedN = 0, failed = [], err = null;
    for (var i = 0; i < ids.length; i += 10) {
      setProgress('alPuProgress', i / ids.length);
      var r = await callNotion({ action: 'push', database_id: db, ids: ids.slice(i, i + 10) });
      if (r.error) { err = r.error; break; }
      created += r.created || 0; updatedN += r.updated || 0; failed = failed.concat(r.failed || []);
      note('alPuNote', (created + updatedN) + ' of ' + ids.length + ' pushed…');
    }
    setProgress('alPuProgress', 1);
    busy(btn, false, 'Push');
    if (err) { note('alPuNote', err + (/not deployed|Failed to send/i.test(err) ? ' — see Import → Sync from Notion for setup.' : ''), true); return; }
    await reloadItems();
    if (failed.length) { note('alPuNote', created + ' created, ' + updatedN + ' updated, ' + failed.length + ' failed: ' + failed.map(function(f){ return f.title + ' (' + f.error + ')'; }).join('; '), true); return; }
    closeModal('alPush');
    toast('Notion: ' + created + ' created, ' + updatedN + ' updated.');
  });

  // ─── import (files) ─────────────────────────────────────────────────────
  function openImport(tab){
    if (tab === 'upload' || tab === 'text' || tab === 'url') { switchImportSrc(tab); tab = 'file'; }
    switchImportTab(tab || 'notion');
    $('alNotionDb').value = $('alNotionDb').value || lsGet(DB_KEY);
    note('alNotionNote', ''); note('alImNote', '');
    openModal('alImport');
  }

  function switchImportTab(tab){
    document.querySelectorAll('[data-im-tab]').forEach(function(b){ b.classList.toggle('is-active', b.getAttribute('data-im-tab') === tab); });
    document.querySelectorAll('[data-im-pane]').forEach(function(p){ p.hidden = p.getAttribute('data-im-pane') !== tab; });
    if (tab === 'notion') checkNotionSetup();
  }
  document.querySelectorAll('[data-im-tab]').forEach(function(b){
    b.addEventListener('click', function(){ switchImportTab(b.getAttribute('data-im-tab')); });
  });

  function switchImportSrc(src){
    document.querySelectorAll('[data-im-src]').forEach(function(b){ b.classList.toggle('is-active', b.getAttribute('data-im-src') === src); });
    document.querySelectorAll('[data-im-src-pane]').forEach(function(p){ p.hidden = p.getAttribute('data-im-src-pane') !== src; });
    note('alImNote', '');
    var focus = { text: 'alPasteText', url: 'alUrlInput' }[src];
    if (focus) setTimeout(function(){ $(focus).focus(); }, 30);
  }
  document.querySelectorAll('[data-im-src]').forEach(function(b){
    b.addEventListener('click', function(){ switchImportSrc(b.getAttribute('data-im-src')); });
  });

  // Free text → parsed groups. Detects JSON, spreadsheet rows (tab
  // separated), CSV with a header row, or one/many "# Title" markdown blocks.
  function rowsFromText(text, nameHint){
    text = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    var t = text.trim();
    if (!t) return [];
    if (/^[\[{]/.test(t)) { try { return [{ kind: 'json', name: nameHint, rows: rowsFromJson(t) }]; } catch (e) {} }
    var first = t.split('\n')[0];
    var headerish = /(^|[\t,])\s*"?(title|name|assignment|homework)"?\s*($|[\t,])/i;
    if (first.indexOf('\t') !== -1 && headerish.test(first)) return [{ kind: 'csv', name: nameHint, rows: rowsFromCsv(t, '\t') }];
    if (first.indexOf(',') !== -1 && headerish.test(first) && t.split('\n').length > 1) return [{ kind: 'csv', name: nameHint, rows: rowsFromCsv(t) }];
    // Markdown: split on top-level "# " headings — one assignment each.
    var blocks = [], cur = [];
    t.split('\n').forEach(function(line){
      if (/^#\s+\S/.test(line) && cur.some(function(l){ return l.trim(); })) { blocks.push(cur.join('\n')); cur = []; }
      cur.push(line);
    });
    blocks.push(cur.join('\n'));
    return blocks.map(function(b){
      b = b.trim();
      // No "# Title": the first line is the title, unless it's already a section.
      if (!/^#\s/.test(b)) {
        var lines = b.split('\n');
        if (SECTION_RE.test(lines[0])) {
          var guess = String(nameHint || '').replace(/\.[a-z]+$/i, '').trim() || 'Untitled assignment';
          b = '# ' + guess + '\n\n' + b;
        } else b = '# ' + lines[0].replace(/^[#*\s]+|[*\s]+$/g, '') + '\n' + lines.slice(1).join('\n');
      }
      var r = rowFromMarkdown(b, nameHint);
      return r ? { kind: 'md', name: nameHint, rows: [r] } : null;
    }).filter(Boolean);
  }

  function showParsed(groups, emptyMsg){
    var rows = mergeParsed(groups);
    importRows = rows.map(function(r){ return Object.assign(r, { include: true, match: existingMatch(r) }); });
    note('alImNote', rows.length ? '' : (emptyMsg || 'No assignments found.'), !rows.length);
    renderImportPreview();
  }

  $('alPasteGo').addEventListener('click', function(){
    var text = $('alPasteText').value;
    if (!text.trim()) { note('alImNote', 'Paste something first.', true); $('alPasteText').focus(); return; }
    showParsed(rowsFromText(text, 'Pasted text'), 'Couldn’t find an assignment in that text.');
  });

  // Google Docs / Sheets share links → their plain-text / CSV export.
  function exportUrl(u){
    var m;
    if ((m = u.match(/docs\.google\.com\/document\/d\/([\w-]+)/))) return 'https://docs.google.com/document/d/' + m[1] + '/export?format=txt';
    if ((m = u.match(/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/)) && !/\/pub\b|output=csv/.test(u)) {
      var gid = (u.match(/[#&?]gid=(\d+)/) || [])[1];
      return 'https://docs.google.com/spreadsheets/d/' + m[1] + '/export?format=csv' + (gid ? '&gid=' + gid : '');
    }
    if ((m = u.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/(.+)$/))) return 'https://raw.githubusercontent.com/' + m[1] + '/' + m[2];
    return u;
  }

  function htmlToText(html){
    var doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,nav,header,footer,noscript,svg').forEach(function(n){ n.remove(); });
    var root = doc.querySelector('article') || doc.querySelector('main') || doc.body;
    var out = [];
    (function walk(n){
      n.childNodes.forEach(function(c){
        if (c.nodeType === 3) { if (c.textContent.trim()) out.push(c.textContent.replace(/\s+/g, ' ')); return; }
        if (c.nodeType !== 1) return;
        var tag = c.tagName;
        if (/^H[1-3]$/.test(tag)) { out.push('\n' + '#'.repeat(Number(tag[1])) + ' ' + c.textContent.trim() + '\n'); return; }
        if (tag === 'LI') { out.push('\n- '); walk(c); return; }
        if (tag === 'A' && c.href && /^https?:/.test(c.href) && c.textContent.trim() !== c.href) { out.push(c.textContent.trim() + ' (' + c.href + ')'); return; }
        if (tag === 'BR') { out.push('\n'); return; }
        var block = /^(P|DIV|SECTION|UL|OL|TR|BLOCKQUOTE|PRE|TABLE)$/.test(tag);
        if (block) out.push('\n');
        walk(c);
        if (block) out.push('\n');
      });
    })(root);
    var text = out.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    var title = (doc.querySelector('h1') || {}).textContent || doc.title || '';
    if (!/^#\s/.test(text) && title.trim()) text = '# ' + title.trim() + '\n\n' + text;
    return text;
  }

  async function fetchText(url){
    try {
      var res = await fetch(url, { redirect: 'follow' });
      if (res.ok) return { text: await res.text(), type: res.headers.get('content-type') || '' };
    } catch (e) { /* CORS — fall back to the edge function */ }
    var r = await callNotion({ action: 'fetch_url', url: url });
    if (r.error) throw new Error(r.notDeployed ? 'This site blocks direct downloads. Deploy the notion-assignments function to import from any link.' : r.error);
    return { text: r.text || '', type: r.content_type || '' };
  }

  $('alUrlGo').addEventListener('click', async function(){
    var raw = $('alUrlInput').value.trim();
    if (!/^https?:\/\//i.test(raw)) { note('alImNote', 'Paste a full link starting with https://', true); $('alUrlInput').focus(); return; }
    var btn = this; busy(btn, true, 'Fetching…'); note('alImNote', 'Fetching…');
    try {
      if (/(^|\.)notion\.(so|site)\//i.test(raw.replace(/^https?:\/\//, '')) && notionId(raw)) {
        var n = await callNotion({ action: 'notion_url', url: raw });
        if (n.error) throw new Error(n.error);
        showParsed([{ kind: 'notion', name: raw, rows: n.rows || [] }], 'That Notion page had nothing to import.');
        if (n.more) note('alImNote', 'Showing the first 100 rows — use Notion sync for the whole database.');
        return;
      }
      var url = exportUrl(raw);
      var got = await fetchText(url);
      var name = decodeURIComponent(url.split('?')[0].split('/').pop() || 'link');
      var text = got.text;
      if (/html/i.test(got.type) || /^\s*<(!doctype|html)/i.test(text)) text = htmlToText(text);
      else if (/csv/i.test(got.type) || /\.csv$/i.test(name)) { showParsed([{ kind: 'csv', name: name, rows: rowsFromCsv(text) }], 'No rows found in that sheet.'); return; }
      showParsed(rowsFromText(text, name), 'Couldn’t find an assignment at that link.');
    } catch (e) {
      note('alImNote', e.message, true);
    } finally {
      busy(btn, false, 'Fetch');
    }
  });
  $('alUrlInput').addEventListener('keydown', function(e){ if (e.key === 'Enter') { e.preventDefault(); $('alUrlGo').click(); } });

  // RFC 4180 CSV → array of arrays.
  function parseCsv(text, delim){
    delim = delim || ',';
    text = text.replace(/^﻿/, '');
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i+1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i+1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some(function(c){ return c !== ''; })) rows.push(row);
        row = [];
      } else cell += ch;
    }
    row.push(cell);
    if (row.some(function(c){ return c !== ''; })) rows.push(row);
    return rows;
  }

  function pick(obj, names){
    for (var k in obj) if (names.indexOf(norm(k)) !== -1 && String(obj[k]).trim()) return String(obj[k]).trim();
    return '';
  }

  function rowFromRecord(rec, fallbackTitleKey){
    var title = pick(rec, ['title','name','assignment','assignment name','homework']) || (fallbackTitleKey ? String(rec[fallbackTitleKey] || '').trim() : '');
    if (!title) return null;
    var split = splitTitleCode(title);
    title = split.title;
    var code = parseCode(pick(rec, ['code','assignment code','id code'])) || split.code;
    var core = coreFromLabel(pick(rec, ['core','cores','core key','core_key'])) || (code ? code.core_key : '');
    var week = weekNum(pick(rec, ['week','wk','week #','week number']));
    var out = {
      title: title,
      week: week != null ? week : (code ? code.week : null),
      core_key: core,
      category: pick(rec, ['category','type','section','group']) || (code && code.category) || '',
      tags: parseTags(pick(rec, ['tags','tag','labels'])),
      default_due_days: dueNum(pick(rec, ['due in days','due days','default due days','default_due_days','days to complete'])),
      instructions: cleanMd(pick(rec, ['to do','todo','to-do','instructions','steps','description','details','body','content'])),
      relevance: cleanMd(pick(rec, ['relevance'])),
      outcome: cleanMd(pick(rec, ['outcome','outcomes'])),
      implementation: cleanMd(pick(rec, ['implementation'])),
      alternative: cleanMd(pick(rec, ['alternative','alternatives'])),
      examples: cleanMd(pick(rec, ['examples','example'])),
      notion_page_id: ''
    };
    // A single body column that itself holds "RELEVANCE | …" sections.
    if (!hasSections(out) && SECTION_RE.test(out.instructions.split('\n')[0] || '')) Object.assign(out, splitSections(out.instructions));
    return out;
  }

  function rowsFromCsv(text, delim){
    var grid = parseCsv(text, delim);
    if (grid.length < 2) return [];
    var head = grid[0];
    return grid.slice(1).map(function(cells){
      var rec = {};
      head.forEach(function(h, i){ rec[h] = cells[i] || ''; });
      return rowFromRecord(rec, head[0]);
    }).filter(Boolean);
  }

  // Notion's markdown: [text](url) → "text (url)", drop emphasis markers and
  // relative links to sibling export files.
  function cleanMd(s){
    return String(s || '')
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function(_, alt, url){ return /^https?:/i.test(url) ? (alt ? alt + ' ' : '') + url : alt; })
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(_, text, url){ url = decodeURI(url); return /^https?:/i.test(url) ? (text === url ? url : text + ' (' + url + ')') : text; })
      .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1')
      .replace(/^(\s*)[*+] /gm, '$1- ')
      .replace(/<aside>|<\/aside>/g, '')
      .replace(/\n{3,}/g, '\n\n').trim();
  }

  var MD_PROPS = { 'code':'code', 'week':'week', 'core':'core', 'cores':'core', 'category':'category', 'type':'category', 'section':'category', 'tags':'tags', 'tag':'tags', 'due in days':'due', 'due days':'due', 'default due days':'due', 'days to complete':'due' };

  function rowFromMarkdown(text, filename){
    var lines = text.replace(/^﻿/, '').split(/\r?\n/);
    var i = 0, title = '';
    while (i < lines.length && !lines[i].trim()) i++;
    var h = (lines[i] || '').match(/^#\s+(.*)/);
    if (h) { title = h[1].trim(); i++; }
    var base = String(filename || '').split('/').pop().replace(/\.(md|markdown|txt)$/i, '');
    var pid = (base.match(/\s([0-9a-f]{32})$/i) || [])[1] || '';
    if (!title) title = base.replace(/\s[0-9a-f]{32}$/i, '').trim();
    if (!title) return null;
    var split = splitTitleCode(title);
    var row = { title: split.title, relevance: '', outcome: '', implementation: '', alternative: '', examples: '', core_key: split.code ? split.code.core_key : '', week: split.code ? split.code.week : null, category: '', tags: [], default_due_days: null, instructions: '', notion_page_id: pid.toLowerCase() };
    // Notion writes "Property: value" lines right under the title.
    while (i < lines.length && !lines[i].trim()) i++;
    while (i < lines.length) {
      if (SECTION_RE.test(lines[i])) break;
      var m = lines[i].match(/^([A-Za-z][\w ]{0,30}):\s*(.*)$/);
      if (!m || !MD_PROPS[norm(m[1])]) {
        if (m && lines[i].length < 80 && /^[A-Z]/.test(m[1])) { i++; continue; } // unknown property (Created, Status…)
        break;
      }
      var key = MD_PROPS[norm(m[1])], v = m[2].trim();
      if (key === 'core') row.core_key = coreFromLabel(v) || row.core_key;
      if (key === 'week') row.week = weekNum(v);
      if (key === 'code') { var pc = parseCode(v); if (pc) { if (!row.core_key) row.core_key = pc.core_key; if (row.week == null) row.week = pc.week; if (!row.category && pc.category) row.category = pc.category; } }
      if (key === 'category') row.category = v;
      if (key === 'tags') row.tags = parseTags(v);
      if (key === 'due') row.default_due_days = dueNum(v);
      i++;
    }
    Object.assign(row, splitSections(cleanMd(lines.slice(i).join('\n'))));
    return row;
  }

  function rowsFromJson(text){
    var data = JSON.parse(text);
    var list = Array.isArray(data) ? data : (data.assignments || data.items || []);
    return list.map(function(r){
      if (!r || !r.title) return null;
      var split = splitTitleCode(r.title);
      var pc = parseCode(r.code) || split.code;
      var core = CORE_BY_KEY[r.core_key] ? r.core_key : coreFromLabel(r.core);
      var wk = weekNum(r.week);
      return {
        title: split.title, core_key: core || (pc ? pc.core_key : ''),
        week: wk != null ? wk : (pc ? pc.week : null),
        category: String(r.category || '') || (pc && pc.category) || '', tags: parseTags(r.tags), default_due_days: dueNum(r.default_due_days),
        instructions: String(r.instructions || ''), relevance: String(r.relevance || ''), outcome: String(r.outcome || ''),
        implementation: String(r.implementation || ''), alternative: String(r.alternative || ''), examples: String(r.examples || ''), notion_page_id: notionId(r.notion_page_id), notion_url: r.notion_url || ''
      };
    }).filter(Boolean);
  }

  async function readFiles(fileList){
    var out = [];
    async function handle(name, getText, getBlob){
      var lower = name.toLowerCase();
      if (/(^|\/)__macosx\//.test(lower)) return;
      if (lower.endsWith('.zip')) {
        if (!window.JSZip) throw new Error('Zip support did not load — unzip and drop the files instead.');
        var zip = await JSZip.loadAsync(await getBlob());
        var entries = Object.keys(zip.files).filter(function(n){ return !zip.files[n].dir; });
        for (var j = 0; j < entries.length; j++) {
          var f = zip.files[entries[j]];
          await handle(entries[j], function(){ return f.async('string'); }, function(){ return f.async('blob'); });
        }
      } else if (lower.endsWith('.csv')) {
        out.push({ kind: 'csv', name: name, rows: rowsFromCsv(await getText()) });
      } else if (/\.(md|markdown)$/.test(lower)) {
        var r = rowFromMarkdown(await getText(), name);
        if (r) out.push({ kind: 'md', name: name, rows: [r] });
      } else if (lower.endsWith('.txt')) {
        rowsFromText(await getText(), name.split('/').pop()).forEach(function(g){ out.push(g); });
      } else if (lower.endsWith('.json')) {
        out.push({ kind: 'json', name: name, rows: rowsFromJson(await getText()) });
      }
    }
    for (var i = 0; i < fileList.length; i++) {
      var file = fileList[i];
      await handle(file.name, function(){ return file.text(); }, function(){ return Promise.resolve(file); });
    }
    return out;
  }

  // Notion's export has the CSV (properties) AND one .md per row (body), so
  // merge by title: markdown supplies instructions, either fills the rest.
  function mergeParsed(groups){
    var byKey = {}, order = [];
    groups.forEach(function(g){
      g.rows.forEach(function(r){
        var k = norm(r.title);
        var cur = byKey[k];
        if (!cur) { byKey[k] = Object.assign({}, r); order.push(k); return; }
        ['core_key','category','notion_page_id','notion_url'].concat(SECTION_KEYS).forEach(function(f){ if (!cur[f] && r[f]) cur[f] = r[f]; });
        if (g.kind === 'md' && (r.instructions || hasSections(r))) SECTION_KEYS.forEach(function(k){ if (r[k]) cur[k] = r[k]; });
        if (!(cur.tags || []).length && (r.tags || []).length) cur.tags = r.tags;
        if (cur.default_due_days == null && r.default_due_days != null) cur.default_due_days = r.default_due_days;
        if (cur.week == null && r.week != null) cur.week = r.week;
      });
    });
    return order.map(function(k){ return byKey[k]; });
  }

  function existingMatch(r){
    if (r.notion_page_id) {
      var byPid = items.filter(function(i){ return i.notion_page_id === r.notion_page_id; })[0];
      if (byPid) return byPid;
    }
    return items.filter(function(i){ return norm(i.title) === norm(r.title); })[0] || null;
  }

  function renderImportPreview(){
    $('alImPreviewWrap').hidden = !importRows.length;
    var dupes = importRows.filter(function(r){ return r.match; }).length;
    $('alImCount').textContent = plural(importRows.length, 'assignment') + ' found' + (dupes ? ' · ' + dupes + ' already in the library' : '') + '.';
    $('alImRows').innerHTML = importRows.map(function(r, idx){
      return '<tr><td><input type="checkbox" data-im-row="'+idx+'"'+(r.include ? ' checked' : '')+' style="accent-color:#071f35;" aria-label="Include '+esc(r.title)+'" /></td>'
        + '<td><b>'+(codeFor(r.core_key, r.week) ? esc(codeFor(r.core_key, r.week)) + ' · ' : '')+esc(r.title)+'</b></td>'
        + '<td>'+esc((CORE_BY_KEY[r.core_key] || {}).label || '—')+'</td>'
        + '<td>'+esc((r.tags || []).join(', '))+'</td>'
        + '<td class="al-snip">'+esc(String(r.outcome || r.instructions || '').replace(/\s+/g, ' ').slice(0, 120))+'</td>'
        + '<td>'+(r.match ? '<span class="al-badge al-badge--upd">Exists</span>' : '<span class="al-badge al-badge--new">New</span>')+'</td></tr>';
    }).join('');
    $('alImAll').checked = importRows.every(function(r){ return r.include; });
    $('alImGo').disabled = !importRows.some(function(r){ return r.include; });
  }

  async function onFiles(files){
    if (!files || !files.length) return;
    note('alImNote', 'Reading ' + plural(files.length, 'file') + '…');
    try {
      var groups = await readFiles(files);
      var rows = mergeParsed(groups);
      importRows = rows.map(function(r){ return Object.assign(r, { include: true, match: existingMatch(r) }); });
      note('alImNote', rows.length ? '' : 'No assignments found in those files.', !rows.length);
      renderImportPreview();
    } catch (e) {
      note('alImNote', 'Could not read files: ' + e.message, true);
    }
  }

  $('alFileInput').addEventListener('change', function(){ var files = Array.prototype.slice.call(this.files || []); this.value = ''; onFiles(files); });
  var drop = $('alDrop');
  ['dragenter','dragover'].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.add('is-over'); }); });
  ['dragleave','drop'].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.remove('is-over'); }); });
  drop.addEventListener('drop', function(e){ onFiles(Array.prototype.slice.call(e.dataTransfer.files || [])); });
  drop.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('alFileInput').click(); } });
  drop.tabIndex = 0;

  $('alImRows').addEventListener('change', function(e){
    var cb = e.target.closest('[data-im-row]'); if (!cb) return;
    importRows[Number(cb.getAttribute('data-im-row'))].include = cb.checked;
    renderImportPreview();
  });
  $('alImAll').addEventListener('change', function(){ var on = this.checked; importRows.forEach(function(r){ r.include = on; }); renderImportPreview(); });

  $('alImGo').addEventListener('click', async function(){
    var mode = $('alImDupe').value;
    var inserts = [], updates = [], skipped = 0;
    importRows.filter(function(r){ return r.include; }).forEach(function(r){
      var f = Object.assign(sectionFields(r), { title: r.title, week: r.week == null ? null : r.week, core_key: r.core_key || '', category: r.category || '', tags: r.tags || [], default_due_days: r.default_due_days });
      if (r.match && mode === 'skip') { skipped++; return; }
      if (r.match && mode === 'update') { updates.push({ id: r.match.id, fields: f, pid: r.notion_page_id }); return; }
      var pid = r.notion_page_id && !items.some(function(i){ return i.notion_page_id === r.notion_page_id; }) ? r.notion_page_id : null;
      inserts.push(Object.assign(f, { source: pid ? 'notion' : 'import', notion_page_id: pid, notion_url: r.notion_url || '' }));
    });
    var btn = this; busy(btn, true, 'Importing…');
    var err = null;
    for (var i = 0; i < inserts.length && !err; i += 200) {
      var r = await sb.from('assignment_library').insert(inserts.slice(i, i + 200));
      if (r.error) err = r.error;
    }
    for (var j = 0; j < updates.length && !err; j++) {
      var u = updates[j];
      if (u.pid && !byId(u.id).notion_page_id && !items.some(function(x){ return x.notion_page_id === u.pid; })) u.fields.notion_page_id = u.pid;
      var r2 = await sb.from('assignment_library').update(u.fields).eq('id', u.id);
      if (r2.error) err = r2.error;
      if (j % 10 === 0) note('alImNote', 'Updating ' + (j + 1) + ' of ' + updates.length + '…');
    }
    busy(btn, false, 'Import');
    if (err) { note('alImNote', 'Import stopped: ' + err.message, true); await reloadItems(); return; }
    await reloadItems();
    importRows = []; renderImportPreview();
    closeModal('alImport');
    toast('Imported: ' + inserts.length + ' new, ' + updates.length + ' updated' + (skipped ? ', ' + skipped + ' skipped' : '') + '.');
  });

  boot().catch(function(e){ console.error(e); });
})();
