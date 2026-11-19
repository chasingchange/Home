// Check-in Notes: coach-only master editor.
//
// The coach's side of each client's weekly check-in ("Wins" and "Coach's
// Objectives"), for every client on one page, one week at a time. Rows live
// in public.client_checkin_coach_notes (scripts/client_checkin_coach_notes.sql),
// one per client per week (week_start = Monday). The client portal's
// Check-ins tab shows the same rows on that week's card
// (client-portal/portal.js → coachNotesHtml).
(function () {
  var SUPABASE_URL = window.CC_SUPABASE_URL || 'https://datrgkjqwyfcbmtwwifm.supabase.co';
  var SUPABASE_KEY = window.CC_SUPABASE_KEY || 'sb_publishable_HrGR9fNaldor1FvDa0sDWA_VM3EPTZ9';
  var COACH_EMAIL = 'tywadebusiness@gmail.com';
  var FIELDS = [
    { key:'wins',             label:'Wins',                placeholder:'What went well for them this week…' },
    { key:'coach_objectives', label:'Coach’s Objectives', placeholder:'What you want to cover or push on…' }
  ];
  var INACTIVE = { Graduated:1, Terminated:1 };

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  var $ = function(id){ return document.getElementById(id); };

  var clients = [];     // { id, name, status }
  var week = null;      // 'YYYY-MM-DD' (Monday)
  var notes = {};       // client_id -> { wins, coach_objectives } for `week`
  var prevNotes = {};   // client_id -> same, for the week before
  var subs = {};        // client_id -> latest submission this week { submitted_at, coaching_call_objective }
  var timers = {};      // client_id -> debounce timer
  var pending = {};     // client_id -> true while unsaved
  var loadSeq = 0;

  // ─── helpers ────────────────────────────────────────────────────────────
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
  function dayKey(d){ return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
  function parseKey(k){ var p = k.split('-').map(Number); return new Date(p[0], p[1]-1, p[2]); }
  function mondayOf(d){ var x = new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
  function shiftWeek(k, n){ var d = parseKey(k); d.setDate(d.getDate() + 7 * n); return dayKey(d); }
  function thisWeek(){ return dayKey(mondayOf(new Date())); }
  function hasNote(n){ return !!(n && (String(n.wins || '').trim() || String(n.coach_objectives || '').trim())); }

  // ─── auth gate ──────────────────────────────────────────────────────────
  async function boot(){
    var { data: { session } } = await sb.auth.getSession();
    if (!session) return gate('Sign in to continue', 'Check-in notes are for the coach. Sign in through the client portal, then come back here.');
    var user = session.user;
    var { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle();
    var coach = (profile && profile.role === 'coach') || user.email === COACH_EMAIL;
    if (!coach) return gate('Coach only', 'This page is where your coach keeps their check-in notes. Your check-ins live in your client portal.');

    var res = await Promise.all([
      sb.from('profiles').select('id, full_name, preferred_name, email, role'),
      sb.from('client_status').select('client_id, status')
    ]);
    var statusBy = {};
    (res[1].data || []).forEach(function(r){ statusBy[r.client_id] = r.status || ''; });
    clients = (res[0].data || []).filter(function(p){ return p.role !== 'coach' && p.email !== COACH_EMAIL; }).map(function(p){
      return { id: p.id, name: p.preferred_name || p.full_name || p.email || 'Client', status: statusBy[p.id] || '' };
    }).sort(function(a, b){ return a.name.localeCompare(b.name); });

    var q = new URLSearchParams(location.search).get('week');
    week = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? dayKey(mondayOf(parseKey(q))) : thisWeek();

    $('cnLoading').hidden = true;
    $('cnApp').hidden = false;
    await loadWeek();
  }

  function gate(title, body, hideLink){
    $('cnLoading').hidden = true;
    $('cnGateTitle').textContent = title;
    $('cnGateBody').textContent = body;
    $('cnGateLink').hidden = !!hideLink;
    $('cnGate').hidden = false;
  }

  // ─── data ───────────────────────────────────────────────────────────────
  async function loadWeek(){
    var seq = ++loadSeq;
    var wk = week;
    writeWeekParam();
    renderWeekBar();
    $('cnList').innerHTML = '<p class="cn-empty">Loading…</p>';
    var from = parseKey(wk), to = parseKey(shiftWeek(wk, 1));
    var res = await Promise.all([
      sb.from('client_checkin_coach_notes').select('client_id, week_start, wins, coach_objectives').in('week_start', [wk, shiftWeek(wk, -1)]),
      sb.from('client_pre_call_submissions').select('client_id, submitted_at, coaching_call_objective')
        .gte('submitted_at', from.toISOString()).lt('submitted_at', to.toISOString()).order('submitted_at', { ascending:false })
    ]);
    if (seq !== loadSeq) return;
    if (res[0].error) {
      $('cnApp').hidden = true;
      gate('Notes not set up yet', 'Run scripts/client_checkin_coach_notes.sql in the Supabase SQL editor, then reload. (' + res[0].error.message + ')', true);
      return;
    }
    notes = {}; prevNotes = {}; subs = {};
    (res[0].data || []).forEach(function(r){
      var n = { wins: r.wins || '', coach_objectives: r.coach_objectives || '' };
      if (r.week_start === wk) notes[r.client_id] = n; else prevNotes[r.client_id] = n;
    });
    (res[1].data || []).forEach(function(r){ if (!subs[r.client_id]) subs[r.client_id] = r; });
    renderList();
  }

  async function save(clientId){
    var n = notes[clientId] || { wins:'', coach_objectives:'' };
    var wk = week;
    setStatus(clientId, 'Saving…');
    var { error } = await sb.from('client_checkin_coach_notes').upsert({
      client_id: clientId, week_start: wk, wins: n.wins, coach_objectives: n.coach_objectives, updated_at: new Date().toISOString()
    }, { onConflict: 'client_id,week_start' });
    if (!error) delete pending[clientId];
    if (wk !== week) return;
    if (error) { setStatus(clientId, 'Not saved — ' + error.message, true); return; }
    setStatus(clientId, 'Saved');
    renderStats();
  }

  async function flushAll(){
    var ids = Object.keys(timers);
    ids.forEach(function(id){ clearTimeout(timers[id]); delete timers[id]; });
    await Promise.all(Object.keys(pending).map(save));
  }

  // ─── render ─────────────────────────────────────────────────────────────
  function writeWeekParam(){
    var q = new URLSearchParams(location.search);
    if (week === thisWeek()) q.delete('week'); else q.set('week', week);
    var s = q.toString() ? '?' + q.toString() : '';
    try { history.replaceState(null, '', location.pathname + s); } catch (e) {}
  }

  function renderWeekBar(){
    var d = parseKey(week);
    var cur = week === thisWeek();
    $('cnWeekLabel').innerHTML = 'Week of ' + esc(d.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' }))
      + (cur ? '<span class="cn-week-tag">· this week</span>' : '');
    $('cnToday').hidden = cur;
  }

  function visibleClients(){
    var q = $('cnSearch').value.trim().toLowerCase();
    var f = $('cnFilter').value;
    var showInactive = $('cnShowInactive').checked;
    return clients.filter(function(c){
      if (!showInactive && INACTIVE[c.status]) return false;
      if (q && c.name.toLowerCase().indexOf(q) === -1) return false;
      if (f === 'todo' && hasNote(notes[c.id])) return false;
      if (f === 'in' && !subs[c.id]) return false;
      if (f === 'out' && subs[c.id]) return false;
      return true;
    });
  }

  function renderStats(){
    var active = clients.filter(function(c){ return !INACTIVE[c.status]; });
    var written = active.filter(function(c){ return hasNote(notes[c.id]); }).length;
    var checkedIn = active.filter(function(c){ return subs[c.id]; }).length;
    $('cnStats').textContent = written + ' / ' + active.length + ' notes written · ' + checkedIn + ' checked in';
  }

  function renderList(){
    renderStats();
    var list = visibleClients();
    if (!clients.length) { $('cnList').innerHTML = '<p class="cn-empty">No clients yet.</p>'; return; }
    if (!list.length) { $('cnList').innerHTML = '<p class="cn-empty">No clients match.</p>'; return; }
    $('cnList').innerHTML = list.map(rowHtml).join('');
  }

  function rowHtml(c){
    var n = notes[c.id] || { wins:'', coach_objectives:'' };
    var prev = prevNotes[c.id];
    var sub = subs[c.id];
    var subChip = sub
      ? '<span class="cn-chip cn-chip--in">Checked in ' + esc(new Date(sub.submitted_at).toLocaleDateString(undefined, { weekday:'short' })) + '</span>'
      : '<span class="cn-chip cn-chip--out">No check-in yet</span>';
    var h = '<div class="cn-row" data-client="' + esc(c.id) + '">'
      + '<div class="cn-row-head"><h2 class="cn-name">' + esc(c.name) + '</h2>'
      + (c.status ? '<span class="cn-chip">' + esc(c.status) + '</span>' : '')
      + subChip
      + '<span class="cn-status" data-status>' + (pending[c.id] ? 'Unsaved' : '') + '</span>'
      + '<a class="cn-row-link" href="../client-portal/?client=' + encodeURIComponent(c.id) + '#checkins">Open check-ins →</a></div>';
    if (sub && sub.coaching_call_objective) h += '<p class="cn-objective"><b>Their focus:</b> ' + esc(sub.coaching_call_objective) + '</p>';
    h += '<div class="cn-fields">';
    FIELDS.forEach(function(f){
      var id = 'cn_' + c.id + '_' + f.key;
      h += '<div class="cn-field"><label class="cn-label" for="' + esc(id) + '">' + esc(f.label) + '</label>'
        + '<textarea class="cn-input" id="' + esc(id) + '" data-field="' + f.key + '" maxlength="4000" placeholder="' + esc(f.placeholder) + '">' + esc(n[f.key]) + '</textarea>';
      if (prev && String(prev[f.key] || '').trim()) {
        h += '<p class="cn-prev">Last week: ' + esc(prev[f.key]) + (n[f.key].trim() ? '' : '<button type="button" data-copy="' + f.key + '">Copy</button>') + '</p>';
      }
      h += '</div>';
    });
    return h + '</div></div>';
  }

  function setStatus(clientId, text, isError){
    var row = document.querySelector('.cn-row[data-client="' + clientId + '"]');
    var el = row && row.querySelector('[data-status]');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-error', !!isError);
  }

  // ─── events ─────────────────────────────────────────────────────────────
  function queueSave(clientId){
    pending[clientId] = true;
    setStatus(clientId, 'Editing…');
    clearTimeout(timers[clientId]);
    timers[clientId] = setTimeout(function(){ delete timers[clientId]; save(clientId); }, 700);
  }

  $('cnList').addEventListener('input', function(e){
    var ta = e.target.closest('[data-field]'); if (!ta) return;
    var id = ta.closest('[data-client]').getAttribute('data-client');
    var n = notes[id] || (notes[id] = { wins:'', coach_objectives:'' });
    n[ta.getAttribute('data-field')] = ta.value;
    queueSave(id);
  });

  $('cnList').addEventListener('click', function(e){
    var btn = e.target.closest('[data-copy]'); if (!btn) return;
    var row = btn.closest('[data-client]');
    var id = row.getAttribute('data-client');
    var key = btn.getAttribute('data-copy');
    var n = notes[id] || (notes[id] = { wins:'', coach_objectives:'' });
    n[key] = (prevNotes[id] && prevNotes[id][key]) || '';
    var ta = row.querySelector('[data-field="' + key + '"]');
    ta.value = n[key];
    btn.remove();
    ta.focus();
    queueSave(id);
  });

  async function goWeek(wk){
    await flushAll();
    week = wk;
    loadWeek();
  }
  $('cnPrev').addEventListener('click', function(){ goWeek(shiftWeek(week, -1)); });
  $('cnNext').addEventListener('click', function(){ goWeek(shiftWeek(week, 1)); });
  $('cnToday').addEventListener('click', function(){ goWeek(thisWeek()); });
  $('cnSearch').addEventListener('input', renderList);
  $('cnFilter').addEventListener('change', renderList);
  $('cnShowInactive').addEventListener('change', renderList);

  window.addEventListener('beforeunload', function(e){
    if (!Object.keys(pending).length) return;
    flushAll();
    e.preventDefault();
    e.returnValue = '';
  });

  boot();
})();
