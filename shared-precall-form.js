// The weekly pre-call check-in form: default questions, answer types and
// the cleaner for a stored version (public.form_settings, key 'pre_call').
// Shared by the client portal (client-portal/portal.js) and the coach's
// form editor on the Check-in Notes page (checkin-notes/form.js).
(function () {
  // These are the defaults. The coach can reword, reorder, hide and add
  // questions from the "Check-in form" editor; that version is stored in
  // public.form_settings and replaces this list on load. Questions the coach
  // adds are `custom` and save their answers in the submission's `answers`
  // jsonb column instead of a column of their own.
  var DEFAULT_PRECALL_FIELDS = [
    { key:"coaching_call_objective", label:"What would you like to focus on during this week's call?", type:"textarea", required:true },
    { key:"body_core",               label:"Are you participating in the Body Core?", type:"choice", options:["Yes","No"], required:true },
    { key:"current_weight",          label:"Current weight", type:"text", placeholder:"e.g. 182.4 lb", showIf:{ key:"body_core", values:["Yes"] } },
    { key:"tracked_food",            label:"Did you track your food?", type:"choice", options:["Yes","Most Days","No","I've been instructed not to track"], showIf:{ key:"body_core", values:["Yes"] } },
    { key:"obstacle",                label:"What was the obstacle?", hint:"What got in the way of tracking your food this week?", type:"textarea", showIf:{ key:"tracked_food", values:["Most Days","No"] } },
    { key:"progress_photos",         label:"Did you upload Progress Photos this week?", type:"choice", options:["Yes","No (but I will right now)"], showIf:{ key:"body_core", values:["Yes"] } },
    { key:"missed_workouts",         label:"Did you miss any workouts?", type:"choice", options:["Yes","No"], showIf:{ key:"body_core", values:["Yes"] } },
    { key:"workout_days",            label:"Which workouts did you miss?", type:"multi", options:["Push","Pull","Legs","Upper","Lower","Cardio"], showIf:{ key:"missed_workouts", values:["Yes"] } },
    { key:"review_items",            label:"What do you have for us to review?", type:"multi", options:["Homework","Next Week's Calendar"] },
    { key:"files",                   label:"Files & media upload bin", hint:"Up to 10 files — photos, documents, anything you want your coach to see.", type:"files", showIf:{ key:"review_items", values:["Homework"] } },
    { key:"text_url_upload",         label:"Text/URL upload bin", hint:"Separate assignments by title: the assignment title on one line, then the details or URL underneath.", type:"textarea", showIf:{ key:"review_items", values:["Homework"] } },
    { key:"calendar_upload",         label:"Weekly calendar upload", hint:"A PDF or screenshot of your calendar for the week ahead.", type:"files", showIf:{ key:"review_items", values:["Next Week's Calendar","Calendar"] } },
    { key:"suggestions",             label:"Suggestions (optional)", hint:"Feel free to list any suggestions about service, communication, or resources.", type:"textarea" },
    { key:"has_more_homework",       label:"Do you have more homework to turn in?", type:"choice", options:["Yes","No"], legacy:true }
  ];
  var PRECALL_FIELD_TYPES = [
    { key:"text",     label:"Short answer" },
    { key:"textarea", label:"Long answer" },
    { key:"choice",   label:"Pick one" },
    { key:"multi",    label:"Pick any" },
    { key:"files",    label:"File upload" }
  ];

  function defaultPreCallField(key){
    return DEFAULT_PRECALL_FIELDS.filter(function(f){ return f.key === key; })[0] || null;
  }

  // Cleans a stored form definition. Built-in questions keep the type of
  // their DB column; any built-in missing from the stored list comes back
  // hidden so its past answers still show in history.
  function normalizePreCallFields(list){
    var out = [], seen = {};
    (Array.isArray(list) ? list : []).forEach(function(f){
      if (!f || typeof f.key !== 'string' || seen[f.key]) return;
      var def = defaultPreCallField(f.key);
      if (!def && !/^q_[a-z0-9]+$/.test(f.key)) return;
      var type = def ? def.type : f.type;
      if (!PRECALL_FIELD_TYPES.some(function(t){ return t.key === type; })) return;
      seen[f.key] = true;
      var o = {
        key: f.key, type: type, custom: !def,
        label: String(f.label || '').trim() || (def ? def.label : 'Untitled question'),
        hint: String(f.hint || '').trim(),
        placeholder: String(f.placeholder || (def && def.placeholder) || ''),
        required: !!f.required,
        legacy: !!f.legacy
      };
      if (type === 'choice' || type === 'multi') {
        var opts = (Array.isArray(f.options) ? f.options : []).map(function(x){ return String(x).trim(); }).filter(Boolean);
        o.options = opts.length ? opts : (def && def.options ? def.options.slice() : ['Yes','No']);
      }
      if (f.showIf && typeof f.showIf.key === 'string' && Array.isArray(f.showIf.values) && f.showIf.values.length) {
        o.showIf = { key: f.showIf.key, values: f.showIf.values.map(String) };
      }
      out.push(o);
    });
    DEFAULT_PRECALL_FIELDS.forEach(function(d){
      if (!seen[d.key]) out.push(Object.assign({}, d, { legacy: true, custom: false }));
    });
    return out;
  }

  window.CC_PRECALL = {
    defaults: DEFAULT_PRECALL_FIELDS,
    types: PRECALL_FIELD_TYPES,
    normalize: normalizePreCallFields
  };
})();
