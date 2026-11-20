// Check-in Notes: "Import from Notion".
//
// Pulls the coach's two Notion databases into the portal through the
// notion-checkins Edge Function (supabase/functions/notion-checkins):
//   - Client Pre Call Form → clients' weekly check-in answers
//   - Check In             → Wins / Coach's Objectives (+ Talking Points)
// The function handles 25 Notion rows per call, so this loops on
// next_cursor and shows a running count. Running it again is safe: pre-call
// rows update in place, and coach notes only fill empty fields unless
// "Replace" is ticked.
(function () {
  var FN = 'notion-checkins';
  var $ = function(id){ return document.getElementById(id); };
  var sb = null, hooks = {}, running = false;

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }

  function sinceDate(weeks){
    if (!weeks) return '';
    var d = new Date(); d.setDate(d.getDate() - 7 * weeks);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  async function call(body){
    var r = await sb.functions.invoke(FN, { body: body });
    if (r.error) {
      var st = r.error.context && r.error.context.status;
      if (st === 404) throw new Error('The notion-checkins function is not deployed yet. Run: supabase functions deploy notion-checkins');
      var msg = r.error.message;
      try { var j = await r.error.context.json(); if (j && j.error) msg = j.error; } catch (e) { /* not json */ }
      throw new Error(msg);
    }
    if (r.data && r.data.error) throw new Error(r.data.error);
    return r.data;
  }

  function setLog(html){ $('cnImpLog').innerHTML = html; }

  async function pull(source, label, since, overwrite, tally){
    var cursor = null, page = 0;
    do {
      page++;
      setLog('<p>' + esc(label) + ': reading page ' + page + '…</p>');
      var d = await call({ action:'pull', source:source, since:since, overwrite:overwrite, cursor:cursor });
      tally.created += d.created || 0; tally.updated += d.updated || 0; tally.unchanged += d.unchanged || 0;
      (d.unmatched || []).forEach(function(u){ tally.unmatched.push(u); });
      (d.errors || []).forEach(function(e){ if (tally.errors.indexOf(e) < 0) tally.errors.push(e); });
      cursor = d.next_cursor;
    } while (cursor);
  }

  function summary(label, t){
    var h = '<p><b>' + esc(label) + ':</b> ' + t.created + ' added, ' + t.updated + ' updated'
      + (t.unchanged ? ', ' + t.unchanged + ' already up to date' : '') + '.</p>';
    if (t.unmatched.length) {
      var seen = {};
      var rows = t.unmatched.filter(function(u){ var k = u.name.toLowerCase(); if (seen[k]) return false; seen[k] = 1; return true; });
      h += '<p class="cn-hint">' + rows.length + ' name' + (rows.length === 1 ? '' : 's') + ' didn’t match a client'
        + (label === 'Pre-call forms' ? ' (saved without a client; they attach on a later import once the name matches)' : ' (skipped)')
        + '. Fix the name in Notion or the client’s profile, then import again:</p><ul class="cn-imp-list">'
        + rows.map(function(u){ return '<li>' + (u.url ? '<a href="' + esc(u.url) + '" target="_blank" rel="noopener">' + esc(u.name) + '</a>' : esc(u.name)) + '</li>'; }).join('')
        + '</ul>';
    }
    if (t.errors.length) h += '<ul class="cn-imp-list is-error">' + t.errors.slice(0, 8).map(function(e){ return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>';
    return h;
  }

  async function run(){
    if (running) return;
    var doPre = $('cnImpPre').checked, doCheck = $('cnImpCheck').checked;
    if (!doPre && !doCheck) { setLog('<p class="is-error">Pick at least one database.</p>'); return; }
    var since = sinceDate(Number($('cnImpRange').value));
    var overwrite = $('cnImpOverwrite').checked;
    running = true;
    $('cnImpRun').disabled = true;
    var out = '';
    try {
      if (hooks.before) await hooks.before();
      var jobs = [];
      if (doPre) jobs.push(['precall', 'Pre-call forms']);
      if (doCheck) jobs.push(['checkin', 'Check In notes']);
      for (var i = 0; i < jobs.length; i++) {
        var t = { created:0, updated:0, unchanged:0, unmatched:[], errors:[] };
        try {
          await pull(jobs[i][0], jobs[i][1], since, overwrite, t);
          out += summary(jobs[i][1], t);
        } catch (e) {
          out += (t.created || t.updated ? summary(jobs[i][1], t) : '') + '<p class="is-error"><b>' + esc(jobs[i][1]) + ':</b> ' + esc(e.message) + '</p>';
        }
        setLog(out);
      }
      if (hooks.after) await hooks.after();
    } finally {
      running = false;
      $('cnImpRun').disabled = false;
      setLog(out || '<p>Nothing to import.</p>');
    }
  }

  window.CheckinImport = {
    start: function(client, h){
      sb = client; hooks = h || {};
      $('cnImportBtn').addEventListener('click', function(){
        var p = $('cnImport'); p.hidden = !p.hidden;
        if (!p.hidden) $('cnImpRun').focus();
      });
      $('cnImpClose').addEventListener('click', function(){ $('cnImport').hidden = true; });
      $('cnImpRun').addEventListener('click', run);
    }
  };
})();
