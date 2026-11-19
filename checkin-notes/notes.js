// Check-in Notes: coach-only master editor.
//
// The coach's side of each client's weekly check-in ("Wins" and "Coach's
// Objectives"), for every client on one page, one week at a time. Rows live
// in public.client_checkin_coach_notes (scripts/client_checkin_coach_notes.sql),
// one per client per week (week_start = Monday). The client portal's
// Check-ins tab shows the same rows on that week's card
// (client-portal/portal.js → coachNotesHtml).
//
// Each row also has two checkboxes (scripts/client_checkin_scheduling.sql):
// "Went over routine" and "Next meeting scheduled". With the coach's
// Google Calendar connected, the page finds each client's meetings ("Name x
// Tyler", or the client as a guest) and shows this week's meeting, the next
// one, and the repeating series behind it. "Next meeting scheduled" follows
// the calendar until the coach ticks or unticks it by hand.
(function () {
  var SUPABASE_URL = window.CC_SUPABASE_URL || 'https://datrgkjqwyfcbmtwwifm.supabase.co';
  var SUPABASE_KEY = window.CC_SUPABASE_KEY || 'sb_publishable_HrGR9fNaldor1FvDa0sDWA_VM3EPTZ9';
  var COACH_EMAIL = 'tywadebusiness@gmail.com';
  var FIELDS = [
    { key:'wins',             label:'Wins',                placeholder:'What went well for them this week…' },
    { key:'coach_objectives', label:'Coach’s Objectives', placeholder:'What you want to cover or push on…' }
  ];
  var INACTIVE = { Graduated:1, Terminated:1 };
  // Same OAuth client and token function as the client portal's Calendar tab
  // (client-portal/portal.js → CALENDAR_CONFIG), so connecting there or here
  // connects both.
  var GOOGLE = {
    clientId: '976458437286-ufpguk5m0aoa3ob8ghjhf1bvqih747h0.apps.googleusercontent.com',
    scope: 'https://www.googleapis.com/auth/calendar.events email',
    tokenFunction: 'google-calendar-token'
  };
  var CAL_WEEKS_AHEAD = 6;

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  var $ = function(id){ return document.getElementById(id); };

  var user = null;
  var clients = [];     // { id, name, status, email, names: [lowercase full names], first }
  var week = null;      // 'YYYY-MM-DD' (Monday)
  var notes = {};       // client_id -> note row for `week`
  var prevNotes = {};   // client_id -> same, for the week before
  var subs = {};        // client_id -> latest submission this week { submitted_at, coaching_call_objective }
  var clientCals = {};  // client_id -> { connected, synced_at } (their own calendar, see client_calendar_snapshot.sql)
  var timers = {};      // client_id -> debounce timer
  var pending = {};     // client_id -> true while unsaved
  var loadSeq = 0;
  var schedCols = true; // false until client_checkin_scheduling.sql has been run

  // Coach's Google Calendar.
  var cal = {
    status: 'off',      // off | loading | on | error
    email: '', token: null, exp: 0,
    server: null,       // google-calendar-token deployed? null = unknown
    error: '',
    week: null,         // week the meetings below were loaded for
    byClient: {}        // client_id -> { thisWeek, next, series }
  };
  var calSeq = 0;

  // ─── helpers ────────────────────────────────────────────────────────────
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
  function dayKey(d){ return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
  function parseKey(k){ var p = k.split('-').map(Number); return new Date(p[0], p[1]-1, p[2]); }
  function mondayOf(d){ var x = new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
  function shiftWeek(k, n){ var d = parseKey(k); d.setDate(d.getDate() + 7 * n); return dayKey(d); }
  function thisWeek(){ return dayKey(mondayOf(new Date())); }
  function hasNote(n){ return !!(n && (String(n.wins || '').trim() || String(n.coach_objectives || '').trim())); }
  function blankNote(){ return { wins:'', coach_objectives:'', calendar_reviewed:false, next_scheduled:null }; }
  function noteFor(id){ return notes[id] || (notes[id] = blankNote()); }
  function norm(s){ return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function fmtWhen(d){
    return d.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' })
      + ' · ' + d.toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit' });
  }
  function fmtAgo(d){
    var days = Math.floor((Date.now() - d.getTime()) / 864e5);
    return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago';
  }

  // Calendar booked → ticked, unless the coach ticked / unticked it by hand.
  function calFresh(){ return cal.status === 'on' && cal.week === week; }
  function nextMeeting(id){ var m = calFresh() && cal.byClient[id]; return m && m.next; }
  function isScheduled(id){
    var n = notes[id];
    if (n && n.next_scheduled != null) return !!n.next_scheduled;
    return !!nextMeeting(id);
  }
  function isReviewed(id){ return !!(notes[id] && notes[id].calendar_reviewed); }

  // ─── auth gate ──────────────────────────────────────────────────────────
  async function boot(){
    var { data: { session } } = await sb.auth.getSession();
    if (!session) return gate('Sign in to continue', 'Check-in notes are for the coach. Sign in through the client portal, then come back here.');
    user = session.user;
    var { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle();
    var coach = (profile && profile.role === 'coach') || user.email === COACH_EMAIL;
    if (!coach) return gate('Coach only', 'This page is where your coach keeps their check-in notes. Your check-ins live in your client portal.');

    var res = await Promise.all([
      sb.from('profiles').select('id, full_name, preferred_name, email, role'),
      sb.from('client_status').select('client_id, status'),
      sb.from('client_calendar_connections').select('client_id, connected, synced_at')
    ]);
    var statusBy = {};
    (res[1].data || []).forEach(function(r){ statusBy[r.client_id] = r.status || ''; });
    (res[2].data || []).forEach(function(r){
      if (!r.connected) return;
      var c = clientCals[r.client_id] || (clientCals[r.client_id] = { connected:true, synced_at:null });
      var t = r.synced_at ? new Date(r.synced_at) : null;
      if (t && (!c.synced_at || t > c.synced_at)) c.synced_at = t;
    });
    clients = (res[0].data || []).filter(function(p){ return p.role !== 'coach' && p.email !== COACH_EMAIL; }).map(function(p){
      var names = [p.full_name, p.preferred_name].map(norm).filter(Boolean);
      return {
        id: p.id, name: p.preferred_name || p.full_name || p.email || 'Client', status: statusBy[p.id] || '',
        email: norm(p.email), names: names, firsts: names.map(function(n){ return n.split(' ')[0]; })
      };
    }).sort(function(a, b){ return a.name.localeCompare(b.name); });

    var q = new URLSearchParams(location.search).get('week');
    week = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? dayKey(mondayOf(parseKey(q))) : thisWeek();

    $('cnLoading').hidden = true;
    $('cnApp').hidden = false;
    renderCalBar();
    await loadWeek();
    calResume();
  }

  function gate(title, body, hideLink){
    $('cnLoading').hidden = true;
    $('cnGateTitle').textContent = title;
    $('cnGateBody').textContent = body;
    $('cnGateLink').hidden = !!hideLink;
    $('cnGate').hidden = false;
  }

  // ─── data ───────────────────────────────────────────────────────────────
  function notesQuery(wk, withSched){
    return sb.from('client_checkin_coach_notes')
      .select('client_id, week_start, wins, coach_objectives' + (withSched ? ', calendar_reviewed, next_scheduled' : ''))
      .in('week_start', [wk, shiftWeek(wk, -1)]);
  }

  async function loadWeek(){
    var seq = ++loadSeq;
    var wk = week;
    writeWeekParam();
    renderWeekBar();
    $('cnList').innerHTML = '<p class="cn-empty">Loading…</p>';
    var from = parseKey(wk), to = parseKey(shiftWeek(wk, 1));
    var res = await Promise.all([
      notesQuery(wk, schedCols),
      sb.from('client_pre_call_submissions').select('client_id, submitted_at, coaching_call_objective')
        .gte('submitted_at', from.toISOString()).lt('submitted_at', to.toISOString()).order('submitted_at', { ascending:false })
    ]);
    // The checkbox columns come from a separate script; work without them.
    if (res[0].error && schedCols && /calendar_reviewed|next_scheduled/.test(res[0].error.message || '')) {
      schedCols = false;
      $('cnBanner').hidden = false;
      res[0] = await notesQuery(wk, false);
    }
    if (seq !== loadSeq) return;
    if (res[0].error) {
      $('cnApp').hidden = true;
      gate('Notes not set up yet', 'Run scripts/client_checkin_coach_notes.sql in the Supabase SQL editor, then reload. (' + res[0].error.message + ')', true);
      return;
    }
    notes = {}; prevNotes = {}; subs = {};
    (res[0].data || []).forEach(function(r){
      var n = {
        wins: r.wins || '', coach_objectives: r.coach_objectives || '',
        calendar_reviewed: !!r.calendar_reviewed, next_scheduled: r.next_scheduled == null ? null : !!r.next_scheduled
      };
      if (r.week_start === wk) notes[r.client_id] = n; else prevNotes[r.client_id] = n;
    });
    (res[1].data || []).forEach(function(r){ if (!subs[r.client_id]) subs[r.client_id] = r; });
    renderList();
    if (cal.status === 'on' && cal.week !== wk) calLoad();
  }

  async function save(clientId){
    var n = notes[clientId] || blankNote();
    var wk = week;
    setStatus(clientId, 'Saving…');
    var row = { client_id: clientId, week_start: wk, wins: n.wins, coach_objectives: n.coach_objectives, updated_at: new Date().toISOString() };
    if (schedCols) { row.calendar_reviewed = !!n.calendar_reviewed; row.next_scheduled = n.next_scheduled; }
    var { error } = await sb.from('client_checkin_coach_notes').upsert(row, { onConflict: 'client_id,week_start' });
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

  // ─── coach's Google Calendar ────────────────────────────────────────────
  // Connecting works like the portal's Calendar tab: one Google approval,
  // then the google-calendar-token Edge Function keeps it alive. The token is
  // cached under the same key the portal uses, so either page picks it up.
  function cacheKey(){ return 'cc_gcal_token_' + (user && user.id || ''); }
  function remember(token, expiresIn, email){
    cal.token = token;
    cal.exp = Date.now() + (Number(expiresIn) || 3600) * 1000;
    if (email) cal.email = email;
    try { localStorage.setItem(cacheKey(), JSON.stringify({ t:token, e:cal.exp, m:cal.email || '' })); } catch (e) { /* storage off */ }
  }
  function forget(){
    cal.token = null; cal.exp = 0;
    try { localStorage.removeItem(cacheKey()); } catch (e) { /* storage off */ }
  }

  async function serverCall(body){
    if (cal.server === false) return null;
    try {
      var r = await sb.functions.invoke(GOOGLE.tokenFunction, { body: body });
      if (r.error || !r.data) {
        var st = r.error && r.error.context && r.error.context.status;
        if (st === 404) cal.server = false;
        return null;
      }
      cal.server = true;
      return r.data;
    } catch (e) { return null; }
  }

  async function accessToken(){
    if (cal.token && cal.exp - Date.now() > 60 * 1000) return cal.token;
    var d = await serverCall({ action:'token' });
    if (d && d.access_token) { remember(d.access_token, d.expires_in, d.email); return d.access_token; }
    return null;
  }

  async function calResume(){
    try {
      var c = JSON.parse(localStorage.getItem(cacheKey()) || 'null');
      if (c && c.t && c.e - Date.now() > 2 * 60 * 1000) { cal.token = c.t; cal.exp = c.e; cal.email = c.m || ''; }
    } catch (e) { /* storage off */ }
    cal.status = 'loading'; renderCalBar();
    var token = await accessToken();
    if (!token) { cal.status = 'off'; renderCalBar(); return; }
    calLoad();
  }

  function gisReady(){ return window.google && google.accounts && google.accounts.oauth2; }

  function requestCode(){
    return new Promise(function(resolve, reject){
      google.accounts.oauth2.initCodeClient({
        client_id: GOOGLE.clientId, scope: GOOGLE.scope, ux_mode: 'popup',
        login_hint: cal.email || COACH_EMAIL,
        callback: function(resp){ resp && resp.code ? resolve(resp.code) : reject(new Error((resp && (resp.error_description || resp.error)) || 'No code returned.')); },
        error_callback: function(err){ reject(new Error((err && err.message) || 'Google sign-in was closed.')); }
      }).requestCode();
    });
  }

  function requestTokenPopup(){
    return new Promise(function(resolve, reject){
      var client = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE.clientId, scope: GOOGLE.scope,
        callback: function(resp){ resp && resp.access_token ? resolve(resp) : reject(new Error((resp && resp.error) || 'No access token returned.')); },
        error_callback: function(err){ reject(new Error((err && err.message) || 'Google sign-in was closed.')); }
      });
      client.requestAccessToken({ prompt: '', login_hint: cal.email || COACH_EMAIL });
    });
  }

  async function calConnect(){
    if (!gisReady()) { cal.status = 'error'; cal.error = 'Google sign-in is still loading — try again in a moment.'; renderCalBar(); return; }
    cal.status = 'loading'; cal.error = ''; renderCalBar();
    try {
      if (cal.server !== false) {
        var code = await requestCode();
        var d = await serverCall({ action:'exchange', code: code });
        if (d && d.access_token) { remember(d.access_token, d.expires_in, d.email); return calLoad(); }
        if (d && d.error) throw new Error(d.error === 'calendar_scope_missing' ? 'Calendar access wasn’t allowed — tick the calendar box when Google asks.' : d.error);
      }
      // Token function not deployed: an hour-long browser-only token.
      var resp = await requestTokenPopup();
      remember(resp.access_token, resp.expires_in);
      calLoad();
    } catch (e) {
      cal.status = 'error'; cal.error = (e && e.message) || 'Couldn’t connect Google Calendar.'; renderCalBar();
    }
  }

  async function gapi(token, path){
    var r = await fetch('https://www.googleapis.com/calendar/v3/' + path, { headers: { Authorization: 'Bearer ' + token } });
    if (r.status === 401) { var e = new Error('reconnect'); e.status = 401; throw e; }
    if (!r.ok) throw new Error('Google Calendar said ' + r.status);
    return r.json();
  }

  async function fetchEvents(token, from, to){
    var out = [], pageToken = '';
    for (var i = 0; i < 5; i++) {
      var d = await gapi(token, 'calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=250'
        + '&timeMin=' + encodeURIComponent(from.toISOString()) + '&timeMax=' + encodeURIComponent(to.toISOString())
        + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''));
      out = out.concat(d.items || []);
      if (!d.nextPageToken) break;
      pageToken = d.nextPageToken;
    }
    return out;
  }

  // Which client is this meeting with? A guest's email first, then the
  // "Name x Tyler" title. Anything else (gym, writing blocks…) is skipped.
  function matchClient(ev){
    var emails = (ev.attendees || []).map(function(a){ return norm(a.email); }).filter(function(e){ return e && e !== COACH_EMAIL; });
    for (var i = 0; i < emails.length; i++) {
      var byEmail = clients.filter(function(c){ return c.email && c.email === emails[i]; });
      if (byEmail.length === 1) return byEmail[0];
    }
    var title = norm(ev.summary);
    var m = title.match(/^(.+?)\s+(?:x|<>|\/|&)\s+tyler\b/) || title.match(/^tyler(?:\s+wade)?\s+(?:x|<>|\/|&)\s+(.+)$/);
    if (!m) return null;
    var who = m[1].replace(/[^a-z' -]/g, '').trim();
    if (!who) return null;
    var full = clients.filter(function(c){ return c.names.indexOf(who) !== -1; });
    if (full.length === 1) return full[0];
    var first = who.split(' ')[0];
    var byFirst = clients.filter(function(c){ return c.firsts.indexOf(first) !== -1; });
    if (byFirst.length > 1) {
      // Two clients share a first name: an active one, or a last-name hint.
      var narrowed = byFirst.filter(function(c){ return c.names.some(function(n){ return n.indexOf(who) === 0; }); });
      if (narrowed.length === 1) return narrowed[0];
      var active = byFirst.filter(function(c){ return !INACTIVE[c.status]; });
      if (active.length === 1) return active[0];
    }
    return byFirst.length === 1 ? byFirst[0] : null;
  }

  var DAYS = { MO:'Mon', TU:'Tue', WE:'Wed', TH:'Thu', FR:'Fri', SA:'Sat', SU:'Sun' };
  function describeSeries(master){
    var rule = (master.recurrence || []).filter(function(r){ return /^RRULE:/.test(r); })[0];
    if (!rule || !master.start || !master.start.dateTime) return '';
    var p = {};
    rule.slice(6).split(';').forEach(function(kv){ var x = kv.split('='); p[x[0]] = x[1]; });
    var n = Number(p.INTERVAL || 1);
    var freq = p.FREQ === 'WEEKLY' ? (n === 1 ? 'Weekly' : 'Every ' + n + ' weeks')
      : p.FREQ === 'MONTHLY' ? (n === 1 ? 'Monthly' : 'Every ' + n + ' months')
      : p.FREQ === 'DAILY' ? (n === 1 ? 'Daily' : 'Every ' + n + ' days') : 'Repeats';
    var start = new Date(master.start.dateTime);
    var days = p.BYDAY ? p.BYDAY.split(',').map(function(d){ return DAYS[d.slice(-2)] || d; }).join(' & ')
      : start.toLocaleDateString(undefined, { weekday:'short' });
    return freq + ' · ' + days + ' ' + start.toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit' });
  }

  function toMeeting(ev){
    var start = new Date(ev.start.dateTime);
    var orig = ev.originalStartTime && ev.originalStartTime.dateTime ? new Date(ev.originalStartTime.dateTime) : null;
    return {
      start: start,
      seriesId: ev.recurringEventId || '',
      movedFrom: orig && Math.abs(orig - start) > 60 * 1000 ? orig : null,
      link: ev.htmlLink || ''
    };
  }

  async function calLoad(){
    var seq = ++calSeq;
    var wk = week;
    cal.status = 'loading'; cal.error = ''; renderCalBar();
    try {
      var token = await accessToken();
      if (!token) throw Object.assign(new Error('reconnect'), { status: 401 });
      var from = parseKey(wk), nextMon = parseKey(shiftWeek(wk, 1)), to = parseKey(shiftWeek(wk, CAL_WEEKS_AHEAD));
      var events = await fetchEvents(token, from, to);
      var byClient = {};
      events.forEach(function(ev){
        if (ev.status === 'cancelled' || !ev.start || !ev.start.dateTime) return;
        var c = matchClient(ev); if (!c) return;
        var m = byClient[c.id] || (byClient[c.id] = { thisWeek:null, next:null, series:'' });
        var mt = toMeeting(ev);
        if (mt.start < nextMon) { if (!m.thisWeek) m.thisWeek = mt; }
        else if (!m.next) m.next = mt;
      });
      // The repeating series behind each client's meetings ("Weekly · Tue 3 PM").
      var seriesIds = {};
      Object.keys(byClient).forEach(function(id){
        var m = byClient[id], s = (m.next && m.next.seriesId) || (m.thisWeek && m.thisWeek.seriesId);
        if (s) seriesIds[s] = true;
      });
      var masters = {};
      await Promise.all(Object.keys(seriesIds).slice(0, 60).map(function(sid){
        return gapi(token, 'calendars/primary/events/' + encodeURIComponent(sid)).then(function(d){ masters[sid] = d; }, function(){});
      }));
      Object.keys(byClient).forEach(function(id){
        var m = byClient[id], s = (m.next && m.next.seriesId) || (m.thisWeek && m.thisWeek.seriesId);
        if (s && masters[s]) m.series = describeSeries(masters[s]);
      });
      if (seq !== calSeq || wk !== week) return;
      cal.byClient = byClient; cal.week = wk; cal.status = 'on';
    } catch (e) {
      if (seq !== calSeq) return;
      if (e && e.status === 401) { forget(); cal.status = 'off'; cal.error = 'Google Calendar needs reconnecting.'; }
      else { cal.status = 'error'; cal.error = (e && e.message) || 'Couldn’t load your calendar.'; }
      cal.byClient = {}; cal.week = null;
    }
    renderCalBar();
    clients.forEach(refreshRowParts);
    renderStats();
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

  function renderCalBar(){
    var el = $('cnCal'), h = '';
    if (cal.status === 'on') {
      h = '<span class="cn-cal-dot is-on"></span><span>Google Calendar' + (cal.email ? ' · ' + esc(cal.email) : '') + '</span>'
        + '<button type="button" class="cn-linkbtn" data-cal="refresh">Refresh</button>';
    } else if (cal.status === 'loading') {
      h = '<span class="cn-cal-dot"></span><span>Checking your calendar…</span>';
    } else {
      h = '<span class="cn-cal-dot' + (cal.status === 'error' ? ' is-error' : '') + '"></span>'
        + '<span>' + esc(cal.error || 'Connect your Google Calendar to see each client’s next meeting.') + '</span>'
        + '<button type="button" class="cn-btn" data-cal="connect">' + (cal.error ? 'Reconnect' : 'Connect Google Calendar') + '</button>';
    }
    el.innerHTML = h;
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
      if (f === 'unreviewed' && isReviewed(c.id)) return false;
      if (f === 'unscheduled' && isScheduled(c.id)) return false;
      return true;
    });
  }

  function renderStats(){
    var active = clients.filter(function(c){ return !INACTIVE[c.status]; });
    var written = active.filter(function(c){ return hasNote(notes[c.id]); }).length;
    var checkedIn = active.filter(function(c){ return subs[c.id]; }).length;
    var reviewed = active.filter(function(c){ return isReviewed(c.id); }).length;
    var scheduled = active.filter(function(c){ return isScheduled(c.id); }).length;
    $('cnStats').textContent = written + ' / ' + active.length + ' notes · ' + checkedIn + ' checked in · '
      + reviewed + ' routines reviewed · ' + scheduled + ' next booked';
  }

  function renderList(){
    renderStats();
    var list = visibleClients();
    if (!clients.length) { $('cnList').innerHTML = '<p class="cn-empty">No clients yet.</p>'; return; }
    if (!list.length) { $('cnList').innerHTML = '<p class="cn-empty">No clients match.</p>'; return; }
    $('cnList').innerHTML = list.map(rowHtml).join('');
  }

  function meetingHtml(label, mt){
    var h = '<span class="cn-meet"><b>' + label + ':</b> ' + esc(fmtWhen(mt.start));
    if (mt.movedFrom) h += ' <span class="cn-moved">moved from ' + esc(mt.movedFrom.toLocaleDateString(undefined, { weekday:'short' })) + ' '
      + esc(mt.movedFrom.toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit' })) + '</span>';
    return h + '</span>';
  }

  function calHtml(c){
    if (!calFresh()) return '';
    var m = cal.byClient[c.id];
    if (!m) return '<p class="cn-cal-line is-none">No meetings with them on your calendar in the next ' + CAL_WEEKS_AHEAD + ' weeks.</p>';
    var parts = [];
    parts.push(m.thisWeek ? meetingHtml('This week', m.thisWeek) : '<span class="cn-meet"><b>This week:</b> none</span>');
    parts.push(m.next ? meetingHtml('Next', m.next) : '<span class="cn-meet is-warn"><b>Next:</b> nothing booked after this week</span>');
    if (m.series) parts.push('<span class="cn-meet"><b>Usual:</b> ' + esc(m.series) + '</span>');
    return '<p class="cn-cal-line">' + parts.join('') + '</p>';
  }

  function checksHtml(c){
    var n = notes[c.id] || blankNote();
    var dis = schedCols ? '' : ' disabled';
    var cc = clientCals[c.id];
    var theirCal = cc
      ? '<span class="cn-hint">' + (cc.synced_at ? 'synced ' + esc(fmtAgo(cc.synced_at)) : 'connected') + '</span>'
      : '<span class="cn-hint">not connected</span>';
    var sched = isScheduled(c.id);
    var schedHint = '';
    if (n.next_scheduled == null) {
      schedHint = calFresh() && sched ? 'from your calendar' : '';
    } else if (calFresh() && n.next_scheduled !== !!nextMeeting(c.id)) {
      schedHint = 'marked by you · <button type="button" class="cn-linkbtn" data-reset="next_scheduled">use calendar</button>';
    }
    return '<label class="cn-check"><input type="checkbox" data-flag="calendar_reviewed"' + (n.calendar_reviewed ? ' checked' : '') + dis + ' /> Went over routine</label>'
      + '<a class="cn-minilink" href="../client-portal/?client=' + encodeURIComponent(c.id) + '#calendar">Open their calendar</a>' + theirCal
      + '<span class="cn-sep"></span>'
      + '<label class="cn-check"><input type="checkbox" data-flag="next_scheduled"' + (sched ? ' checked' : '') + dis + ' /> Next meeting scheduled</label>'
      + (schedHint ? '<span class="cn-hint">' + schedHint + '</span>' : '');
  }

  function rowHtml(c){
    var n = notes[c.id] || blankNote();
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
    h += '<div data-calpart>' + calHtml(c) + '</div>';
    h += '<div class="cn-checks" data-checks>' + checksHtml(c) + '</div>';
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

  // Update a row's calendar line and checkboxes without touching its
  // textareas (so typing isn't interrupted when the calendar finishes loading).
  function refreshRowParts(c){
    var row = document.querySelector('.cn-row[data-client="' + c.id + '"]');
    if (!row) return;
    row.querySelector('[data-calpart]').innerHTML = calHtml(c);
    row.querySelector('[data-checks]').innerHTML = checksHtml(c);
  }

  function setStatus(clientId, text, isError){
    var row = document.querySelector('.cn-row[data-client="' + clientId + '"]');
    var el = row && row.querySelector('[data-status]');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-error', !!isError);
  }

  // ─── events ─────────────────────────────────────────────────────────────
  function queueSave(clientId, delay){
    pending[clientId] = true;
    setStatus(clientId, 'Editing…');
    clearTimeout(timers[clientId]);
    timers[clientId] = setTimeout(function(){ delete timers[clientId]; save(clientId); }, delay == null ? 700 : delay);
  }

  function clientById(id){ return clients.filter(function(c){ return c.id === id; })[0]; }

  $('cnList').addEventListener('input', function(e){
    var ta = e.target.closest('[data-field]'); if (!ta) return;
    var id = ta.closest('[data-client]').getAttribute('data-client');
    noteFor(id)[ta.getAttribute('data-field')] = ta.value;
    queueSave(id);
  });

  $('cnList').addEventListener('change', function(e){
    var box = e.target.closest('[data-flag]'); if (!box) return;
    var id = box.closest('[data-client]').getAttribute('data-client');
    noteFor(id)[box.getAttribute('data-flag')] = box.checked;
    refreshRowParts(clientById(id));
    renderStats();
    queueSave(id, 0);
  });

  $('cnList').addEventListener('click', function(e){
    var reset = e.target.closest('[data-reset]');
    if (reset) {
      var rid = reset.closest('[data-client]').getAttribute('data-client');
      noteFor(rid).next_scheduled = null;
      refreshRowParts(clientById(rid));
      renderStats();
      queueSave(rid, 0);
      return;
    }
    var btn = e.target.closest('[data-copy]'); if (!btn) return;
    var row = btn.closest('[data-client]');
    var id = row.getAttribute('data-client');
    var key = btn.getAttribute('data-copy');
    var n = noteFor(id);
    n[key] = (prevNotes[id] && prevNotes[id][key]) || '';
    var ta = row.querySelector('[data-field="' + key + '"]');
    ta.value = n[key];
    btn.remove();
    ta.focus();
    queueSave(id);
  });

  $('cnCal').addEventListener('click', function(e){
    var b = e.target.closest('[data-cal]'); if (!b) return;
    if (b.getAttribute('data-cal') === 'connect') calConnect(); else calLoad();
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
