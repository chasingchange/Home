// Check-in Notes → "Form" tab: the coach's editor for the weekly pre-call
// check-in form every client fills out. Same editor as the coach dashboard's
// "Check-in form" sheet (client-portal/portal.js → openFormEditor), shown in
// the page instead of a popup. Saves to public.form_settings (key 'pre_call');
// clients get the new version next time they open their portal.
//
// notes.js calls CheckinForm.start(sb) once it has confirmed the coach.
(function () {
  var P = window.CC_PRECALL;   // ../shared-precall-form.js
  var $ = function(id){ return document.getElementById(id); };
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
  function copy(x){ return JSON.parse(JSON.stringify(x)); }
  function setNote(msg, isError){ var el = $('cnFormNote'); el.textContent = msg || ''; el.classList.toggle('is-error', !!isError); }

  var sb = null;
  var loaded = false;
  var draft = [];
  var openKey = null;
  var mode = 'edit';
  var dirty = false;
  var tab = 'notes';

  function typeLabel(t){ var x = P.types.filter(function(y){ return y.key === t; })[0]; return x ? x.label : t; }
  function find(key){ return draft.filter(function(f){ return f.key === key; })[0] || null; }
  function setDirty(d){ dirty = d; setNote(d ? 'Unsaved changes' : ''); }

  // ─── tabs ───────────────────────────────────────────────────────────────
  function showTab(t){
    tab = t === 'form' ? 'form' : 'notes';
    Array.prototype.forEach.call(document.querySelectorAll('[data-cn-tab]'), function(b){
      var on = b.getAttribute('data-cn-tab') === tab;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $('cnNotesPane').hidden = tab !== 'notes';
    $('cnFormPane').hidden = tab !== 'form';
    $('cnLedeNotes').hidden = tab !== 'notes';
    $('cnLedeForm').hidden = tab !== 'form';
    var q = new URLSearchParams(location.search);
    if (tab === 'form') q.set('tab', 'form'); else q.delete('tab');
    try { history.replaceState(history.state, '', location.pathname + (q.toString() ? '?' + q.toString() : '') + location.hash); } catch (e) {}
    if (tab === 'form' && !loaded) load();
  }

  // ─── data ───────────────────────────────────────────────────────────────
  async function load(){
    loaded = true;
    $('cnFormBody').innerHTML = '<p class="cn-empty">Loading…</p>';
    var fields = P.normalize(P.defaults);
    var { data, error } = await sb.from('form_settings').select('fields').eq('key', 'pre_call').maybeSingle();
    // No saved version yet (or the table isn't set up): start from the defaults.
    if (!error && data && Array.isArray(data.fields) && data.fields.length) fields = P.normalize(data.fields);
    draft = copy(fields);
    openKey = null;
    setDirty(false);
    render();
  }

  // The draft as it will be stored: options trimmed, stale show-if answers dropped.
  function cleaned(){
    return draft.map(function(f){
      var o = { key:f.key, type:f.type, label:String(f.label || '').trim() || 'Untitled question' };
      if (f.hint) o.hint = String(f.hint).trim();
      if (f.placeholder) o.placeholder = f.placeholder;
      if (f.required) o.required = true;
      if (f.legacy) o.legacy = true;
      if (f.type === 'choice' || f.type === 'multi') o.options = (f.options || []).map(function(x){ return String(x).trim(); }).filter(Boolean);
      if (f.showIf) {
        var p = find(f.showIf.key);
        var vals = p ? f.showIf.values.filter(function(v){ return (p.options || []).indexOf(v) !== -1; }) : [];
        if (vals.length) o.showIf = { key:f.showIf.key, values:vals };
      }
      return o;
    });
  }

  async function save(){
    var fields = cleaned();
    var empty = fields.filter(function(f){ return (f.type === 'choice' || f.type === 'multi') && !f.options.length; })[0];
    if (empty) { setNote('“' + empty.label + '” needs at least one answer choice.', true); return; }
    var btn = $('cnFormSave');
    btn.disabled = true;
    setNote('Saving…');
    var { error } = await sb.from('form_settings').upsert({ key:'pre_call', fields:fields, updated_at:new Date().toISOString() });
    btn.disabled = false;
    if (error) { setNote('Could not save: ' + error.message, true); return; }
    draft = copy(P.normalize(fields));
    setDirty(false);
    setNote('Saved — clients see the new form next time they open it.');
    render();
  }

  // ─── render ─────────────────────────────────────────────────────────────
  function render(){
    Array.prototype.forEach.call(document.querySelectorAll('[data-fm-mode]'), function(b){
      b.classList.toggle('is-active', b.getAttribute('data-fm-mode') === mode);
    });
    $('cnFormAdd').hidden = mode !== 'edit';
    if (mode === 'preview') {
      $('cnFormBody').innerHTML = '<p class="cp-ci-hint">This is what clients see. Try different answers to check which questions show up. Nothing here is saved.</p>'
        + '<div class="cp-fm-preview">' + previewHtml(P.normalize(cleaned())) + '</div>';
      applyVisibility();
      return;
    }
    var h = '<div class="cp-fm-list">';
    draft.forEach(function(f, i){ h += questionHtml(f, i); });
    $('cnFormBody').innerHTML = h + '</div>';
  }

  function questionHtml(f, i){
    var open = openKey === f.key;
    var parent = f.showIf ? find(f.showIf.key) : null;
    var chips = '<span class="cp-fm-chip">'+esc(typeLabel(f.type))+'</span>'
      + (f.required ? '<span class="cp-fm-chip">Required</span>' : '')
      + (parent ? '<span class="cp-fm-chip cp-fm-chip--if">Only if “'+esc(parent.label)+'” is '+esc(f.showIf.values.join(' or '))+'</span>' : '')
      + (f.legacy ? '<span class="cp-fm-chip cp-fm-chip--off">Hidden from clients</span>' : '');
    var h = '<div class="cp-fm-q'+(f.legacy ? ' is-hidden' : '')+(f.custom && f._new ? ' is-new' : '')+'" data-fm-key="'+esc(f.key)+'">'
      + '<div class="cp-fm-q-head" data-fm-toggle>'
      + '<span class="cp-fm-q-num">'+(i + 1)+'</span>'
      + '<div class="cp-fm-q-main"><div class="cp-fm-q-label">'+esc(f.label)+'</div><div class="cp-fm-q-meta">'+chips+'</div></div>'
      + '<button type="button" class="cp-fm-move" data-fm-move="-1" aria-label="Move up"'+(i === 0 ? ' disabled' : '')+'>↑</button>'
      + '<button type="button" class="cp-fm-move" data-fm-move="1" aria-label="Move down"'+(i === draft.length - 1 ? ' disabled' : '')+'>↓</button>'
      + '</div>';
    h += '<div class="cp-fm-q-body"'+(open ? '' : ' hidden')+'>';
    h += '<div><label class="cp-ci-hint">Question</label><input type="text" class="cp-ci-input" data-fm="label" value="'+esc(f.label)+'" maxlength="200" /></div>';
    h += '<div><label class="cp-ci-hint">Help text (optional)</label><input type="text" class="cp-ci-input" data-fm="hint" value="'+esc(f.hint || '')+'" maxlength="300" /></div>';
    if (f.custom) {
      h += '<div><label class="cp-ci-hint">Answer type</label><select class="cp-select" data-fm="type">'
        + P.types.map(function(t){ return '<option value="'+t.key+'"'+(t.key === f.type ? ' selected' : '')+'>'+esc(t.label)+'</option>'; }).join('')
        + '</select></div>';
    } else {
      h += '<p class="cp-ci-hint" style="margin:0;">Answer type: '+esc(typeLabel(f.type))+' — this is one of the original Notion questions, so its type is fixed.</p>';
    }
    if (f.type === 'choice' || f.type === 'multi') {
      h += '<div><label class="cp-ci-hint">Answer choices — one per line</label><textarea class="cp-textarea" data-fm="options">'+esc((f.options || []).join('\n'))+'</textarea></div>';
    }
    h += '<div class="cp-fm-row"><label class="cp-fm-check"><input type="checkbox" data-fm="required"'+(f.required ? ' checked' : '')+' /> Required</label></div>';

    // Conditional logic: any other pick-one / pick-any question can drive this one.
    var parents = draft.filter(function(p){ return p.key !== f.key && (p.type === 'choice' || p.type === 'multi'); });
    h += '<div class="cp-fm-if"><label class="cp-ci-hint">Only show when…</label>'
      + '<select class="cp-select" data-fm="ifKey"><option value="">Always show this question</option>'
      + parents.map(function(p){ return '<option value="'+esc(p.key)+'"'+(parent && parent.key === p.key ? ' selected' : '')+'>'+esc(p.label)+'</option>'; }).join('')
      + '</select>';
    if (parent) {
      h += '<p class="cp-ci-hint" style="margin:10px 0 6px;">…the answer is any of:</p><div class="cp-fm-row">'
        + (parent.options || []).map(function(o){
            return '<label class="cp-fm-check"><input type="checkbox" data-fm-ifval value="'+esc(o)+'"'+(f.showIf.values.indexOf(o) !== -1 ? ' checked' : '')+' /> '+esc(o)+'</label>';
          }).join('')
        + '</div>';
    }
    h += '</div>';
    h += '<div class="cp-fm-row">'
      + '<button type="button" class="cp-btn-sm" data-fm-act="hide">'+(f.legacy ? 'Show to clients' : 'Hide from clients')+'</button>'
      + (f.custom ? '<button type="button" class="cp-btn-sm cp-btn-sm--danger" data-fm-act="delete">Delete question</button>' : '')
      + '</div>';
    if (!f.custom) h += '<p class="cp-ci-hint" style="margin:0;">Original questions can be hidden but not deleted, so past answers keep showing in check-in history.</p>';
    return h + '</div></div>';
  }

  // ─── preview (mirrors the client's form in client-portal/portal.js → ciFormHtml) ─
  var previewFields = [];
  function previewHtml(fields){
    previewFields = fields;
    var h = '<form id="cnFormPreview" novalidate>';
    fields.forEach(function(f){
      if (f.legacy) return;
      var lid = 'cnPvL_' + f.key;
      h += '<div class="cp-ci-field" data-ci-wrap="'+esc(f.key)+'"><span class="cp-ci-label" id="'+lid+'">'+esc(f.label)+(f.required ? ' *' : '')+'</span>'
        + (f.hint ? '<p class="cp-ci-hint">'+esc(f.hint)+'</p>' : '');
      if (f.type === 'textarea') {
        h += '<textarea class="cp-textarea" aria-labelledby="'+lid+'"></textarea>';
      } else if (f.type === 'text') {
        h += '<input type="text" class="cp-ci-input" aria-labelledby="'+lid+'" placeholder="'+esc(f.placeholder || '')+'" />';
      } else if (f.type === 'choice' || f.type === 'multi') {
        var type = f.type === 'choice' ? 'radio' : 'checkbox';
        h += '<div class="cp-opt-row" role="'+(type === 'radio' ? 'radiogroup' : 'group')+'" aria-labelledby="'+lid+'">';
        f.options.forEach(function(o){
          h += '<label class="cp-opt"><input type="'+type+'" name="pv_'+esc(f.key)+'" value="'+esc(o)+'" /><span>'+esc(o)+'</span></label>';
        });
        h += '</div>';
      } else if (f.type === 'files') {
        h += '<div class="cp-btn-row" style="margin-top:8px;"><span class="cp-btn-sm" aria-disabled="true">+ Add files</span></div>';
      }
      h += '</div>';
    });
    h += '<div class="cp-btn-row" style="margin-top:28px;"><button type="button" class="cp-btn-sm cp-btn-sm--primary" disabled>Submit check-in</button></div></form>';
    return h;
  }

  function fieldVisible(f, vals, depth){
    if (f.legacy) return false;
    if (!f.showIf) return true;
    if ((depth || 0) > previewFields.length) return false; // circular show-if
    var parent = previewFields.filter(function(p){ return p.key === f.showIf.key; })[0];
    if (!parent || !fieldVisible(parent, vals, (depth || 0) + 1)) return false;
    return (vals[f.showIf.key] || []).some(function(v){ return f.showIf.values.indexOf(v) !== -1; });
  }

  function applyVisibility(){
    var form = $('cnFormPreview'); if (!form) return;
    var vals = {};
    previewFields.forEach(function(f){
      if (f.type !== 'choice' && f.type !== 'multi') return;
      vals[f.key] = Array.prototype.map.call(form.querySelectorAll('input[name="pv_'+f.key+'"]:checked'), function(c){ return c.value; });
    });
    previewFields.forEach(function(f){
      var wrap = form.querySelector('[data-ci-wrap="'+f.key+'"]');
      if (wrap) wrap.hidden = !fieldVisible(f, vals);
    });
  }

  // ─── events ─────────────────────────────────────────────────────────────
  function wire(){
    Array.prototype.forEach.call(document.querySelectorAll('[data-cn-tab]'), function(b){
      b.addEventListener('click', function(){ showTab(b.getAttribute('data-cn-tab')); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-fm-mode]'), function(b){
      b.addEventListener('click', function(){ mode = b.getAttribute('data-fm-mode'); render(); });
    });

    var body = $('cnFormBody');
    // Typing: update the draft in place (no re-render, so focus stays put).
    body.addEventListener('input', function(e){
      var el = e.target.closest('[data-fm]'); if (!el) return;
      var card = el.closest('[data-fm-key]'); var f = card && find(card.getAttribute('data-fm-key')); if (!f) return;
      var prop = el.getAttribute('data-fm');
      if (prop === 'label' || prop === 'hint') {
        f[prop] = el.value;
        if (prop === 'label') { var l = card.querySelector('.cp-fm-q-label'); if (l) l.textContent = f.label || 'Untitled question'; }
        setDirty(true);
      }
      if (prop === 'options') { f.options = el.value.split('\n'); setDirty(true); }
    });

    body.addEventListener('change', function(e){
      var pv = $('cnFormPreview');
      if (pv && pv.contains(e.target)) { applyVisibility(); return; }
      var el = e.target.closest('[data-fm], [data-fm-ifval]'); if (!el) return;
      var card = el.closest('[data-fm-key]'); var f = card && find(card.getAttribute('data-fm-key')); if (!f) return;
      var prop = el.getAttribute('data-fm');
      if (prop === 'options') {
        f.options = el.value.split('\n').map(function(x){ return x.trim(); }).filter(Boolean);
      } else if (prop === 'required') {
        f.required = el.checked;
      } else if (prop === 'type') {
        f.type = el.value;
        if ((f.type === 'choice' || f.type === 'multi') && !(f.options || []).filter(Boolean).length) f.options = ['Yes','No'];
        // Questions that depended on this one no longer can if it isn't a choice.
        if (f.type !== 'choice' && f.type !== 'multi') draft.forEach(function(c){ if (c.showIf && c.showIf.key === f.key) delete c.showIf; });
      } else if (prop === 'ifKey') {
        if (el.value) { var p = find(el.value); f.showIf = { key: el.value, values: p && p.options && p.options.length ? [p.options[0]] : [] }; }
        else delete f.showIf;
      } else if (el.hasAttribute('data-fm-ifval')) {
        f.showIf.values = Array.prototype.map.call(card.querySelectorAll('[data-fm-ifval]:checked'), function(c){ return c.value; });
      } else {
        return;
      }
      setDirty(true);
      render();
    });

    body.addEventListener('click', function(e){
      var card = e.target.closest('[data-fm-key]'); if (!card) return;
      var key = card.getAttribute('data-fm-key');
      var f = find(key); if (!f) return;
      var mv = e.target.closest('[data-fm-move]');
      if (mv) {
        var i = draft.indexOf(f), j = i + parseInt(mv.getAttribute('data-fm-move'), 10);
        if (j < 0 || j >= draft.length) return;
        draft.splice(i, 1); draft.splice(j, 0, f);
        setDirty(true); render();
        return;
      }
      var act = e.target.closest('[data-fm-act]');
      if (act) {
        var a = act.getAttribute('data-fm-act');
        if (a === 'hide') f.legacy = !f.legacy;
        if (a === 'delete') {
          if (!confirm('Delete “' + f.label + '”? Clients’ past answers to it will no longer show in their check-in history. (To keep them, hide the question instead.)')) return;
          draft.splice(draft.indexOf(f), 1);
          draft.forEach(function(c){ if (c.showIf && c.showIf.key === key) delete c.showIf; });
          openKey = null;
        }
        setDirty(true); render();
        return;
      }
      if (e.target.closest('[data-fm-toggle]')) {
        openKey = openKey === key ? null : key;
        render();
      }
    });

    $('cnFormAdd').addEventListener('click', function(){
      var key = 'q_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      draft.push({ key:key, type:'text', label:'New question', hint:'', custom:true, _new:true });
      openKey = key;
      setDirty(true);
      render();
      var card = document.querySelector('[data-fm-key="'+key+'"]');
      if (card) { card.scrollIntoView({ block:'center', behavior:'smooth' }); var inp = card.querySelector('[data-fm="label"]'); if (inp) { inp.focus(); inp.select(); } }
    });

    $('cnFormReset').addEventListener('click', function(){
      if (!confirm('Reset to the original Notion questions? Questions you added will be removed when you save, and past answers to them will no longer show.')) return;
      draft = copy(P.normalize(P.defaults));
      openKey = null;
      setDirty(true);
      render();
    });

    $('cnFormSave').addEventListener('click', save);

    window.addEventListener('beforeunload', function(e){
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  window.CheckinForm = {
    start: function(client){
      sb = client;
      wire();
      showTab(new URLSearchParams(location.search).get('tab') === 'form' ? 'form' : 'notes');
    }
  };
})();
