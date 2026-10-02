(function () {

  // Read the auth link type (recovery / invite / magiclink) before Supabase
  // processes and clears the URL hash.
  var urlAuthType = (function(){
    var raw = (window.location.hash || '') + ' ' + (window.location.search || '');
    var m = raw.match(/type=([a-z]+)/);
    return m ? m[1] : null;
  })();

  // ─── Config ───────────────────────────────────────────────────────────
  // Falls back to the known project values if shared-supabase-config.js
  // wasn't loaded first, so this still works standalone.
  var SUPABASE_URL = window.CC_SUPABASE_URL || 'https://datrgkjqwyfcbmtwwifm.supabase.co';
  var SUPABASE_KEY = window.CC_SUPABASE_KEY || 'sb_publishable_HrGR9fNaldor1FvDa0sDWA_VM3EPTZ9';
  var COACH_EMAIL  = 'tywadebusiness@gmail.com';

  // Calendar connect (Google Calendar / Outlook). Fill in real OAuth client
  // IDs before this goes live — setup steps for both providers are in
  // scripts/client_calendar_connections.sql. Both flows run entirely in the
  // browser: no client secret, no token ever touches Supabase.
  var CALENDAR_CONFIG = {
    googleClientId:    '976458437286-ufpguk5m0aoa3ob8ghjhf1bvqih747h0.apps.googleusercontent.com',
    googleScope:       'https://www.googleapis.com/auth/calendar.readonly',
    microsoftClientId: 'YOUR_MICROSOFT_ENTRA_APPLICATION_CLIENT_ID',
    microsoftScopes:   ['Calendars.Read']
  };
  var CAL_WINDOW_DAYS = 14;

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // The six cores are a fixed set — every client has exactly these six,
  // scored week to week. Everything else (tasks, notes, metrics, resources,
  // wins) is a free-form list per client, loaded from Supabase.
  var CORE_DEFS = [
    { key:"body",   label:"Body",   color:"#77d770" },
    { key:"mind",   label:"Mind",   color:"#2a9df0" },
    { key:"art",    label:"Art",    color:"#ffbd59" },
    { key:"soul",   label:"Soul",   color:"#aa70d7" },
    { key:"career", label:"Career", color:"#f02348" },
    { key:"life",   label:"Life",   color:"#f58b1c" }
  ];

  function coreColor(key){
    var d = CORE_DEFS.filter(function(c){ return c.key === key; })[0];
    return d ? d.color : '#77d770';
  }

  // Preferred cardio: as broad a menu as makes sense for a general
  // coaching roster, each with a unit-appropriate goal hint (time for
  // steady-state/interval work, distance units that match the modality —
  // yards for swimming, meters for erg work, miles for biking/hiking).
  var CARDIO_OPTIONS = [
    { value:"running",         label:"Running",                          hint:"e.g. 5 miles @ 9:00/mi" },
    { value:"jogging",         label:"Jogging",                          hint:"e.g. 2 miles, easy pace" },
    { value:"walking",         label:"Walking",                          hint:"e.g. 45 min brisk pace" },
    { value:"incline_walking", label:"Incline Walking / Rucking",        hint:"e.g. 30 min @ 12% incline" },
    { value:"hiking",          label:"Hiking",                           hint:"e.g. 4 miles" },
    { value:"cycling_outdoor", label:"Cycling / Biking (Outdoor)",       hint:"e.g. 12 miles" },
    { value:"indoor_cycling",  label:"Indoor Cycling / Spin",            hint:"e.g. 40 min class" },
    { value:"swimming",        label:"Swimming",                        hint:"e.g. 1,000 yards" },
    { value:"rowing",          label:"Rowing (Erg)",                    hint:"e.g. 2,000 meters" },
    { value:"ski_erg",         label:"Ski Erg",                         hint:"e.g. 1,000 meters" },
    { value:"elliptical",      label:"Elliptical",                      hint:"e.g. 30 min" },
    { value:"stairmaster",     label:"Stairmaster / StepMill",          hint:"e.g. 20 min / 60 floors" },
    { value:"stair_climbing",  label:"Stair Climbing (Real Stairs)",    hint:"e.g. 10 flights x 5" },
    { value:"assault_bike",    label:"Assault Bike / Air Bike",         hint:"e.g. 20 cal/min x 10" },
    { value:"jump_rope",       label:"Jump Rope",                       hint:"e.g. 15 min, 3x5min rounds" },
    { value:"hiit",            label:"HIIT / Sprint Intervals",         hint:"e.g. 8x30s sprint / 90s rest" },
    { value:"boxing",          label:"Boxing / Kickboxing Cardio",      hint:"e.g. 30 min bag work" },
    { value:"dance",           label:"Dance Cardio",                    hint:"e.g. 45 min class" },
    { value:"sled",            label:"Sled Push / Pull",                hint:"e.g. 10x20yd pushes" },
    { value:"other",           label:"Other",                           hint:"Describe the goal" }
  ];

  function cardioLabel(value){
    var d = CARDIO_OPTIONS.filter(function(c){ return c.value === value; })[0];
    return d ? d.label : value;
  }

  var FLAG_COLORS = { 'On track':'#77d770', 'Needs a nudge':'#f58b1c', 'At risk':'#f02348' };

  var remDays  = ["Monday","Tuesday","Sunday"];
  var remChans = ["text","email","push"];

  // Offboarding: the end-of-program reflection form, mirrored from the
  // coach's Notion "Chasing Change Offboarding" form. Text fields are
  // free-form, rating fields are 1-5 selects, keys match the
  // client_offboarding table columns exactly so the form can read/write
  // the row directly with no key-mapping layer.
  var OFFBOARD_FIELDS = [
    { key:"hoped_for",             label:"When you started, what were you hoping would change most?", type:"textarea" },
    { key:"what_changed",          label:"What actually changed?", type:"textarea" },
    { key:"surprised",             label:"What surprised you about your progress?", type:"textarea" },
    { key:"habits_stuck",          label:"Which habits stuck the strongest?", type:"textarea" },
    { key:"most_proud",            label:"What are you most proud of from this program?", type:"textarea" },
    { key:"old_you",               label:"What are you doing now that “old you” wouldn’t have done?", type:"textarea" },
    { key:"do_differently",        label:"What would you do differently if you restarted the program?", type:"textarea" },
    { key:"still_unclear",         label:"What still feels unclear?", type:"textarea" },
    { key:"most_helpful",          label:"What part of coaching helped you the most?", type:"textarea" },
    { key:"improve_structurally",  label:"What could I improve structurally?", type:"textarea" },
    { key:"tools_confusing",       label:"What tools felt confusing or unnecessary?", type:"textarea" },
    { key:"clarity_of_plan",       label:"Clarity of plan (1-5)", type:"rating" },
    { key:"accountability_support",label:"Accountability support (1-5)", type:"rating" },
    { key:"check_ins",             label:"Check-ins (1-5)", type:"rating" },
    { key:"communication_speed",   label:"Communication speed (1-5)", type:"rating" },
    { key:"next_goal",             label:"What’s the next goal from here?", type:"textarea" },
    { key:"continued_structure",   label:"Would continued structure help with the next phase?", type:"textarea" }
  ];
  var CONTINUATION_SIGNALS = ["Testimonial","Referral","Check-in call later","Next phase coaching"];

  // Weekly pre-call form, mirrored from the coach's Notion "Client Pre Call
  // Form". Keys are client_pre_call_submissions columns, so Notion-synced
  // rows and portal submissions render through the same definitions.
  var PRECALL_FIELDS = [
    { key:"coaching_call_objective", label:"What's the objective for our coaching call?", type:"textarea", required:true },
    { key:"current_weight",          label:"Current weight", type:"text", placeholder:"e.g. 182.4 lb" },
    { key:"body_core",               label:"Are you participating in the Body Core?", type:"choice", options:["Yes","No"] },
    { key:"workout_days",            label:"Which workouts did you complete this week?", type:"multi", options:["Push","Pull","Legs","Cardio"] },
    { key:"missed_workouts",         label:"Did you miss any workouts?", type:"choice", options:["Yes","No"] },
    { key:"obstacle",                label:"What was the obstacle?", hint:"If anything got in the way this week, what was it?", type:"textarea" },
    { key:"tracked_food",            label:"Did you track your food?", type:"choice", options:["Yes","No","Most Days","I've been instructed not to track"] },
    { key:"review_items",            label:"What do you want to review on the call?", type:"multi", options:["Homework","Next Week's Calendar"] },
    { key:"has_more_homework",       label:"Do you have more homework to turn in?", type:"choice", options:["Yes","No"] },
    { key:"text_url_upload",         label:"Homework — paste text or links", type:"textarea" },
    { key:"files",                   label:"Files & media", hint:"Photos, documents, anything you want your coach to see.", type:"files" },
    { key:"calendar_upload",         label:"Next week's calendar", hint:"A screenshot or export of your calendar for the week ahead.", type:"files" }
  ];

  // Homework lifecycle: assigned -> in_progress -> submitted -> complete,
  // with needs_revision sending it back to the client.
  var HW_STATUSES = [
    { key:"assigned",       label:"Not started",    color:"#5b6b7a" },
    { key:"in_progress",    label:"In progress",    color:"#2a9df0" },
    { key:"submitted",      label:"Submitted",      color:"#aa70d7" },
    { key:"needs_revision", label:"Needs revision", color:"#f58b1c" },
    { key:"complete",       label:"Complete",       color:"#3d9b37" }
  ];
  var HW_CLIENT_STATUSES = ["assigned","in_progress","submitted"];

  var GOAL_STATUSES = [
    { key:"not_started", label:"Not started" },
    { key:"in_progress", label:"In progress" },
    { key:"on_hold",     label:"On hold" },
    { key:"achieved",    label:"Achieved" }
  ];

  function normalizeGoalStatus(s){
    if (s === 'active' || !s) return 'in_progress';
    return GOAL_STATUSES.some(function(g){ return g.key === s; }) ? s : 'in_progress';
  }

  // Private bucket for homework + check-in uploads (see scripts/client_portal_alpha.sql).
  var UPLOAD_BUCKET = 'client-uploads';
  var MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

  // ─── Runtime state ──────────────────────────────────────────────────────
  var state = { view:"client", openCard:null, openRows:{} };
  var pwOpen = true;
  var pendingUser = null;
  var pendingProfile = null;
  var needsPassword = (urlAuthType === 'invite');
  var currentUser = null;
  var biometricOfferedThisLoad = false;
  var isCoachUser = false;
  var coachUser = null;
  var coachProfile = null;
  var ownProfile = null;   // the signed-in client's own profile row (nickname editing)

  var roster = [];          // coach view: [{id,name,route,weekNow,weekTotal,adh,flag,color,next,...}]
  var flags = [];
  var remQueue = [];
  var reviewQueue = [];     // coach view: non-negotiables claimed by clients, awaiting the coach's final review
  var hwReviewQueue = [];   // coach view: homework clients have submitted
  var ciWeekByClient = {};  // coach view: client_id -> this week's latest pre-call submission time

  var viewingClientId = null;   // client_id currently shown in the client view
  var portalData = null;        // that client's loaded dashboard content

  var calState = {
    google:  { connected:false, needsReconnect:false, token:null, email:'', events:[], busy:false },
    outlook: { connected:false, needsReconnect:false, account:null, email:'', events:[], busy:false }
  };
  var googleTokenClient = null;
  var msalInstance = null;
  var msalReady = null;   // promise, resolves once msalInstance.initialize() has run

  var editState = null;         // client being edited in the "Edit portal" form

  // ─── Biometric (Face ID / Touch ID) unlock ─────────────────────────────
  var BIOMETRIC_CRED_KEY     = 'cpBiometricCredentialId';
  var BIOMETRIC_EMAIL_KEY    = 'cpBiometricEmail';
  var BIOMETRIC_DECLINED_KEY = 'cpBiometricDeclined';

  function b64urlToBuf(s){
    s = s.replace(/-/g,'+').replace(/_/g,'/');
    while (s.length % 4) s += '=';
    var bin = atob(s), buf = new Uint8Array(bin.length);
    for (var i=0;i<bin.length;i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  }

  function bufToB64url(buf){
    var bytes = new Uint8Array(buf), bin = '';
    for (var i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }

  function biometricSupported(){
    return !!(window.PublicKeyCredential && navigator.credentials);
  }

  function platformAuthAvailable(){
    if (!biometricSupported()) return Promise.resolve(false);
    return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(function(){ return false; });
  }

  function biometricEnabledFor(email){
    return !!(biometricSupported() && localStorage.getItem(BIOMETRIC_CRED_KEY) && localStorage.getItem(BIOMETRIC_EMAIL_KEY) === email);
  }

  async function registerBiometric(user){
    var cred = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'Client Portal' },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: user.email, displayName: user.email },
        pubKeyCredParams: [{ type:'public-key', alg:-7 }, { type:'public-key', alg:-257 }],
        authenticatorSelection: { authenticatorAttachment:'platform', userVerification:'required' },
        timeout: 60000
      }
    });
    if (!cred) throw new Error('No credential created.');
    localStorage.setItem(BIOMETRIC_CRED_KEY, bufToB64url(cred.rawId));
    localStorage.setItem(BIOMETRIC_EMAIL_KEY, user.email);
    localStorage.removeItem(BIOMETRIC_DECLINED_KEY);
  }

  async function authenticateBiometric(){
    var credId = localStorage.getItem(BIOMETRIC_CRED_KEY);
    if (!credId) throw new Error('No biometric credential on this device.');
    var assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ id: b64urlToBuf(credId), type:'public-key' }],
        userVerification: 'required',
        timeout: 60000
      }
    });
    if (!assertion) throw new Error('Verification failed.');
  }

  function showBiometricLock(user){
    pendingUser = user;
    $('cpAuth').hidden = false;
    $('cpDash').hidden = true;
    showStep('cpStepBiometric');
  }

  function maybeOfferBiometric(user){
    if (biometricOfferedThisLoad || !user || !user.email) return;
    if (localStorage.getItem(BIOMETRIC_DECLINED_KEY) === user.email) return;
    if (biometricEnabledFor(user.email)) return;
    platformAuthAvailable().then(function(avail){
      if (!avail) return;
      biometricOfferedThisLoad = true;
      $('cpBiometricBanner').hidden = false;
    });
  }

  var $ = function(id){ return document.getElementById(id); };

  function esc(s){ return String(s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); }

  // ─── Check existing session on load ───────────────────────────────────
  (async function(){
    var { data:{ session } } = await sb.auth.getSession();
    if (session) {
      if (urlAuthType === 'recovery') { showSetPasswordStep(session.user); return; }
      if (biometricEnabledFor(session.user.email)) { showBiometricLock(session.user); return; }
      showDash(session.user);
      return;
    }

    // Handle magic link / invite / recovery tokens in the URL (Supabase
    // handles the hash automatically and fires the matching event below).
    sb.auth.onAuthStateChange(function(event, session){
      if (event === 'PASSWORD_RECOVERY' && session) {
        showSetPasswordStep(session.user);
        return;
      }
      if (session && event === 'SIGNED_IN' && (!currentUser || currentUser.id !== session.user.id)) {
        showDash(session.user);
      }
    });
  })();

  // ─── Password reveal ──────────────────────────────────────────────────
  $('cpPwRevealBtn').addEventListener('click', function(){
    pwOpen = !pwOpen;
    $('cpPwField').classList.toggle('is-open', pwOpen);
    $('cpPasswordSubmit').hidden = !pwOpen;
    $('cpEmailSubmit').hidden = pwOpen;
    $('cpPwRevealBtn').textContent = pwOpen ? 'Email me a sign-in link instead' : 'I know my password';
    $('cpEmailHint').hidden = pwOpen;
    if (pwOpen) $('cpPasswordInput').focus(); else $('cpEmailInput').focus();
  });

  // ─── Send magic link ──────────────────────────────────────────────────
  $('cpEmailSubmit').addEventListener('click', async function(){
    var email = $('cpEmailInput').value.trim();
    if (!email) { showErr('cpEmailError','Enter your email address.'); return; }

    setLoading($('cpEmailSubmit'), true, 'Sending…');
    hideErr('cpEmailError');

    var { error } = await sb.auth.signInWithOtp({
      email: email,
      options: { emailRedirectTo: window.location.href, shouldCreateUser: false }
    });

    setLoading($('cpEmailSubmit'), false, 'Email me a sign-in link');

    if (error) {
      showErr('cpEmailError','No account found for that email. Ask your coach for an invite.');
      return;
    }

    $('cpMagicEmail').textContent = email;
    showStep('cpStepMagic');
  });

  // ─── Password sign in ─────────────────────────────────────────────────
  $('cpPasswordSubmit').addEventListener('click', async function(){
    var email    = $('cpEmailInput').value.trim();
    var password = $('cpPasswordInput').value;
    if (!email || !password) { showErr('cpEmailError','Enter your email and password.'); return; }

    setLoading($('cpPasswordSubmit'), true, 'Signing in…');
    hideErr('cpEmailError');

    var { data, error } = await sb.auth.signInWithPassword({ email, password });

    setLoading($('cpPasswordSubmit'), false, 'Sign in with password');

    if (error) { showErr('cpEmailError','Incorrect email or password.'); return; }
    // Signing in with a password proves one is set — self-heal the flag.
    await sb.from('profiles').upsert({ id: data.user.id, has_password: true }, { onConflict: 'id' });
    showDash(data.user);
  });

  $('cpBackFromMagic').addEventListener('click', function(){ showStep('cpStepEmail'); });

  // ─── Helpers ──────────────────────────────────────────────────────────
  function showStep(id){
    ['cpStepEmail','cpStepMagic','cpStepName','cpStepSetPassword','cpStepForgotSent','cpStepBiometric'].forEach(function(s){ $(s).hidden = s!==id; });
    hideErr('cpEmailError'); hideErr('cpNameError'); hideErr('cpSetPasswordError'); hideErr('cpBiometricError');
  }

  function showErr(id, msg){ var e=$(id); e.textContent=msg; e.classList.add('show'); }
  function hideErr(id){ var e=$(id); e.textContent=''; e.classList.remove('show'); }

  function setLoading(btn, loading, label){
    btn.disabled = loading;
    btn.textContent = label;
  }

  function firstNameOf(profile, user){
    return profile && profile.full_name ? profile.full_name.split(' ')[0] : user.email.split('@')[0];
  }

  function preferredNameOf(profile, user){
    return (profile && profile.preferred_name) ? profile.preferred_name : firstNameOf(profile, user);
  }

  // ─── Show dashboard ───────────────────────────────────────────────────
  async function showDash(user){
    // Get profile from Supabase (role + name)
    var { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).single();

    if (needsPassword || !profile || profile.has_password !== true) {
      needsPassword = false;
      pendingProfile = profile;
      showSetPasswordStep(user);
      return;
    }

    continueAfterAuthSteps(user, profile);
  }

  function continueAfterAuthSteps(user, profile){
    if (!profile || !profile.full_name) {
      pendingUser = user;
      $('cpAuth').hidden = false;
      $('cpDash').hidden = true;
      showStep('cpStepName');
      return;
    }

    renderDash(user, profile);
  }

  function showSetPasswordStep(user){
    pendingUser = user;
    $('cpAuth').hidden = false;
    $('cpDash').hidden = true;
    showStep('cpStepSetPassword');
  }

  function renderDash(user, profile){
    $('cpAuth').hidden = true;
    $('cpDash').hidden = false;

    isCoachUser  = (profile && profile.role === 'coach') || user.email === COACH_EMAIL;
    coachUser    = isCoachUser ? user : null;
    coachProfile = isCoachUser ? profile : null;

    currentUser = user;
    maybeOfferBiometric(user);

    $('cpBackToRoster').hidden = true;

    if (isCoachUser) {
      state.view = 'coach';
      ownProfile = null;
      $('cpNicknameEdit').hidden = true;
      $('cpWelcome').textContent   = 'Welcome back, ' + firstNameOf(profile, user) + '.';
      $('cpRouteLine').textContent = 'Coach Dashboard';
      renderViewToggle();
      loadRoster();
    } else {
      state.view = 'client';
      state.portalTab = 'portal';
      ownProfile = profile;
      $('cpNicknameEdit').hidden = false;
      loadClientPortal(user.id, preferredNameOf(profile, user));
    }
  }

  // ─── Data loading: one client's full portal ────────────────────────────
  async function fetchPortalData(clientId){
    var results = await Promise.all([
      sb.from('client_dashboard').select('*').eq('client_id', clientId).maybeSingle(),
      sb.from('client_cores').select('*').eq('client_id', clientId).order('position'),
      sb.from('client_tasks').select('*').eq('client_id', clientId).order('position'),
      sb.from('client_notes').select('*').eq('client_id', clientId).order('created_at', { ascending:false }),
      sb.from('client_metrics').select('*').eq('client_id', clientId).order('position'),
      sb.from('client_resources').select('*').eq('client_id', clientId).order('position'),
      sb.from('client_wins').select('*').eq('client_id', clientId).order('position'),
      sb.from('client_onboarding_items').select('*').eq('client_id', clientId).order('position'),
      sb.from('client_offboarding').select('*').eq('client_id', clientId).maybeSingle(),
      sb.from('client_nonnegotiables').select('*').eq('client_id', clientId).order('position'),
      sb.from('client_pre_call_submissions').select('*').eq('client_id', clientId).order('submitted_at', { ascending:false }).limit(52),
      sb.from('client_habits').select('*').eq('client_id', clientId).order('position'),
      sb.from('client_goals').select('*').eq('client_id', clientId).order('created_at', { ascending:true }),
      sb.from('client_assignments').select('*').eq('client_id', clientId).order('created_at', { ascending:false }),
      sb.from('education_questions').select('*').order('position')
    ]);

    var d = results[0].data || {};
    var coreRows = results[1].data || [];
    var coreByKey = {};
    coreRows.forEach(function(c){ coreByKey[c.core_key] = c; });
    var cores = CORE_DEFS.map(function(def){
      var c = coreByKey[def.key];
      return { key:def.key, label:def.label, color:def.color, pct: c ? c.pct : 0, note: c ? c.note : '' };
    });

    return {
      clientId: clientId,
      route: d.route || '',
      weekNow: d.week_now || 0,
      weekTotal: d.week_total || 0,
      streakWeeks: d.streak_weeks || 0,
      adherencePct: d.adherence_pct || 0,
      flagStatus: d.flag_status || 'On track',
      flagColor: d.flag_color || '#77d770',
      nextSessionLabel: d.next_session_label || '',
      nextSessionAgenda: d.next_session_agenda || '',
      reminderDay: d.reminder_day || 'Tuesday',
      reminderChannel: d.reminder_channel || 'text',
      reminderOn: d.reminder_on !== false,
      adherenceHistory: d.adherence_history || [],
      preferredCardio: d.preferred_cardio || '',
      cardioGoal: d.cardio_goal || '',
      visionBoardUrl: d.vision_board_url || '',
      trainerizeUrl: d.trainerize_url || '',
      cores: cores,
      tasks: (results[2].data || []).map(function(t){ return { id:t.id, label:t.label, coreKey:t.core_key, color:t.color, done:t.done }; }),
      notes: (results[3].data || []).map(function(n){ return { id:n.id, label:n.label, meta:n.meta, body:n.body }; }),
      metrics: (results[4].data || []).map(function(m){ return { id:m.id, label:m.label, value:m.value }; }),
      resources: (results[5].data || []).map(function(r){ return { id:r.id, label:r.label, color:r.color }; }),
      wins: (results[6].data || []).map(function(w){ return { id:w.id, label:w.label, meta:w.meta, color:w.color }; }),
      messages: (results[7].data || []).map(function(m){ return { id:m.id, sender:m.sender, body:m.body, createdAt:m.created_at }; }),
      onboardingItems: (results[8].data || []).map(function(t){ return { id:t.id, label:t.label, done:t.done }; }),
      offboarding: results[9].data || {},
      nonNegotiables: (results[10].data || []).map(function(t){ return { id:t.id, label:t.label, status:t.status, claimedAt:t.claimed_at, archivedAt:t.archived_at }; }),
      preCallSubmissions: (results[11].data || []).map(mapPreCall),
      habits: (results[12].data || []).map(function(h){ return { id:h.id, label:h.label, done:h.done }; }),
      goals: (results[13].data || []).map(mapGoal),
      assignments: (results[14].data || []).map(mapAssignment),
      eduQuestions: (results[15].data || []).map(curMap)
    };
  }

  // Row -> portal-shape mappers, shared by the initial load and every
  // targeted re-fetch after a save.
  function mapGoal(g){
    return { id:g.id, title:g.title, description:g.description||'', coreKey:g.core_key||'', targetDate:g.target_date||'', status:normalizeGoalStatus(g.status), progress:g.progress||0, createdBy:g.created_by||'client' };
  }

  function mapAssignment(a){
    return {
      id: a.id, title: a.title, instructions: a.instructions || '', coreKey: a.core_key || '',
      dueDate: a.due_date || '', status: a.status || 'assigned', clientNote: a.client_note || '',
      coachFeedback: a.coach_feedback || '', files: a.files || [], submittedAt: a.submitted_at,
      reviewedAt: a.reviewed_at, createdAt: a.created_at
    };
  }



  // Pre-call rows keep their DB column names (PRECALL_FIELDS keys) so the
  // weekly form and the history view can read/write them directly.
  function mapPreCall(row){
    var s = { id: row.id, submittedAt: row.submitted_at, status: row.status || '', source: row.source || 'notion' };
    PRECALL_FIELDS.forEach(function(f){
      var v = row[f.key];
      s[f.key] = (f.type === 'multi' || f.type === 'files') ? (Array.isArray(v) ? v : []) : (v || '');
    });
    s.url_upload = row.url_upload || '';
    return s;
  }

  async function loadClientPortal(clientId, displayName){
    viewingClientId = clientId;
    portalData = null;
    ciEditing = false;
    ciDraft = null;
    if (hwOpenId) closeHwSheet();
    $('cpWelcome').textContent = 'Welcome to Your Race, ' + displayName + '.';
    $('cpRouteLine').textContent = 'Loading…';

    var data = await fetchPortalData(clientId);
    if (viewingClientId !== clientId) return; // superseded by a newer view

    portalData = data;
    $('cpRouteLine').textContent = (data.route || 'No route set yet') + ' · Week ' + data.weekNow + ' of ' + data.weekTotal;
    $('cpWeekLine2').textContent = 'Week ' + data.weekNow + ' of ' + data.weekTotal;

    renderClientPortal();
    renderViewToggle();
    renderVisionBand();
    calLoadForClient(clientId);
  }

  // ─── Coach: roster (loaded from every client's profile + dashboard row) ─
  async function loadRoster(){
    var { data: profs } = await sb.from('profiles').select('id, full_name, preferred_name, email, role');
    var clients = (profs || []).filter(function(p){ return p.role !== 'coach' && p.email !== COACH_EMAIL; });
    var ids = clients.map(function(p){ return p.id; });

    var dashRows = [], taskRows = [], nnRows = [], hwRows = [], ciRows = [];
    if (ids.length) {
      var results = await Promise.all([
        sb.from('client_dashboard').select('*').in('client_id', ids),
        sb.from('client_tasks').select('client_id, done').in('client_id', ids),
        sb.from('client_nonnegotiables').select('*').in('client_id', ids).eq('status','claimed').order('claimed_at'),
        sb.from('client_assignments').select('id, client_id, title, submitted_at').in('client_id', ids).eq('status','submitted').order('submitted_at'),
        sb.from('client_pre_call_submissions').select('client_id, submitted_at').in('client_id', ids).gte('submitted_at', startOfWeek(new Date()).toISOString())
      ]);
      dashRows = results[0].data || [];
      taskRows = results[1].data || [];
      nnRows = results[2].data || [];
      hwRows = results[3].data || [];
      ciRows = results[4].data || [];
    }

    var dashByClient = {};
    dashRows.forEach(function(d){ dashByClient[d.client_id] = d; });

    var taskCounts = {};
    taskRows.forEach(function(t){
      var c = taskCounts[t.client_id] || (taskCounts[t.client_id] = { open:0, total:0 });
      c.total++;
      if (!t.done) c.open++;
    });

    roster = clients.map(function(p){
      var d = dashByClient[p.id] || {};
      return {
        id: p.id,
        name: p.preferred_name || p.full_name || p.email,
        route: d.route || 'No route set',
        weekNow: d.week_now || 0,
        weekTotal: d.week_total || 0,
        adh: d.adherence_pct || 0,
        flag: d.flag_status || 'On track',
        color: d.flag_color || '#77d770',
        next: d.next_session_label || 'Not scheduled',
        reminderOn: d.reminder_on !== false,
        reminderDay: d.reminder_day || 'Tuesday',
        reminderChannel: d.reminder_channel || 'text',
        taskCounts: taskCounts[p.id] || { open:0, total:0 }
      };
    });

    flags = roster.filter(function(c){ return c.flag !== 'On track'; }).map(function(c){
      return { name: c.name, why: 'Adherence ' + c.adh + '% · flagged "' + c.flag + '"' };
    });

    remQueue = roster.filter(function(c){ return c.reminderOn; }).map(function(c){
      var tc = c.taskCounts;
      return { name: c.name, why: tc.open + ' of ' + tc.total + ' open · sends ' + c.reminderDay + ' by ' + c.reminderChannel, color: c.color };
    });

    var nameById = {};
    clients.forEach(function(p){ nameById[p.id] = p.preferred_name || p.full_name || p.email; });
    reviewQueue = nnRows.map(function(r){
      return { id: r.id, clientId: r.client_id, clientName: nameById[r.client_id] || 'Client', label: r.label };
    });

    hwReviewQueue = hwRows.map(function(r){
      return { clientId: r.client_id, clientName: nameById[r.client_id] || 'Client', title: r.title, submittedAt: r.submitted_at };
    });
    ciWeekByClient = {};
    ciRows.forEach(function(r){
      if (!ciWeekByClient[r.client_id] || r.submitted_at > ciWeekByClient[r.client_id]) ciWeekByClient[r.client_id] = r.submitted_at;
    });

    renderRoster(); renderFlags(); renderQueue(); renderNonNegQueue(); renderHwQueue(); renderCiQueue();
  }

  // ─── Coach: homework review + weekly check-in queues ───────────────────
  function renderHwQueue(){
    $('cpHwQueueSummary').textContent = hwReviewQueue.length ? (hwReviewQueue.length + ' submitted, waiting on you.') : 'Nothing to review right now.';
    $('cpHwQueueList').innerHTML = hwReviewQueue.map(function(r){
      var when = r.submittedAt ? ' · ' + shortDate(new Date(r.submittedAt)) : '';
      return '<div class="cp-flag-row cp-queue-click" role="button" tabindex="0" data-queue-client="'+esc(r.clientId)+'" data-queue-tab="homework">'
        + '<p class="cp-flag-name">'+esc(r.clientName)+'</p><p class="cp-flag-why">'+esc(r.title)+esc(when)+'</p></div>';
    }).join('');
  }

  function renderCiQueue(){
    var done = roster.filter(function(c){ return ciWeekByClient[c.id]; }).length;
    $('cpCiQueueSummary').textContent = roster.length ? (done + ' of ' + roster.length + ' submitted since Monday.') : '';
    $('cpCiQueueList').innerHTML = roster.map(function(c){
      var at = ciWeekByClient[c.id];
      return '<div class="cp-flag-row cp-queue-click" role="button" tabindex="0" data-queue-client="'+esc(c.id)+'" data-queue-tab="checkins">'
        + '<div class="cp-nn-row"><p class="cp-flag-name">'+esc(c.name)+'</p>'
        + (at ? statusPill('In · ' + shortDate(new Date(at)), '#3d9b37') : statusPill('Not yet', '#5b6b7a'))
        + '</div></div>';
    }).join('');
  }

  function onQueueActivate(e){
    var row = e.target.closest('[data-queue-client]'); if (!row) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    var cid = row.getAttribute('data-queue-client');
    var c = findRosterClient(cid);
    enterClientPortalView(cid, c ? c.name : '', row.getAttribute('data-queue-tab'));
  }
  ['cpHwQueueList','cpCiQueueList'].forEach(function(id){
    $(id).addEventListener('click', onQueueActivate);
    $(id).addEventListener('keydown', onQueueActivate);
  });

  // ─── Coach: open a client's portal to see what they see ───────────────
  function enterClientPortalView(clientId, name, tab){
    state.view = 'client';
    state.portalTab = tab || 'portal';
    $('cpBackToRoster').hidden = false;
    renderViewToggle();
    loadClientPortal(clientId, name);
  }

  function exitClientPortalView(){
    viewingClientId = null;
    portalData = null;
    state.view = 'coach';
    $('cpWelcome').textContent   = 'Welcome back, ' + firstNameOf(coachProfile, coachUser) + '.';
    $('cpRouteLine').textContent = 'Coach Dashboard';
    $('cpBackToRoster').hidden = true;
    if (hwOpenId) closeHwSheet();
    renderViewToggle();
    loadRoster();
  }

  $('cpBackToRoster').addEventListener('click', exitClientPortalView);

  // ─── First-time name capture ───────────────────────────────────────────
  $('cpNameSubmit').addEventListener('click', async function(){
    var first = $('cpFirstNameInput').value.trim();
    var last  = $('cpLastNameInput').value.trim();
    if (!first || !last) { showErr('cpNameError','Enter your first and last name.'); return; }

    setLoading($('cpNameSubmit'), true, 'Saving…');
    hideErr('cpNameError');

    var fullName = first + ' ' + last;
    var { error } = await sb
      .from('profiles')
      .upsert({ id: pendingUser.id, email: pendingUser.email, full_name: fullName }, { onConflict: 'id' });

    setLoading($('cpNameSubmit'), false, 'Continue');

    // Surface the real reason (usually a missing RLS policy on `profiles`,
    // see scripts/client_portal_profile.sql) instead of a generic message —
    // and don't depend on a SELECT-returning upsert, since a SELECT policy
    // gap alone shouldn't block a successful save.
    if (error) { showErr('cpNameError','Could not save your name: ' + error.message); return; }

    var user = pendingUser;
    pendingUser = null;
    renderDash(user, { full_name: fullName });
  });

  // ─── Preferred name / nickname (client-set, shown instead of first name) ─
  $('cpNicknameEdit').addEventListener('click', function(){
    $('cpNicknameInput').value = (ownProfile && ownProfile.preferred_name) || '';
    $('cpNicknameForm').hidden = false;
    $('cpNicknameInput').focus();
  });

  $('cpNicknameCancel').addEventListener('click', function(){
    $('cpNicknameForm').hidden = true;
  });

  $('cpNicknameInput').addEventListener('keydown', function(e){
    if (e.key === 'Enter') $('cpNicknameSave').click();
    if (e.key === 'Escape') $('cpNicknameForm').hidden = true;
  });

  $('cpNicknameSave').addEventListener('click', async function(){
    if (!currentUser || !ownProfile) return;
    var nickname = $('cpNicknameInput').value.trim();
    setLoading($('cpNicknameSave'), true, 'Saving…');
    var { error } = await sb.from('profiles').update({ preferred_name: nickname }).eq('id', currentUser.id);
    setLoading($('cpNicknameSave'), false, 'Save');
    if (error) { window.alert('Could not save your name: ' + error.message); return; }
    ownProfile.preferred_name = nickname;
    $('cpNicknameForm').hidden = true;
    if (viewingClientId === currentUser.id) {
      $('cpWelcome').textContent = 'Welcome to Your Race, ' + preferredNameOf(ownProfile, currentUser) + '.';
    }
  });

  // ─── Set / reset password (invite + forgot-password flows) ────────────
  $('cpSetPasswordSubmit').addEventListener('click', async function(){
    var pw1 = $('cpNewPasswordInput').value;
    var pw2 = $('cpConfirmPasswordInput').value;
    if (!pw1 || pw1.length < 8) { showErr('cpSetPasswordError','Password must be at least 8 characters.'); return; }
    if (pw1 !== pw2) { showErr('cpSetPasswordError','Passwords do not match.'); return; }

    setLoading($('cpSetPasswordSubmit'), true, 'Saving…');
    hideErr('cpSetPasswordError');

    var { data, error } = await sb.auth.updateUser({ password: pw1 });

    setLoading($('cpSetPasswordSubmit'), false, 'Set password');

    if (error) { showErr('cpSetPasswordError','Could not set password. Try again.'); return; }

    var user = (data && data.user) || pendingUser;

    await sb.from('profiles').upsert({ id: user.id, email: user.email, has_password: true }, { onConflict: 'id' });

    if (!pendingProfile) {
      var res = await sb.from('profiles').select('*').eq('id', user.id).single();
      pendingProfile = res.data;
    } else {
      pendingProfile.has_password = true;
    }

    var profile = pendingProfile;
    pendingProfile = null;
    continueAfterAuthSteps(user, profile);
  });

  // ─── Forgot password ────────────────────────────────────────────────────
  $('cpForgotPassword').addEventListener('click', async function(e){
    e.preventDefault();
    var email = $('cpEmailInput').value.trim();
    if (!email) { showErr('cpEmailError','Enter your email above first, then tap "Forgot password?" again.'); return; }

    await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
    $('cpForgotEmail').textContent = email;
    showStep('cpStepForgotSent');
  });

  $('cpBackFromForgot').addEventListener('click', function(){ showStep('cpStepEmail'); });

  // ─── Sign out ─────────────────────────────────────────────────────────
  $('cpSignOut').addEventListener('click', async function(){
    await sb.auth.signOut();
    location.reload();
  });

  // ─── Biometric unlock step ─────────────────────────────────────────────
  $('cpBiometricUnlock').addEventListener('click', async function(){
    setLoading($('cpBiometricUnlock'), true, 'Verifying…');
    hideErr('cpBiometricError');
    try {
      await authenticateBiometric();
      setLoading($('cpBiometricUnlock'), false, 'Unlock with Face ID / Touch ID');
      var user = pendingUser;
      pendingUser = null;
      showDash(user);
    } catch (e) {
      setLoading($('cpBiometricUnlock'), false, 'Unlock with Face ID / Touch ID');
      showErr('cpBiometricError','Could not verify. Try again or use email.');
    }
  });

  $('cpBiometricUseEmail').addEventListener('click', async function(){
    await sb.auth.signOut();
    location.reload();
  });

  // ─── Biometric opt-in banner (shown once after sign-in on this device) ─
  $('cpBiometricEnable').addEventListener('click', async function(){
    $('cpBiometricBanner').hidden = true;
    if (!currentUser) return;
    try { await registerBiometric(currentUser); } catch (e) { /* user cancelled or unsupported — nothing to do */ }
  });

  $('cpBiometricDecline').addEventListener('click', function(){
    $('cpBiometricBanner').hidden = true;
    if (currentUser && currentUser.email) localStorage.setItem(BIOMETRIC_DECLINED_KEY, currentUser.email);
  });

  // ─── Render: client portal (from portalData) ───────────────────────────
  function renderClientPortal(){
    if (!portalData) return;
    renderCoreList();
    renderTasks();
    renderNotesCard();
    renderChips();
    renderWins();
    renderSessionCard();
    renderReminder();
    renderCardioBox();
    renderOnboarding();
    renderNonNegotiables();
    renderArchive();
    renderOffboardingForm();
    renderTrainerize();
    renderGoalsTab();
    renderHomeworkTab();
    renderCheckinsTab();
    renderEducationTab();
  }

  // ─── Trainerize tab: per-client link, opened in a new tab ─────────────
  // Trainerize sends X-Frame-Options/CSP headers that block iframing, so
  // this links out instead of embedding.
  function renderTrainerize(){
    var url = portalData.trainerizeUrl || '';
    var openBtn = $('cpTrainerizeOpenBtn');
    var empty = $('cpTrainerizeEmpty');

    if (!url) {
      openBtn.hidden = true;
      empty.hidden = false;
      return;
    }

    openBtn.hidden = false;
    openBtn.href = url;
    empty.hidden = true;
  }

  var PORTAL_TABS = {
    portal:'cpClientView', homework:'cpHomeworkView', goals:'cpGoalsView',
    checkins:'cpCheckinsView', education:'cpEducationView', trainerize:'cpTrainerizeView'
  };

  function setPortalTab(tab){
    if (!PORTAL_TABS[tab]) tab = 'portal';
    state.portalTab = tab;
    $('cpPortalTabs').querySelectorAll('[data-portal-tab]').forEach(function(btn){
      btn.classList.toggle('is-active', btn.getAttribute('data-portal-tab') === tab);
    });
    Object.keys(PORTAL_TABS).forEach(function(k){ $(PORTAL_TABS[k]).hidden = k !== tab; });
    if (tab === 'portal') renderVisionBand(); else $('cpVisionBand').hidden = true;
  }

  function hideAllPortalTabs(){
    Object.keys(PORTAL_TABS).forEach(function(k){ $(PORTAL_TABS[k]).hidden = true; });
    $('cpVisionBand').hidden = true;
  }

  $('cpPortalTabs').addEventListener('click', function(e){
    var btn = e.target.closest('[data-portal-tab]'); if (!btn) return;
    setPortalTab(btn.getAttribute('data-portal-tab'));
  });

  // Summary cards on the Portal tab jump straight to their tab.
  document.addEventListener('click', function(e){
    var t = e.target.closest('[data-goto-tab]'); if (!t) return;
    setPortalTab(t.getAttribute('data-goto-tab'));
    window.scrollTo({ top: $('cpPortalTabs').getBoundingClientRect().top + window.scrollY - 90, behavior:'smooth' });
  });

  // Whether the signed-in user is looking at their own portal (vs the
  // coach browsing a client's).
  function isOwnPortal(){
    return !!(currentUser && viewingClientId && currentUser.id === viewingClientId);
  }

  function setBadge(id, n){
    var el = $(id);
    el.hidden = !n;
    el.textContent = n ? String(n) : '';
  }

  // ─── Goals tab ─────────────────────────────────────────────────────────
  function goalDateLabel(iso){
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
  }

  function buildGoalCard(g, idx){
    var color = coreColor(g.coreKey);
    var isAchieved = g.status === 'achieved';
    var pct = Math.max(0, Math.min(100, parseInt(g.progress, 10) || 0));
    var dateHtml = g.targetDate ? '<span class="cp-goal-date-chip">📅 ' + esc(goalDateLabel(g.targetDate)) + '</span>' : '';
    var statusSel = '<select class="cp-goal-status-select" data-goal-status="'+idx+'" aria-label="Status for '+esc(g.title)+'">'
      + GOAL_STATUSES.map(function(st){ return '<option value="'+st.key+'"'+(st.key===g.status?' selected':'')+'>'+esc(st.label)+'</option>'; }).join('')
      + '</select>';
    return '<div class="cp-goal-card'+(isAchieved?' is-achieved':'')+'" style="--goal-color:'+color+'">'
      +'<div style="position:absolute;top:0;left:0;right:0;height:3px;background:'+color+';border-radius:18px 18px 0 0;"></div>'
      +'<div class="cp-goal-card-head"><p class="cp-goal-card-title">'+esc(g.title)+'</p></div>'
      +(g.description?'<p class="cp-goal-card-desc">'+esc(g.description)+'</p>':'')
      +'<div class="cp-goal-progress"><div class="cp-goal-progress-top"><span>Progress</span><span>'+pct+'%</span></div>'
      +'<div class="cp-meter"><div class="cp-meter-fill" style="width:'+pct+'%;background:'+color+'"></div></div></div>'
      +'<div class="cp-goal-card-foot">'
        +'<div style="display:flex;gap:6px;flex-wrap:wrap;">'+coreChip(g.coreKey)+dateHtml+'</div>'
        +'<div class="cp-goal-card-actions">'
          +statusSel
          +'<button type="button" class="cp-goal-edit-btn" data-goal-edit="'+idx+'">Edit</button>'
          +'<button type="button" class="cp-goal-delete-btn" data-goal-del="'+idx+'" title="Delete goal" aria-label="Delete goal">✕</button>'
        +'</div>'
      +'</div>'
    +'</div>';
  }

  function renderGoalsTab(){
    if (!portalData) return;
    var goals = portalData.goals || [];
    var achieved = goals.filter(function(g){ return g.status === 'achieved'; });

    // Cards carry their index into portalData.goals so handlers can find them.
    var activeHtml = '', achievedHtml = '';
    goals.forEach(function(g, i){
      if (g.status === 'achieved') achievedHtml += buildGoalCard(g, i);
      else activeHtml += buildGoalCard(g, i);
    });

    $('cpGoalsActiveGrid').innerHTML = activeHtml || '<div class="cp-goal-empty">No active goals yet — add one to get started.</div>';
    $('cpGoalsAchievedLabel').hidden = achieved.length === 0;
    $('cpGoalsAchievedGrid').innerHTML = achievedHtml;
  }

  // Build core picker for goal form
  function buildGoalCoreGrid(){
    var h = '';
    CORE_DEFS.forEach(function(c){
      h += '<input type="radio" name="cpGoalCore" id="cpGoalCore_'+c.key+'" value="'+c.key+'" class="cp-goal-core-opt">';
      h += '<label for="cpGoalCore_'+c.key+'" style="color:'+c.color+'"><span class="cp-dot" style="background:'+c.color+'"></span>'+c.label+'</label>';
    });
    $('cpGoalCoreGrid').innerHTML = h;
  }

  $('cpGoalStatus').innerHTML = GOAL_STATUSES.map(function(st){ return '<option value="'+st.key+'">'+esc(st.label)+'</option>'; }).join('');
  $('cpGoalProgress').addEventListener('input', function(){ $('cpGoalProgressVal').textContent = this.value + '%'; });

  var goalEditingId = null;

  function openGoalForm(goal){
    goalEditingId = goal ? goal.id : null;
    buildGoalCoreGrid();
    $('cpGoalFormHeading').textContent = goal ? 'Edit goal' : 'Set a SMART Goal';
    $('cpGoalTitle').value = goal ? goal.title : '';
    $('cpGoalDesc').value = goal ? goal.description : '';
    $('cpGoalDate').value = goal ? goal.targetDate : '';
    $('cpGoalStatus').value = goal ? goal.status : 'not_started';
    $('cpGoalProgress').value = goal ? (goal.progress || 0) : 0;
    $('cpGoalProgressVal').textContent = $('cpGoalProgress').value + '%';
    var radios = $('cpGoalCoreGrid').querySelectorAll('input[type=radio]');
    radios.forEach(function(r){ r.checked = !!goal && r.value === goal.coreKey; });
    $('cpGoalFormOverlay').hidden = false;
    document.body.style.overflow = 'hidden';
    $('cpGoalTitle').focus();
  }

  function closeGoalForm(){
    $('cpGoalFormOverlay').hidden = true;
    document.body.style.overflow = '';
  }

  $('cpGoalAddBtn').addEventListener('click', function(){ openGoalForm(null); });
  $('cpGoalFormCancel').addEventListener('click', closeGoalForm);
  $('cpGoalFormBackdrop').addEventListener('click', closeGoalForm);

  $('cpGoalFormSave').addEventListener('click', async function(){
    var title = $('cpGoalTitle').value.trim();
    if (!title) { $('cpGoalTitle').focus(); return; }
    if (!viewingClientId) return;
    var clientId = viewingClientId;

    var coreEl = $('cpGoalCoreGrid').querySelector('input[type=radio]:checked');
    var status = $('cpGoalStatus').value;
    var progress = parseInt($('cpGoalProgress').value, 10) || 0;
    if (status === 'achieved') progress = 100;
    var fields = {
      title: title,
      description: $('cpGoalDesc').value.trim(),
      core_key: coreEl ? coreEl.value : '',
      target_date: $('cpGoalDate').value || null,
      status: status,
      progress: progress
    };

    setLoading($('cpGoalFormSave'), true, 'Saving…');
    var res = goalEditingId
      ? await sb.from('client_goals').update(fields).eq('id', goalEditingId).select().single()
      : await sb.from('client_goals').insert(Object.assign({ client_id: clientId, created_by: isCoachUser ? 'coach' : 'client' }, fields)).select().single();
    setLoading($('cpGoalFormSave'), false, 'Save goal');
    if (res.error) { alert('Could not save goal: ' + res.error.message); return; }
    if (viewingClientId !== clientId) return;

    var saved = mapGoal(res.data);
    var exists = portalData.goals.some(function(g){ return g.id === saved.id; });
    portalData.goals = exists
      ? portalData.goals.map(function(g){ return g.id === saved.id ? saved : g; })
      : portalData.goals.concat([saved]);
    renderGoalsTab();
    closeGoalForm();
  });

  async function goalsGridClickHandler(e){
    if (!portalData) return;
    var editBtn = e.target.closest('[data-goal-edit]');
    if (editBtn) { openGoalForm(portalData.goals[parseInt(editBtn.getAttribute('data-goal-edit'), 10)]); return; }

    var delBtn = e.target.closest('.cp-goal-delete-btn'); if (!delBtn) return;
    var delGoal = portalData.goals[parseInt(delBtn.getAttribute('data-goal-del'), 10)]; if (!delGoal) return;
    if (!confirm('Delete "' + delGoal.title + '"? This cannot be undone.')) return;
    var { error } = await sb.from('client_goals').delete().eq('id', delGoal.id);
    if (error) { alert('Could not delete goal: ' + error.message); return; }
    portalData.goals = portalData.goals.filter(function(g){ return g.id !== delGoal.id; });
    renderGoalsTab();
  }

  async function goalsGridChangeHandler(e){
    var sel = e.target.closest('[data-goal-status]'); if (!sel || !portalData) return;
    var goal = portalData.goals[parseInt(sel.getAttribute('data-goal-status'), 10)]; if (!goal) return;
    var prev = { status: goal.status, progress: goal.progress };
    var patch = { status: sel.value };
    if (sel.value === 'achieved' && goal.progress < 100) patch.progress = 100;
    goal.status = patch.status;
    if ('progress' in patch) goal.progress = patch.progress;
    renderGoalsTab();
    var { error } = await sb.from('client_goals').update(patch).eq('id', goal.id);
    if (error) {
      goal.status = prev.status; goal.progress = prev.progress;
      renderGoalsTab();
      alert('Could not update goal: ' + error.message);
    }
  }

  ['cpGoalsActiveGrid','cpGoalsAchievedGrid'].forEach(function(id){
    $(id).addEventListener('click', goalsGridClickHandler);
    $(id).addEventListener('change', goalsGridChangeHandler);
  });

  // ─── Preferred cardio + goal (set by the coach, seen by the client) ───
  function renderCardioBox(){
    var box = $('cpCardioBox');
    if (!portalData.preferredCardio && !portalData.cardioGoal) { box.hidden = true; return; }
    box.hidden = false;
    $('cpCardioType').textContent = portalData.preferredCardio ? cardioLabel(portalData.preferredCardio) : 'Not set yet';
    $('cpCardioGoal').textContent = portalData.cardioGoal || 'No goal set yet';
  }

  // ─── Onboarding checklist (coach-managed, either side can check items) ─
  function renderOnboarding(){
    var items = portalData.onboardingItems || [];
    $('cpOnboardingCard').hidden = items.length === 0;
    var h = '';
    items.forEach(function(t,i){
      h += '<div class="cp-task-row"><button type="button" class="cp-task-check'+(t.done?' is-done':'')+'" data-idx="'+i+'">'+(t.done?'✓':'')+'</button><span class="cp-task-label'+(t.done?' is-done':'')+'">'+esc(t.label)+'</span></div>';
    });
    $('cpOnboardingList').innerHTML = h;
    var done = items.filter(function(t){ return t.done; }).length;
    $('cpOnboardingCount').textContent = done + ' of ' + items.length + ' done';
  }

  $('cpOnboardingList').addEventListener('click', function(e){
    var btn = e.target.closest('.cp-task-check'); if (!btn || !portalData) return;
    var idx = parseInt(btn.getAttribute('data-idx'),10);
    var item = portalData.onboardingItems[idx]; if (!item) return;
    item.done = !item.done;
    renderOnboarding();
    sb.from('client_onboarding_items').update({ done: item.done }).eq('id', item.id);
  });

  // ─── Non-negotiables (coach sets, client claims, coach does final review) ─
  // Status lifecycle: active -> claimed (client says it's done, pending
  // review) -> archived (coach confirmed). A rejected claim goes back to
  // active so the client can re-claim it.
  function activeNonNegotiables(){
    return (portalData.nonNegotiables || []).filter(function(t){ return t.status !== 'archived'; });
  }

  function renderNonNegotiables(){
    var items = activeNonNegotiables();
    $('cpNonNegCard').hidden = items.length === 0;
    var h = '';
    items.forEach(function(t,i){
      var claimed = t.status === 'claimed';
      h += '<div class="cp-task-row"><button type="button" class="cp-task-check'+(claimed?' is-done':'')+'" data-idx="'+i+'">'+(claimed?'✓':'')+'</button><span class="cp-task-label'+(claimed?' is-done':'')+'">'+esc(t.label)+'</span><span class="cp-task-meta">'+(claimed?'Pending review':'')+'</span></div>';
    });
    $('cpNonNegList').innerHTML = h;
    var claimedCount = items.filter(function(t){ return t.status === 'claimed'; }).length;
    $('cpNonNegCount').textContent = claimedCount ? (claimedCount + ' awaiting review') : (items.length + (items.length===1?' non-negotiable':' non-negotiables'));
  }

  $('cpNonNegList').addEventListener('click', async function(e){
    var btn = e.target.closest('.cp-task-check'); if (!btn || !portalData) return;
    var items = activeNonNegotiables();
    var idx = parseInt(btn.getAttribute('data-idx'),10);
    var item = items[idx]; if (!item) return;
    var newStatus = item.status === 'claimed' ? 'active' : 'claimed';
    item.status = newStatus;
    item.claimedAt = newStatus === 'claimed' ? new Date().toISOString() : null;
    renderNonNegotiables();
    await sb.from('client_nonnegotiables').update({ status: newStatus, claimed_at: item.claimedAt }).eq('id', item.id);
  });

  // ─── Archive: non-negotiables the coach has confirmed ──────────────────
  function renderArchive(){
    var items = (portalData.nonNegotiables || []).filter(function(t){ return t.status === 'archived'; });
    var h = '';
    items.forEach(function(t){
      var when = t.archivedAt ? new Date(t.archivedAt).toLocaleDateString() : '';
      h += '<div class="cp-note-row"><span class="cp-note-label">'+esc(t.label)+'</span><span class="cp-note-meta">'+esc(when)+'</span></div>';
    });
    $('cpArchiveList').innerHTML = h || '<p class="cp-caption" style="margin:0;">Nothing archived yet.</p>';
  }

  // Each core links to that client's page for the core, e.g. /client-portal/body/?client=<id>.
  function coreHref(key, clientId){
    return './' + key + '/?client=' + encodeURIComponent(clientId);
  }

  function renderCoreList(){
    var hasHabits = portalData.habits.length > 0;
    $('cpCoreKicker').textContent = hasHabits ? 'Habits' : 'The Six Cores';
    $('cpCoreList').hidden = hasHabits;
    $('cpHabitList').hidden = !hasHabits;
    if (hasHabits) { renderHabits(); return; }
    var h=''; portalData.cores.forEach(function(c){ h+='<a class="cp-core-row cp-core-link" href="'+coreHref(c.key, portalData.clientId)+'"><span class="cp-dot" style="background:'+c.color+'"></span><span class="cp-core-label">'+esc(c.label)+'</span><span class="cp-core-arrow" aria-hidden="true">→</span></a>'; });
    $('cpCoreList').innerHTML=h;
  }

  function renderHabits(){
    var h='';
    portalData.habits.forEach(function(hb,i){
      h+='<div class="cp-task-row"><button type="button" class="cp-task-check'+(hb.done?' is-done':'')+'" data-idx="'+i+'">'+(hb.done?'✓':'')+'</button><span class="cp-task-label'+(hb.done?' is-done':'')+'">'+esc(hb.label)+'</span></div>';
    });
    $('cpHabitList').innerHTML = h;
  }

  $('cpHabitList').addEventListener('click', function(e){
    var btn = e.target.closest('.cp-task-check'); if (!btn || !portalData) return;
    e.stopPropagation();
    var idx = parseInt(btn.getAttribute('data-idx'),10);
    var habit = portalData.habits[idx]; if (!habit) return;
    habit.done = !habit.done;
    renderHabits();
    sb.from('client_habits').update({ done: habit.done }).eq('id', habit.id);
  });

  function renderTasks(){
    var h='';
    portalData.tasks.forEach(function(t,i){
      var color = t.color || coreColor(t.coreKey);
      h+='<div class="cp-task-row"><button type="button" class="cp-task-check'+(t.done?' is-done':'')+'" data-idx="'+i+'">'+(t.done?'✓':'')+'</button><span class="cp-dot" style="background:'+color+'"></span><span class="cp-task-label'+(t.done?' is-done':'')+'">'+esc(t.label)+'</span><span class="cp-task-meta">'+esc(t.coreKey||'')+'</span></div>';
    });
    $('cpTaskList').innerHTML = h || '<p class="cp-caption" style="margin:0;">No assignments yet.</p>';
    $('cpTaskCount').textContent = portalData.tasks.length + (portalData.tasks.length===1?' assignment':' assignments');
  }

  function renderNotesCard(){
    var recent = portalData.notes.slice(0,4);
    var h=''; recent.forEach(function(n){ h+='<div class="cp-note-row"><span class="cp-note-label">'+esc(n.label)+'</span><span class="cp-note-meta">'+esc(n.meta)+'</span></div>'; });
    $('cpNoteList').innerHTML = h || '<p class="cp-caption" style="margin:0;">No session notes yet.</p>';
  }

  // ─── Shared helpers: dates, links, uploads, modals ────────────────────
  function parseLocalDate(iso){ return iso ? new Date(iso + 'T00:00:00') : null; }
  function shortDate(d){ return d.toLocaleDateString(undefined, { month:'short', day:'numeric' }); }
  function longDate(d){ return d.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric', year:'numeric' }); }
  function todayStart(){ var t = new Date(); t.setHours(0,0,0,0); return t; }

  // Weeks run Monday-Sunday; a check-in counts for the week it was sent in.
  function startOfWeek(d){
    var x = new Date(d); x.setHours(0,0,0,0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }

  function fmtBytes(n){
    if (!n) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024*1024) return Math.round(n/1024) + ' KB';
    return (n/1024/1024).toFixed(1) + ' MB';
  }

  // Escapes, then turns bare http(s) URLs into links.
  function linkify(text){
    return esc(text).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  }

  function coreChip(key){
    if (!key) return '';
    return '<span class="cp-goal-chip"><span class="cp-dot" style="background:'+coreColor(key)+'"></span>'+esc(key.charAt(0).toUpperCase()+key.slice(1))+'</span>';
  }

  function statusPill(label, color){
    return '<span class="cp-status-pill" style="--pill:'+color+'">'+esc(label)+'</span>';
  }

  function setNote(id, msg, isError){
    var el = $(id); if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('is-error', !!isError);
  }

  function safeFileName(name){
    return (String(name || 'file').replace(/[^\w.\-]+/g, '_').slice(-100)) || 'file';
  }

  async function uploadClientFile(clientId, folder, file){
    if (file.size > MAX_UPLOAD_BYTES) throw new Error('"' + file.name + '" is over 25MB.');
    var path = clientId + '/' + folder + '/' + Date.now() + '-' + safeFileName(file.name);
    var { error } = await sb.storage.from(UPLOAD_BUCKET).upload(path, file, { contentType: file.type || undefined });
    if (error) throw new Error('Upload failed for "' + file.name + '": ' + error.message);
    return { name: file.name, path: path, size: file.size, uploaded_at: new Date().toISOString() };
  }

  function removeStoredFiles(files){
    var paths = (files || []).map(function(f){ return f.path; }).filter(Boolean);
    if (paths.length) sb.storage.from(UPLOAD_BUCKET).remove(paths);
  }

  // Portal uploads live in a private bucket, so they open through a
  // short-lived signed URL. Notion-synced files already carry a url. The
  // tab is opened synchronously so popup blockers allow it.
  function openStoredFile(f){
    if (f.url) { window.open(f.url, '_blank', 'noopener'); return; }
    if (!f.path) return;
    var w = window.open('', '_blank');
    if (w) w.opener = null;
    sb.storage.from(UPLOAD_BUCKET).createSignedUrl(f.path, 3600).then(function(res){
      if (res.error || !res.data) {
        if (w) w.close();
        alert('Could not open file: ' + (res.error ? res.error.message : 'unknown error'));
        return;
      }
      if (w) w.location.href = res.data.signedUrl; else window.location.href = res.data.signedUrl;
    });
  }

  function fileRowsHtml(files, ctx, canRemove){
    return (files || []).map(function(f, i){
      return '<div class="cp-file-row"><span aria-hidden="true">📎</span>'
        + '<button type="button" class="cp-file-open" data-file-ctx="'+esc(ctx)+'" data-file-idx="'+i+'">'+esc(f.name || 'File')+'</button>'
        + (f.size ? '<span class="cp-file-size">'+fmtBytes(f.size)+'</span>' : '')
        + (canRemove ? '<button type="button" class="cp-file-remove" data-file-remove-ctx="'+esc(ctx)+'" data-file-idx="'+i+'" aria-label="Remove '+esc(f.name || 'file')+'">×</button>' : '')
        + '</div>';
    }).join('');
  }

  // ctx: "hw" (open assignment), "ci:<submissionId>:<field>" (check-in
  // history), "ciform:<field>" (files already on a check-in being edited).
  function filesForCtx(ctx){
    var parts = String(ctx).split(':');
    if (parts[0] === 'hw') { var a = currentHw(); return a ? a.files : []; }
    if (parts[0] === 'ci') { var sub = findPreCall(parts[1]); return sub ? (sub[parts[2]] || []) : []; }
    if (parts[0] === 'ciform') { return ciDraft ? (ciDraft.existing[parts[1]] || []) : []; }
    return [];
  }

  document.addEventListener('click', function(e){
    var btn = e.target.closest('.cp-file-open'); if (!btn) return;
    var f = filesForCtx(btn.getAttribute('data-file-ctx'))[parseInt(btn.getAttribute('data-file-idx'), 10)];
    if (f) openStoredFile(f);
  });

  function openModal(id){ $(id).hidden = false; document.body.style.overflow = 'hidden'; }
  function closeModal(id){ $(id).hidden = true; document.body.style.overflow = ''; }

  document.addEventListener('click', function(e){
    var t = e.target.closest('[data-close-modal]'); if (!t) return;
    closeModal(t.getAttribute('data-close-modal'));
  });

  // Client ids an "assign to every client" action should reach.
  function rosterClientIds(){
    var ids = roster.map(function(r){ return r.id; });
    if (viewingClientId && ids.indexOf(viewingClientId) === -1) ids.push(viewingClientId);
    return ids;
  }

  // ─── Homework tab ──────────────────────────────────────────────────────
  var hwOpenId = null;       // assignment shown in the detail sheet
  var hwEditingId = null;    // assignment being edited in the coach form

  function hwStatusDef(key){
    return HW_STATUSES.filter(function(s){ return s.key === key; })[0] || HW_STATUSES[0];
  }

  function isHwOpen(a){ return a.status === 'assigned' || a.status === 'in_progress' || a.status === 'needs_revision'; }

  function sortByDue(a, b){
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate < b.dueDate ? -1 : (a.dueDate > b.dueDate ? 1 : 0);
  }

  function dueChip(a){
    if (!a.dueDate) return '';
    var d = parseLocalDate(a.dueDate);
    var overdue = isHwOpen(a) && d < todayStart();
    return '<span class="cp-due-chip'+(overdue?' is-overdue':'')+'">'+(overdue ? 'Overdue · ' : 'Due ')+esc(shortDate(d))+'</span>';
  }

  function hwCardHtml(a){
    var def = hwStatusDef(a.status);
    var foot = coreChip(a.coreKey);
    if (a.files.length) foot += '<span class="cp-due-chip">📎 '+a.files.length+'</span>';
    if (a.coachFeedback) foot += '<span class="cp-due-chip">💬 Feedback</span>';
    return '<div class="cp-hw-card" role="button" tabindex="0" data-hw-id="'+esc(a.id)+'">'
      + '<div class="cp-hw-card-top">'+statusPill(def.label, def.color)+dueChip(a)+'</div>'
      + '<p class="cp-hw-card-title">'+esc(a.title)+'</p>'
      + (a.instructions ? '<p class="cp-hw-card-snippet">'+esc(a.instructions)+'</p>' : '')
      + (foot ? '<div class="cp-hw-card-foot">'+foot+'</div>' : '')
      + '</div>';
  }

  function renderHomeworkTab(){
    if (!portalData) return;
    var list = portalData.assignments || [];
    $('cpHwAddBtn').hidden = !isCoachUser;

    var open = list.filter(isHwOpen).sort(sortByDue);
    var submitted = list.filter(function(a){ return a.status === 'submitted'; }).sort(sortByDue);
    var complete = list.filter(function(a){ return a.status === 'complete'; });

    $('cpHwSummary').textContent = list.length
      ? open.length + ' open · ' + submitted.length + ' submitted · ' + complete.length + ' complete'
      : '';
    setBadge('cpTabBadgeHomework', isCoachUser ? submitted.length : open.length);

    var groups = [
      { label: isCoachUser ? 'Client is working on' : 'To do', items: open },
      { label: isCoachUser ? 'Waiting on your review' : 'Submitted · waiting on your coach', items: submitted },
      { label: 'Complete', items: complete }
    ];
    var h = '';
    if (!list.length) {
      h = '<div class="cp-goal-empty">' + (isCoachUser ? 'No assignments yet — create one with “New assignment”.' : 'No homework yet. Your coach will add assignments here.') + '</div>';
    }
    groups.forEach(function(g){
      if (!g.items.length) return;
      h += '<p class="cp-goals-section-label">'+esc(g.label)+'</p><div class="cp-hw-grid">' + g.items.map(hwCardHtml).join('') + '</div>';
    });
    $('cpHwGroups').innerHTML = h;
    renderHomeworkCard();
  }

  function renderHomeworkCard(){
    var list = portalData.assignments || [];
    var open = list.filter(isHwOpen).sort(sortByDue);
    var submitted = list.filter(function(a){ return a.status === 'submitted'; }).length;
    $('cpHwCardTitle').textContent = open.length
      ? open.length + ' open assignment' + (open.length === 1 ? '' : 's')
      : (list.length ? 'All caught up' : 'Nothing assigned yet');
    $('cpHwCardMeta').textContent = submitted ? submitted + ' awaiting review' : '';
    var h = '';
    open.slice(0, 3).forEach(function(a){
      var when = a.dueDate ? 'Due ' + shortDate(parseLocalDate(a.dueDate)) : hwStatusDef(a.status).label;
      h += '<div class="cp-note-row"><span class="cp-note-label">'+esc(a.title)+'</span><span class="cp-note-meta">'+esc(when)+'</span></div>';
    });
    $('cpHwCardList').innerHTML = h;
  }

  function onHwCardActivate(e){
    var card = e.target.closest('[data-hw-id]'); if (!card) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    openHwSheet(card.getAttribute('data-hw-id'));
  }
  $('cpHwGroups').addEventListener('click', onHwCardActivate);
  $('cpHwGroups').addEventListener('keydown', onHwCardActivate);

  function currentHw(){
    if (!portalData || !hwOpenId) return null;
    return (portalData.assignments || []).filter(function(a){ return a.id === hwOpenId; })[0] || null;
  }

  function openHwSheet(id){
    hwOpenId = id;
    renderHwSheet();
    $('cpHwSheetOverlay').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeHwSheet(){
    hwOpenId = null;
    $('cpHwSheetOverlay').hidden = true;
    document.body.style.overflow = '';
  }

  function renderHwSheet(){
    var a = currentHw();
    if (!a) { closeHwSheet(); return; }
    var own = isOwnPortal();
    var canUpload = own || isCoachUser;
    var def = hwStatusDef(a.status);

    // Keep anything typed but not yet saved across re-renders (uploads, status saves).
    var prevNote = $('cpHwNote') && $('cpHwSheet').getAttribute('data-for') === a.id ? $('cpHwNote').value : null;
    var prevFeedback = $('cpHwFeedback') && $('cpHwSheet').getAttribute('data-for') === a.id ? $('cpHwFeedback').value : null;

    var h = '<div class="cp-sheet-head"><div><p class="cp-kicker">Homework</p><h2 class="cp-sheet-title" id="cpHwSheetTitle">'+esc(a.title)+'</h2></div>'
      + '<button type="button" class="cp-sheet-close" data-close-hw-sheet aria-label="Close">×</button></div>';
    h += '<div class="cp-hw-meta">'+statusPill(def.label, def.color)+dueChip(a)+coreChip(a.coreKey)
      + (a.submittedAt ? '<span class="cp-due-chip">Submitted '+esc(shortDate(new Date(a.submittedAt)))+'</span>' : '')
      + '</div>';

    h += '<div class="cp-hw-section"><h4>Instructions</h4><div class="cp-hw-instructions">'
      + (a.instructions ? linkify(a.instructions) : '<span style="color:rgba(7,31,53,.45)">No written instructions.</span>')
      + '</div></div>';

    var statusOpts = HW_STATUSES.filter(function(s){
      return isCoachUser || HW_CLIENT_STATUSES.indexOf(s.key) !== -1 || s.key === a.status;
    });
    var lockStatus = !isCoachUser && a.status === 'complete';
    h += '<div class="cp-hw-section"><h4><label for="cpHwStatusSel">Status</label></h4><select class="cp-select" id="cpHwStatusSel"'+(lockStatus?' disabled':'')+'>'
      + statusOpts.map(function(s){ return '<option value="'+s.key+'"'+(s.key===a.status?' selected':'')+'>'+esc(s.label)+'</option>'; }).join('')
      + '</select></div>';

    h += '<div class="cp-hw-section"><h4>'+(own ? 'Your work' : 'Client’s work')+'</h4>';
    if (own) {
      h += '<textarea class="cp-textarea" id="cpHwNote" aria-label="Your response" placeholder="Write your response, reflections, or notes for your coach…">'+esc(prevNote !== null ? prevNote : a.clientNote)+'</textarea>';
    } else {
      h += a.clientNote ? '<div class="cp-hw-instructions" style="font-size:15px;">'+linkify(a.clientNote)+'</div>' : '<p class="cp-caption" style="margin:0;">Nothing written yet.</p>';
    }
    h += '<div class="cp-file-list">'+fileRowsHtml(a.files, 'hw', canUpload)+'</div>';
    if (canUpload) h += '<div class="cp-btn-row" style="margin-top:10px;"><button type="button" class="cp-btn-sm" data-hw-action="upload">+ Upload files</button><span class="cp-caption" style="margin:0;">Up to 25MB each</span></div>';
    h += '</div>';

    h += '<div class="cp-hw-section"><h4>Coach feedback</h4>';
    if (isCoachUser) {
      h += '<textarea class="cp-textarea" id="cpHwFeedback" aria-label="Coach feedback" placeholder="What worked, what to tighten up…">'+esc(prevFeedback !== null ? prevFeedback : a.coachFeedback)+'</textarea>';
    } else {
      h += a.coachFeedback ? '<div class="cp-hw-feedback">'+linkify(a.coachFeedback)+'</div>' : '<p class="cp-caption" style="margin:0;">No feedback yet.</p>';
    }
    h += '</div>';

    h += '<div class="cp-btn-row" style="margin-top:28px;">';
    if (own) {
      h += '<button type="button" class="cp-btn-sm" data-hw-action="save">Save</button>';
      if (isHwOpen(a)) h += '<button type="button" class="cp-btn-sm cp-btn-sm--primary" data-hw-action="submit">Submit for review</button>';
      if (a.status === 'submitted') h += '<button type="button" class="cp-btn-sm" data-hw-action="withdraw">Withdraw submission</button>';
    }
    if (isCoachUser) {
      h += '<button type="button" class="cp-btn-sm" data-hw-action="save">Save</button>'
        + '<button type="button" class="cp-btn-sm cp-btn-sm--primary" data-hw-action="complete">Mark complete</button>'
        + '<button type="button" class="cp-btn-sm" data-hw-action="revise">Request revision</button>'
        + '<button type="button" class="cp-btn-sm" data-hw-action="edit">Edit details</button>'
        + '<button type="button" class="cp-btn-sm cp-btn-sm--danger" data-hw-action="delete">Delete</button>';
    }
    h += '<span class="cp-save-note" id="cpHwSaveNote"></span></div>';

    $('cpHwSheet').innerHTML = h;
    $('cpHwSheet').setAttribute('data-for', a.id);
  }

  function hwFormPatch(){
    var patch = {};
    var sel = $('cpHwStatusSel');
    if (sel && !sel.disabled) patch.status = sel.value;
    if ($('cpHwNote')) patch.client_note = $('cpHwNote').value.trim();
    if ($('cpHwFeedback')) patch.coach_feedback = $('cpHwFeedback').value.trim();
    return patch;
  }

  async function saveHw(a, patch){
    var clientId = viewingClientId;
    var row = Object.assign({}, patch);
    if (row.status && row.status !== a.status) {
      if (row.status === 'submitted') row.submitted_at = new Date().toISOString();
      if (row.status === 'complete' || row.status === 'needs_revision') row.reviewed_at = new Date().toISOString();
    }
    setNote('cpHwSaveNote', 'Saving…');
    var { data, error } = await sb.from('client_assignments').update(row).eq('id', a.id).select().single();
    if (error) { setNote('cpHwSaveNote', 'Could not save: ' + error.message, true); return false; }
    if (viewingClientId !== clientId) return false;
    var updated = mapAssignment(data);
    portalData.assignments = portalData.assignments.map(function(x){ return x.id === updated.id ? updated : x; });
    // Saved values are now the source of truth, so drop the draft carry-over.
    $('cpHwSheet').removeAttribute('data-for');
    renderHomeworkTab();
    if (hwOpenId === updated.id) renderHwSheet();
    setNote('cpHwSaveNote', 'Saved');
    return true;
  }

  $('cpHwSheetOverlay').addEventListener('click', async function(e){
    if (e.target.closest('[data-close-hw-sheet]')) { closeHwSheet(); return; }
    var a = currentHw(); if (!a) return;

    var rm = e.target.closest('[data-file-remove-ctx="hw"]');
    if (rm) {
      var f = a.files[parseInt(rm.getAttribute('data-file-idx'), 10)]; if (!f) return;
      if (!confirm('Remove "' + f.name + '"?')) return;
      var ok = await saveHw(a, { files: a.files.filter(function(x){ return x !== f; }) });
      if (ok) removeStoredFiles([f]);
      return;
    }

    var btn = e.target.closest('[data-hw-action]'); if (!btn) return;
    var action = btn.getAttribute('data-hw-action');
    if (action === 'upload') { $('cpHwFileInput').click(); return; }
    if (action === 'edit') { openHwForm(a); return; }
    if (action === 'delete') {
      if (!confirm('Delete "' + a.title + '"? Uploaded files are removed too.')) return;
      var { error } = await sb.from('client_assignments').delete().eq('id', a.id);
      if (error) { setNote('cpHwSaveNote', 'Could not delete: ' + error.message, true); return; }
      removeStoredFiles(a.files);
      portalData.assignments = portalData.assignments.filter(function(x){ return x.id !== a.id; });
      closeHwSheet();
      renderHomeworkTab();
      return;
    }
    var patch = hwFormPatch();
    if (action === 'submit') patch.status = 'submitted';
    if (action === 'withdraw') patch.status = 'in_progress';
    if (action === 'complete') patch.status = 'complete';
    if (action === 'revise') patch.status = 'needs_revision';
    btn.disabled = true;
    await saveHw(a, patch);
    btn.disabled = false;
  });

  $('cpHwFileInput').addEventListener('change', async function(){
    var files = Array.prototype.slice.call(this.files || []);
    this.value = '';
    var a = currentHw();
    if (!a || !files.length || !viewingClientId) return;
    var clientId = viewingClientId;
    var uploaded = [], failure = null;
    setNote('cpHwSaveNote', 'Uploading ' + files.length + ' file' + (files.length === 1 ? '' : 's') + '…');
    for (var i = 0; i < files.length; i++) {
      try { uploaded.push(await uploadClientFile(clientId, 'homework/' + a.id, files[i])); }
      catch (err) { failure = err; }
    }
    if (uploaded.length) {
      // Save any typed-but-unsaved note/feedback along with the files.
      var patch = hwFormPatch();
      delete patch.status;
      patch.files = a.files.concat(uploaded);
      if (isOwnPortal() && a.status === 'assigned') patch.status = 'in_progress';
      if (!(await saveHw(a, patch))) removeStoredFiles(uploaded);
    }
    if (failure) setNote('cpHwSaveNote', failure.message, true);
  });

  // Coach: create / edit an assignment.
  (function(){
    var h = '<option value="">— none —</option>';
    CORE_DEFS.forEach(function(c){ h += '<option value="'+c.key+'">'+esc(c.label)+'</option>'; });
    $('cpHwCore').innerHTML = h;
  })();

  function openHwForm(a){
    hwEditingId = a ? a.id : null;
    $('cpHwFormHeading').textContent = a ? 'Edit assignment' : 'New assignment';
    $('cpHwTitle').value = a ? a.title : '';
    $('cpHwInstructions').value = a ? a.instructions : '';
    $('cpHwCore').value = a ? a.coreKey : '';
    $('cpHwDue').value = a ? a.dueDate : '';
    $('cpHwAllClients').checked = false;
    $('cpHwAllWrap').hidden = !!a;
    openModal('cpHwFormOverlay');
    $('cpHwTitle').focus();
  }

  $('cpHwAddBtn').addEventListener('click', function(){ openHwForm(null); });

  $('cpHwFormSave').addEventListener('click', async function(){
    var title = $('cpHwTitle').value.trim();
    if (!title) { $('cpHwTitle').focus(); return; }
    if (!viewingClientId || !isCoachUser) return;
    var clientId = viewingClientId;
    var fields = {
      title: title,
      instructions: $('cpHwInstructions').value.trim(),
      core_key: $('cpHwCore').value,
      due_date: $('cpHwDue').value || null
    };

    setLoading($('cpHwFormSave'), true, 'Saving…');
    var res;
    if (hwEditingId) {
      res = await sb.from('client_assignments').update(fields).eq('id', hwEditingId).select();
    } else {
      var ids = $('cpHwAllClients').checked ? rosterClientIds() : [clientId];
      res = await sb.from('client_assignments').insert(ids.map(function(id){
        return Object.assign({ client_id: id, status: 'assigned' }, fields);
      })).select();
    }
    setLoading($('cpHwFormSave'), false, 'Save assignment');
    if (res.error) { alert('Could not save assignment: ' + res.error.message); return; }
    closeModal('cpHwFormOverlay');
    if (viewingClientId !== clientId) return;

    (res.data || []).filter(function(r){ return r.client_id === clientId; }).forEach(function(r){
      var m = mapAssignment(r);
      var exists = portalData.assignments.some(function(x){ return x.id === m.id; });
      portalData.assignments = exists
        ? portalData.assignments.map(function(x){ return x.id === m.id ? m : x; })
        : [m].concat(portalData.assignments);
    });
    renderHomeworkTab();
    if (hwOpenId) renderHwSheet();
  });

  // ─── Check-ins tab: weekly pre-call form + history ────────────────────
  var ciEditing = false;   // client chose to edit this week's submission
  var ciDraft = null;      // { id, existing:{field:[files]}, pending:{field:[File]}, removed:[files] }

  function findPreCall(id){
    return (portalData && portalData.preCallSubmissions || []).filter(function(s){ return String(s.id) === String(id); })[0] || null;
  }

  function thisWeeksPreCall(){
    var ws = startOfWeek(new Date());
    return (portalData.preCallSubmissions || []).filter(function(s){ return s.submittedAt && new Date(s.submittedAt) >= ws; })[0] || null;
  }

  function isReviewedStatus(status){ return /^(reviewed|done)$/i.test(status || ''); }

  function renderCheckinsTab(){
    if (!portalData) return;
    var ws = startOfWeek(new Date());
    $('cpCiWeekLabel').textContent = 'Week of ' + ws.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' })
      + (isOwnPortal() ? ' — fill this out before your call.' : '');
    setBadge('cpTabBadgeCheckins', isOwnPortal() && !thisWeeksPreCall() ? 1 : 0);
    renderCiFormCard();
    renderCiHistory();
    renderCheckinCard();
  }

  function renderCiFormCard(){
    var cur = thisWeeksPreCall();
    var own = isOwnPortal();
    var card = $('cpCiFormCard');

    if (own && (ciEditing || !cur)) {
      var base = ciEditing ? cur : null;
      if (!ciDraft || ciDraft.id !== (base ? base.id : null)) {
        ciDraft = { id: base ? base.id : null, existing: {}, pending: {}, removed: [] };
        PRECALL_FIELDS.forEach(function(f){
          if (f.type !== 'files') return;
          ciDraft.existing[f.key] = base ? base[f.key].slice() : [];
          ciDraft.pending[f.key] = [];
        });
      }
      card.innerHTML = ciFormHtml(base);
      PRECALL_FIELDS.forEach(function(f){ if (f.type === 'files') renderCiFiles(f.key); });
      return;
    }

    if (cur) {
      var when = longDate(new Date(cur.submittedAt));
      card.innerHTML = '<div class="cp-ci-done"><span class="cp-ci-done-icon" aria-hidden="true">✓</span><div>'
        + '<p class="cp-card-title" style="margin:0;">This week’s check-in is in</p>'
        + '<p class="cp-body-text" style="margin-top:6px;">Submitted ' + esc(when) + (own ? '. Your coach will review it before your call.' : '. Full details are below.') + '</p>'
        + (own && cur.source === 'portal' ? '<div class="cp-btn-row"><button type="button" class="cp-btn-sm" data-ci-action="edit">Edit this week’s check-in</button></div>' : '')
        + '</div></div>';
      return;
    }

    card.innerHTML = '<p class="cp-body-text" style="margin:0;">No check-in submitted yet this week.</p>';
  }

  function ciFormHtml(sub){
    var h = '<form id="cpCiForm" novalidate>';
    PRECALL_FIELDS.forEach(function(f){
      var v = sub ? sub[f.key] : ((f.type === 'multi' || f.type === 'files') ? [] : '');
      var lid = 'cpCiL_' + f.key;
      h += '<div class="cp-ci-field"><span class="cp-ci-label" id="'+lid+'">'+esc(f.label)+(f.required ? ' *' : '')+'</span>'
        + (f.hint ? '<p class="cp-ci-hint">'+esc(f.hint)+'</p>' : '');
      if (f.type === 'textarea') {
        h += '<textarea class="cp-textarea" data-ci-field="'+f.key+'" aria-labelledby="'+lid+'"'+(f.required?' required':'')+'>'+esc(v)+'</textarea>';
      } else if (f.type === 'text') {
        h += '<input type="text" class="cp-ci-input" data-ci-field="'+f.key+'" aria-labelledby="'+lid+'" value="'+esc(v)+'" placeholder="'+esc(f.placeholder || '')+'" />';
      } else if (f.type === 'choice' || f.type === 'multi') {
        var type = f.type === 'choice' ? 'radio' : 'checkbox';
        h += '<div class="cp-opt-row" role="'+(type === 'radio' ? 'radiogroup' : 'group')+'" aria-labelledby="'+lid+'">';
        f.options.forEach(function(o){
          var checked = f.type === 'choice' ? v === o : v.indexOf(o) !== -1;
          h += '<label class="cp-opt"><input type="'+type+'" name="ci_'+f.key+'" value="'+esc(o)+'"'+(checked?' checked':'')+' /><span>'+esc(o)+'</span></label>';
        });
        h += '</div>';
      } else if (f.type === 'files') {
        h += '<div class="cp-file-list" id="cpCiFiles_'+f.key+'"></div>'
          + '<div class="cp-btn-row" style="margin-top:8px;"><label class="cp-btn-sm">+ Add files<input type="file" multiple hidden data-ci-file-input="'+f.key+'" /></label></div>';
      }
      h += '</div>';
    });
    h += '<div class="cp-btn-row" style="margin-top:28px;"><button type="submit" class="cp-btn-sm cp-btn-sm--primary" id="cpCiSubmit">'+(sub ? 'Save changes' : 'Submit check-in')+'</button>'
      + (sub ? '<button type="button" class="cp-btn-sm" data-ci-action="cancel">Cancel</button>' : '')
      + '<span class="cp-save-note" id="cpCiNote"></span></div></form>';
    return h;
  }

  function renderCiFiles(key){
    var el = $('cpCiFiles_' + key); if (!el || !ciDraft) return;
    var h = fileRowsHtml(ciDraft.existing[key], 'ciform:' + key, true);
    ciDraft.pending[key].forEach(function(f, i){
      h += '<div class="cp-file-row"><span aria-hidden="true">📎</span><span class="cp-file-open" style="cursor:default;">'+esc(f.name)+'</span>'
        + '<span class="cp-file-size">'+fmtBytes(f.size)+'</span>'
        + '<button type="button" class="cp-file-remove" data-ci-pending-remove="'+key+'" data-file-idx="'+i+'" aria-label="Remove '+esc(f.name)+'">×</button></div>';
    });
    el.innerHTML = h;
  }

  $('cpCiFormCard').addEventListener('change', function(e){
    var input = e.target.closest('[data-ci-file-input]'); if (!input || !ciDraft) return;
    var key = input.getAttribute('data-ci-file-input');
    var files = Array.prototype.slice.call(input.files || []);
    input.value = '';
    var tooBig = files.filter(function(f){ return f.size > MAX_UPLOAD_BYTES; });
    ciDraft.pending[key] = ciDraft.pending[key].concat(files.filter(function(f){ return f.size <= MAX_UPLOAD_BYTES; }));
    renderCiFiles(key);
    setNote('cpCiNote', tooBig.length ? ('Skipped (over 25MB): ' + tooBig.map(function(f){ return f.name; }).join(', ')) : '', !!tooBig.length);
  });

  $('cpCiFormCard').addEventListener('click', function(e){
    var act = e.target.closest('[data-ci-action]');
    if (act) {
      var action = act.getAttribute('data-ci-action');
      ciEditing = action === 'edit';
      ciDraft = null;
      renderCiFormCard();
      return;
    }
    var pend = e.target.closest('[data-ci-pending-remove]');
    if (pend && ciDraft) {
      var pk = pend.getAttribute('data-ci-pending-remove');
      ciDraft.pending[pk].splice(parseInt(pend.getAttribute('data-file-idx'), 10), 1);
      renderCiFiles(pk);
      return;
    }
    var rm = e.target.closest('[data-file-remove-ctx^="ciform:"]');
    if (rm && ciDraft) {
      var key = rm.getAttribute('data-file-remove-ctx').split(':')[1];
      var removed = ciDraft.existing[key].splice(parseInt(rm.getAttribute('data-file-idx'), 10), 1);
      ciDraft.removed = ciDraft.removed.concat(removed);
      renderCiFiles(key);
    }
  });

  $('cpCiFormCard').addEventListener('submit', async function(e){
    e.preventDefault();
    var form = $('cpCiForm');
    if (!form || !ciDraft || !isOwnPortal()) return;
    var clientId = viewingClientId;
    var draft = ciDraft;

    var row = {};
    PRECALL_FIELDS.forEach(function(f){
      if (f.type === 'text' || f.type === 'textarea') {
        row[f.key] = form.querySelector('[data-ci-field="'+f.key+'"]').value.trim();
      } else if (f.type === 'choice') {
        var r = form.querySelector('input[name="ci_'+f.key+'"]:checked');
        row[f.key] = r ? r.value : '';
      } else if (f.type === 'multi') {
        row[f.key] = Array.prototype.map.call(form.querySelectorAll('input[name="ci_'+f.key+'"]:checked'), function(c){ return c.value; });
      }
    });
    if (!row.coaching_call_objective) {
      setNote('cpCiNote', 'Add the objective for our call first.', true);
      form.querySelector('[data-ci-field="coaching_call_objective"]').focus();
      return;
    }

    var btn = $('cpCiSubmit');
    btn.disabled = true;
    var stamp = Date.now();
    var uploaded = [];
    try {
      for (var k = 0; k < PRECALL_FIELDS.length; k++) {
        var f = PRECALL_FIELDS[k];
        if (f.type !== 'files') continue;
        var added = [];
        for (var i = 0; i < draft.pending[f.key].length; i++) {
          setNote('cpCiNote', 'Uploading ' + draft.pending[f.key][i].name + '…');
          var up = await uploadClientFile(clientId, 'check-ins/' + stamp, draft.pending[f.key][i]);
          added.push(up); uploaded.push(up);
        }
        row[f.key] = draft.existing[f.key].concat(added);
      }
    } catch (err) {
      removeStoredFiles(uploaded);
      btn.disabled = false;
      setNote('cpCiNote', err.message, true);
      return;
    }

    setNote('cpCiNote', 'Saving…');
    var res;
    if (draft.id) {
      res = await sb.from('client_pre_call_submissions').update(row).eq('id', draft.id).select().single();
    } else {
      row.client_id = clientId;
      row.source = 'portal';
      row.status = 'Submitted';
      row.submitted_at = new Date().toISOString();
      res = await sb.from('client_pre_call_submissions').insert(row).select().single();
    }
    btn.disabled = false;
    if (res.error) {
      removeStoredFiles(uploaded);
      setNote('cpCiNote', 'Could not save your check-in: ' + res.error.message, true);
      return;
    }
    removeStoredFiles(draft.removed);
    if (viewingClientId !== clientId) return;

    var saved = mapPreCall(res.data);
    var exists = portalData.preCallSubmissions.some(function(s){ return s.id === saved.id; });
    portalData.preCallSubmissions = exists
      ? portalData.preCallSubmissions.map(function(s){ return s.id === saved.id ? saved : s; })
      : [saved].concat(portalData.preCallSubmissions);
    ciEditing = false;
    ciDraft = null;
    renderCheckinsTab();
  });

  function renderCiHistory(){
    var rows = portalData.preCallSubmissions || [];
    if (!rows.length) {
      $('cpCiHistory').innerHTML = '<div class="cp-goal-empty">No check-ins yet.</div>';
      return;
    }
    var h = '';
    rows.forEach(function(sub, idx){
      var reviewed = isReviewedStatus(sub.status);
      h += '<details class="cp-ci-item"'+(idx === 0 ? ' open' : '')+'><summary>'
        + '<span class="cp-ci-date">'+esc(sub.submittedAt ? longDate(new Date(sub.submittedAt)) : 'Undated')+'</span>'
        + statusPill(sub.status || 'Submitted', reviewed ? '#3d9b37' : '#aa70d7')
        + '<span class="cp-due-chip">'+(sub.source === 'portal' ? 'Portal' : 'Notion')+'</span>'
        + (sub.coaching_call_objective ? '<p class="cp-ci-snippet">'+esc(sub.coaching_call_objective)+'</p>' : '')
        + '</summary><div class="cp-ci-body">';
      var any = false;
      PRECALL_FIELDS.forEach(function(f){
        var v = sub[f.key], html;
        if (f.type === 'files') {
          if (!v.length) return;
          html = '<div class="cp-file-list">' + fileRowsHtml(v, 'ci:' + sub.id + ':' + f.key, false) + '</div>';
        } else if (f.type === 'multi') {
          if (!v.length) return;
          html = esc(v.join(', '));
        } else {
          if (!v) return;
          html = linkify(v);
        }
        any = true;
        h += '<div class="cp-ci-row"><span class="cp-ci-key">'+esc(f.label)+'</span><div class="cp-ci-value">'+html+'</div></div>';
      });
      if (sub.url_upload) { any = true; h += '<div class="cp-ci-row"><span class="cp-ci-key">Link</span><div class="cp-ci-value">'+linkify(sub.url_upload)+'</div></div>'; }
      if (!any) h += '<p class="cp-caption">No answers recorded.</p>';
      if (isCoachUser) {
        h += '<div class="cp-btn-row"><button type="button" class="cp-btn-sm" data-ci-review="'+esc(sub.id)+'">'+(reviewed ? 'Mark not reviewed' : 'Mark reviewed')+'</button></div>';
      }
      h += '</div></details>';
    });
    $('cpCiHistory').innerHTML = h;
  }

  $('cpCiHistory').addEventListener('click', async function(e){
    var btn = e.target.closest('[data-ci-review]'); if (!btn || !isCoachUser) return;
    var sub = findPreCall(btn.getAttribute('data-ci-review')); if (!sub) return;
    var clientId = viewingClientId;
    var status = isReviewedStatus(sub.status) ? 'Submitted' : 'Reviewed';
    btn.disabled = true;
    var { error } = await sb.from('client_pre_call_submissions').update({ status: status }).eq('id', sub.id);
    btn.disabled = false;
    if (error) { alert('Could not update: ' + error.message); return; }
    if (viewingClientId !== clientId) return;
    sub.status = status;
    renderCiHistory();
  });

  function renderCheckinCard(){
    var cur = thisWeeksPreCall();
    var own = isOwnPortal();
    var total = (portalData.preCallSubmissions || []).length;
    $('cpCiCardTitle').textContent = cur ? 'Submitted for this week ✓' : 'Not submitted yet';
    $('cpCiCardBody').textContent = (cur
      ? 'Sent ' + longDate(new Date(cur.submittedAt)) + '.'
      : (own ? 'Fill out your pre-call form before your next session.' : 'No pre-call form this week yet.'))
      + (total ? ' ' + total + ' check-in' + (total === 1 ? '' : 's') + ' on record.' : '');
    $('cpCiCardCta').textContent = (!cur && own) ? 'Fill out check-in' : 'View check-ins';
  }

  // ─── Education tab: shared curriculum ─────────────────────────────────
  // One curriculum (core -> competency -> question) shared by every client.
  // Clients review the questions here and answer them verbally on calls, so
  // nothing is answered or stored per client.
  var eduCore = null;   // core shown on the Education tab

  function coreLabel(key){
    var d = CORE_DEFS.filter(function(c){ return c.key === key; })[0];
    return d ? d.label : key;
  }

  // Questions grouped by competency, in curriculum order.
  function groupByCompetency(qs){
    var order = [], groups = {};
    qs.slice().sort(function(a, b){ return a.position - b.position; }).forEach(function(q){
      var k = q.competency.trim() || 'General';
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(q);
    });
    return order.map(function(k){ return { name:k, items:groups[k] }; });
  }

  function coreChipsHtml(counts, active, attr, disableEmpty){
    return CORE_DEFS.map(function(c){
      var n = counts[c.key] || 0;
      var sub = n ? n + ' question' + (n === 1 ? '' : 's') : 'Coming soon';
      return '<button type="button" role="tab" class="cp-core-chip'+(c.key === active ? ' is-active' : '')+'" aria-selected="'+(c.key === active)+'" '+attr+'="'+c.key+'"'+(disableEmpty && !n ? ' disabled' : '')+'>'
        + '<span class="cp-dot" style="background:'+c.color+'"></span>'+esc(c.label)+'<small>'+esc(sub)+'</small></button>';
    }).join('');
  }

  function renderEducationTab(){
    if (!portalData) return;
    var qs = portalData.eduQuestions || [];
    $('cpEduAddBtn').hidden = !isCoachUser;
    $('cpEduSummary').textContent = qs.length ? 'Be ready to answer these out loud on our calls.' : '';

    var counts = {};
    qs.forEach(function(q){ counts[q.coreKey] = (counts[q.coreKey] || 0) + 1; });
    if (!eduCore || !counts[eduCore]) {
      eduCore = (CORE_DEFS.filter(function(c){ return counts[c.key]; })[0] || CORE_DEFS[0]).key;
    }
    $('cpEduCoreChips').hidden = !qs.length;
    $('cpEduCoreChips').innerHTML = coreChipsHtml(counts, eduCore, 'data-edu-core', true);

    var h = '';
    if (!qs.length) {
      h = '<div class="cp-goal-empty">' + (isCoachUser ? 'No curriculum yet — use “Edit curriculum” to add questions.' : 'Your coach is building these — check back soon.') + '</div>';
    }
    groupByCompetency(qs.filter(function(q){ return q.coreKey === eduCore; })).forEach(function(g){
      h += '<div class="cp-edu-group"><p class="cp-goals-section-label">'+esc(g.name)+'</p><div class="cp-edu-list">'
        + g.items.map(function(q){ return '<div class="cp-edu-card"><p class="cp-edu-q">'+esc(q.question)+'</p></div>'; }).join('')
        + '</div></div>';
    });
    $('cpEduList').innerHTML = h;
    renderEduCard();
  }

  $('cpEduCoreChips').addEventListener('click', function(e){
    var b = e.target.closest('[data-edu-core]'); if (!b || b.disabled) return;
    eduCore = b.getAttribute('data-edu-core');
    renderEducationTab();
  });

  function renderEduCard(){
    var qs = portalData.eduQuestions || [];
    $('cpEduCard').hidden = qs.length === 0;
    if (!qs.length) return;
    var cores = CORE_DEFS.filter(function(c){ return qs.some(function(q){ return q.coreKey === c.key; }); });
    $('cpEduCardTitle').textContent = qs.length + ' competency question' + (qs.length === 1 ? '' : 's');
    $('cpEduCardMeta').textContent = cores.map(function(c){ return c.label; }).join(' · ');
    $('cpEduCardBody').textContent = 'Review these before your calls — you\'ll answer them out loud.';
  }

  async function reloadEducation(clientId){
    var { data } = await sb.from('education_questions').select('*').order('position');
    if (viewingClientId !== clientId || !portalData) return;
    portalData.eduQuestions = (data || []).map(curMap);
    renderEducationTab();
  }

  // ─── Coach: curriculum editor ─────────────────────────────────────────
  var curBank = [];       // [{ id, coreKey, competency, question, position }]
  var curCore = 'body';

  function curMap(r){ return { id:r.id, coreKey:r.core_key, competency:r.competency || '', question:r.question, position:r.position || 0 }; }
  function curFind(id){ return curBank.filter(function(q){ return q.id === id; })[0] || null; }

  async function openCurriculum(){
    if (!isCoachUser) return;
    if (eduCore) curCore = eduCore;
    $('cpCurOverlay').hidden = false;
    document.body.style.overflow = 'hidden';
    $('cpCurBody').innerHTML = '<p class="cp-caption">Loading…</p>';
    setNote('cpCurNote', '');
    var { data, error } = await sb.from('education_questions').select('*').order('position');
    if (error) { $('cpCurBody').innerHTML = '<p class="cp-save-note is-error">Could not load the curriculum: '+esc(error.message)+'</p>'; return; }
    curBank = (data || []).map(curMap);
    curRender();
  }

  function closeCurriculum(){
    $('cpCurOverlay').hidden = true;
    document.body.style.overflow = '';
    if (viewingClientId && portalData) reloadEducation(viewingClientId);
  }

  function curRender(){
    var counts = {};
    curBank.forEach(function(q){ counts[q.coreKey] = (counts[q.coreKey] || 0) + 1; });
    $('cpCurCoreChips').innerHTML = coreChipsHtml(counts, curCore, 'data-cur-core', false);
    $('cpCurCoreName').textContent = coreLabel(curCore);

    var groups = groupByCompetency(curBank.filter(function(q){ return q.coreKey === curCore; }));
    var h = '';
    if (!groups.length) h = '<div class="cp-goal-empty" style="margin:0;">No ' + esc(coreLabel(curCore)) + ' questions yet — add some below.</div>';
    groups.forEach(function(g){
      h += '<div class="cp-cur-group"><div class="cp-cur-group-head"><input type="text" class="cp-ci-input" data-cur-comp="'+esc(g.name)+'" value="'+esc(g.name)+'" aria-label="Competency name" /></div>';
      g.items.forEach(function(q){
        h += '<div class="cp-cur-row" data-cur-id="'+esc(q.id)+'"><textarea class="cp-textarea" data-cur-q aria-label="Question">'+esc(q.question)+'</textarea>'
          + '<div class="cp-cur-row-actions"><button type="button" data-cur-move="-1" aria-label="Move up">↑</button><button type="button" data-cur-move="1" aria-label="Move down">↓</button><button type="button" data-cur-del aria-label="Delete question">✕</button></div></div>';
      });
      h += '</div>';
    });
    $('cpCurBody').innerHTML = h;
    $('cpCurCompetencyList').innerHTML = groups.map(function(g){ return '<option value="'+esc(g.name)+'"></option>'; }).join('');
  }

  $('cpCurOpenBtn').addEventListener('click', openCurriculum);
  $('cpEduAddBtn').addEventListener('click', openCurriculum);
  $('cpCurOverlay').addEventListener('click', function(e){ if (e.target.closest('[data-close-cur]')) closeCurriculum(); });

  $('cpCurCoreChips').addEventListener('click', function(e){
    var b = e.target.closest('[data-cur-core]'); if (!b) return;
    curCore = b.getAttribute('data-cur-core');
    curRender();
  });

  $('cpCurBody').addEventListener('change', async function(e){
    var qEl = e.target.closest('[data-cur-q]');
    if (qEl) {
      var q = curFind(qEl.closest('[data-cur-id]').getAttribute('data-cur-id')); if (!q) return;
      var text = qEl.value.trim();
      if (!text) { qEl.value = q.question; return; }
      setNote('cpCurNote', 'Saving…');
      var r1 = await sb.from('education_questions').update({ question: text }).eq('id', q.id);
      if (r1.error) { setNote('cpCurNote', 'Could not save: ' + r1.error.message, true); return; }
      q.question = text;
      setNote('cpCurNote', 'Saved');
      return;
    }
    var cEl = e.target.closest('[data-cur-comp]');
    if (cEl) {
      var oldName = cEl.getAttribute('data-cur-comp');
      var newName = cEl.value.trim() || 'General';
      var items = curBank.filter(function(x){ return x.coreKey === curCore && (x.competency.trim() || 'General') === oldName; });
      var ids = items.map(function(x){ return x.id; });
      if (!ids.length || newName === oldName) return;
      setNote('cpCurNote', 'Saving…');
      var r2 = await sb.from('education_questions').update({ competency: newName === 'General' ? '' : newName }).in('id', ids);
      if (r2.error) { setNote('cpCurNote', 'Could not rename: ' + r2.error.message, true); cEl.value = oldName; return; }
      items.forEach(function(x){ x.competency = newName === 'General' ? '' : newName; });
      setNote('cpCurNote', 'Saved');
      curRender();
    }
  });

  $('cpCurBody').addEventListener('click', async function(e){
    var row = e.target.closest('[data-cur-id]'); if (!row) return;
    var q = curFind(row.getAttribute('data-cur-id')); if (!q) return;

    if (e.target.closest('[data-cur-del]')) {
      if (!confirm('Delete this question for every client?')) return;
      var del = await sb.from('education_questions').delete().eq('id', q.id);
      if (del.error) { setNote('cpCurNote', 'Could not delete: ' + del.error.message, true); return; }
      curBank = curBank.filter(function(x){ return x.id !== q.id; });
      curRender();
      return;
    }

    var mv = e.target.closest('[data-cur-move]'); if (!mv) return;
    var dir = parseInt(mv.getAttribute('data-cur-move'), 10);
    var group = groupByCompetency(curBank.filter(function(x){ return x.coreKey === curCore; }))
      .filter(function(g){ return g.items.indexOf(q) !== -1; })[0];
    var i = group.items.indexOf(q), other = group.items[i + dir];
    if (!other) return;
    // Positions can tie (bulk adds), so give the pair distinct values on swap.
    var a = Math.min(q.position, other.position), b = Math.max(q.position, other.position);
    if (a === b) b = a + 1;
    var qPos = dir < 0 ? a : b, oPos = dir < 0 ? b : a;
    var res = await Promise.all([
      sb.from('education_questions').update({ position: qPos }).eq('id', q.id),
      sb.from('education_questions').update({ position: oPos }).eq('id', other.id)
    ]);
    var err = res.map(function(r){ return r.error; }).filter(Boolean)[0];
    if (err) { setNote('cpCurNote', 'Could not reorder: ' + err.message, true); return; }
    q.position = qPos; other.position = oPos;
    curRender();
  });

  $('cpCurAddBtn').addEventListener('click', async function(){
    var lines = $('cpCurQuestions').value.split('\n').map(function(l){ return l.trim(); }).filter(Boolean);
    if (!lines.length) { $('cpCurQuestions').focus(); return; }
    var competency = $('cpCurCompetency').value.trim();
    var start = curBank.reduce(function(m, q){ return Math.max(m, q.position); }, -1) + 1;
    var rows = lines.map(function(text, i){ return { core_key: curCore, competency: competency, question: text, position: start + i }; });
    setLoading($('cpCurAddBtn'), true, 'Adding…');
    var { data, error } = await sb.from('education_questions').insert(rows).select();
    setLoading($('cpCurAddBtn'), false, 'Add questions');
    if (error) { setNote('cpCurNote', 'Could not add: ' + error.message, true); return; }
    curBank = curBank.concat((data || []).map(curMap));
    $('cpCurQuestions').value = '';
    setNote('cpCurNote', 'Added ' + lines.length + ' question' + (lines.length === 1 ? '' : 's'));
    curRender();
  });

  function renderWins(){
    var h=''; portalData.wins.forEach(function(w){ h+='<div class="cp-win-row"><span class="cp-dot" style="background:'+(w.color||'#77d770')+'"></span><span class="cp-win-label">'+esc(w.label)+'</span><span class="cp-win-meta">'+esc(w.meta)+'</span></div>'; });
    $('cpWinList').innerHTML = h || '<p class="cp-caption" style="margin:0;">No wins logged yet.</p>';
  }

  function renderChips(){
    var h=''; portalData.resources.forEach(function(r){ h+='<span class="cp-chip"><span class="cp-dot" style="background:'+(r.color||'#2a9df0')+'"></span>'+esc(r.label)+'</span>'; });
    $('cpResourceChips').innerHTML = h || '<p class="cp-caption" style="margin:0;">Nothing assigned yet.</p>';
  }

  function renderSessionCard(){
    $('cpSessionLabel').textContent = portalData.nextSessionLabel || 'Not scheduled yet';
    $('cpSessionAgenda').textContent = portalData.nextSessionAgenda || 'Your coach hasn\'t set an agenda yet.';
    renderSessionCTA();
  }

  // ─── Calendar connect (Google / Outlook) ───────────────────────────────
  // Only the client sees this — a coach browsing a client's portal (see
  // isCoachUser) gets the card hidden, since connecting is per-client and
  // the OAuth flows below run as whoever is signed into this browser tab.
  function calConfigured(provider){
    if (provider === 'google') return CALENDAR_CONFIG.googleClientId.indexOf('YOUR_') !== 0;
    return CALENDAR_CONFIG.microsoftClientId.indexOf('YOUR_') !== 0;
  }

  function calWindow(){
    var start = new Date(); start.setHours(0,0,0,0);
    var end = new Date(start.getTime() + CAL_WINDOW_DAYS*24*60*60*1000);
    return { start:start, end:end };
  }

  async function calPersistConnection(clientId, provider, connected, email){
    await sb.from('client_calendar_connections').upsert(
      { client_id: clientId, provider: provider, connected: connected, account_email: email || '', connected_at: new Date().toISOString() },
      { onConflict: 'client_id,provider' }
    );
  }

  // ─── Google Calendar (Google Identity Services token client) ──────────
  function calGoogleTokenClient(){
    if (googleTokenClient || !window.google || !google.accounts || !google.accounts.oauth2) return googleTokenClient;
    googleTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CALENDAR_CONFIG.googleClientId,
      scope: CALENDAR_CONFIG.googleScope,
      callback: function(){}   // overridden per-request below
    });
    return googleTokenClient;
  }

  function calRequestGoogleToken(silent){
    return new Promise(function(resolve, reject){
      var client = calGoogleTokenClient();
      if (!client) { reject(new Error('Google Identity Services not loaded yet.')); return; }
      client.callback = function(resp){
        if (resp && resp.access_token) resolve(resp.access_token);
        else reject(new Error((resp && resp.error) || 'No access token returned.'));
      };
      client.error_callback = function(err){ reject(err || new Error('Google sign-in failed.')); };
      client.requestAccessToken(silent ? { prompt:'' } : { prompt:'consent' });
    });
  }

  async function calFetchGoogleEvents(token){
    var win = calWindow();
    var url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
      + '?timeMin=' + encodeURIComponent(win.start.toISOString())
      + '&timeMax=' + encodeURIComponent(win.end.toISOString())
      + '&singleEvents=true&orderBy=startTime&maxResults=20';
    var res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) throw new Error('Google Calendar API error (' + res.status + ')');
    var data = await res.json();
    return (data.items || []).map(function(ev){
      var allDay = !!(ev.start && ev.start.date && !ev.start.dateTime);
      return {
        id: 'google:' + ev.id,
        provider: 'google',
        title: ev.summary || '(No title)',
        start: new Date(allDay ? ev.start.date : ev.start.dateTime),
        end: new Date(allDay ? ev.end.date : ev.end.dateTime),
        allDay: allDay,
        joinUrl: calGoogleJoinUrl(ev)
      };
    });
  }

  // A meeting link, in priority order: the Meet link Google surfaces
  // directly, then any "video" entry point from richer conference data
  // (Zoom/Meet/etc. added via a conferencing add-on), then a location field
  // that's itself a plain URL (how many clients paste a Zoom link).
  function calGoogleJoinUrl(ev){
    if (ev.hangoutLink) return ev.hangoutLink;
    var entryPoints = ev.conferenceData && ev.conferenceData.entryPoints;
    if (entryPoints) {
      var video = entryPoints.filter(function(e){ return e.entryPointType === 'video'; })[0];
      if (video && video.uri) return video.uri;
    }
    if (ev.location && /^https?:\/\//i.test(ev.location.trim())) return ev.location.trim();
    return '';
  }

  async function calConnectGoogle(){
    if (!calConfigured('google')) { calSetStatus('Google Calendar isn\'t set up yet — ask your coach to finish the connection setup.', true); return; }
    var clientId = viewingClientId;
    calState.google.busy = true; calRenderCard();
    try {
      var token = await calRequestGoogleToken(false);
      calState.google.token = token;
      calState.google.connected = true;
      calState.google.needsReconnect = false;
      calState.google.events = await calFetchGoogleEvents(token);
      var infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers:{ Authorization:'Bearer '+token } });
      var info = infoRes.ok ? await infoRes.json() : {};
      calState.google.email = info.email || '';
      if (viewingClientId === clientId) await calPersistConnection(clientId, 'google', true, calState.google.email);
    } catch (e) {
      calSetStatus('Couldn\'t connect Google Calendar: ' + (e && e.message ? e.message : 'try again.'), true);
    }
    calState.google.busy = false;
    if (viewingClientId === clientId) calRenderCard();
  }

  async function calDisconnectGoogle(){
    var clientId = viewingClientId;
    if (calState.google.token && window.google && google.accounts && google.accounts.oauth2) {
      google.accounts.oauth2.revoke(calState.google.token, function(){});
    }
    calState.google = { connected:false, needsReconnect:false, token:null, email:'', events:[], busy:false };
    if (clientId) await calPersistConnection(clientId, 'google', false, '');
    if (viewingClientId === clientId) calRenderCard();
  }

  // ─── Outlook (MSAL.js — Microsoft SPA / PKCE, no client secret) ───────
  function calGetMsal(){
    if (!window.msal) return null;
    if (!msalInstance) {
      msalInstance = new msal.PublicClientApplication({
        auth: { clientId: CALENDAR_CONFIG.microsoftClientId, authority: 'https://login.microsoftonline.com/common', redirectUri: window.location.origin + window.location.pathname },
        cache: { cacheLocation: 'localStorage' }
      });
      msalReady = msalInstance.initialize();
    }
    return msalInstance;
  }

  async function calFetchOutlookEvents(token){
    var win = calWindow();
    var url = 'https://graph.microsoft.com/v1.0/me/calendarview'
      + '?startDateTime=' + encodeURIComponent(win.start.toISOString())
      + '&endDateTime=' + encodeURIComponent(win.end.toISOString())
      + '&$orderby=start/dateTime&$top=20';
    var res = await fetch(url, { headers: { Authorization: 'Bearer ' + token, Prefer: 'outlook.timezone="UTC"' } });
    if (!res.ok) throw new Error('Outlook Calendar API error (' + res.status + ')');
    var data = await res.json();
    return (data.value || []).map(function(ev){
      var allDay = !!ev.isAllDay;
      return {
        id: 'outlook:' + ev.id,
        provider: 'outlook',
        title: ev.subject || '(No title)',
        start: new Date(ev.start.dateTime + (ev.start.dateTime.slice(-1) === 'Z' ? '' : 'Z')),
        end: new Date(ev.end.dateTime + (ev.end.dateTime.slice(-1) === 'Z' ? '' : 'Z')),
        allDay: allDay,
        joinUrl: calOutlookJoinUrl(ev)
      };
    });
  }

  function calOutlookJoinUrl(ev){
    if (ev.onlineMeeting && ev.onlineMeeting.joinUrl) return ev.onlineMeeting.joinUrl;
    if (ev.onlineMeetingUrl) return ev.onlineMeetingUrl;
    if (ev.location && ev.location.displayName && /^https?:\/\//i.test(ev.location.displayName.trim())) return ev.location.displayName.trim();
    return '';
  }

  async function calConnectOutlook(){
    if (!calConfigured('outlook')) { calSetStatus('Outlook Calendar isn\'t set up yet — ask your coach to finish the connection setup.', true); return; }
    var clientId = viewingClientId;
    var client = calGetMsal();
    if (!client) { calSetStatus('Microsoft sign-in is still loading — try again in a moment.', true); return; }
    calState.outlook.busy = true; calRenderCard();
    try {
      await msalReady;
      var loginResp = await client.loginPopup({ scopes: CALENDAR_CONFIG.microsoftScopes });
      var tokenResp = await client.acquireTokenSilent({ scopes: CALENDAR_CONFIG.microsoftScopes, account: loginResp.account })
        .catch(function(){ return client.acquireTokenPopup({ scopes: CALENDAR_CONFIG.microsoftScopes, account: loginResp.account }); });
      calState.outlook.account = loginResp.account;
      calState.outlook.email = loginResp.account.username || '';
      calState.outlook.connected = true;
      calState.outlook.needsReconnect = false;
      calState.outlook.events = await calFetchOutlookEvents(tokenResp.accessToken);
      if (viewingClientId === clientId) await calPersistConnection(clientId, 'outlook', true, calState.outlook.email);
    } catch (e) {
      calSetStatus('Couldn\'t connect Outlook Calendar: ' + (e && e.message ? e.message : 'try again.'), true);
    }
    calState.outlook.busy = false;
    if (viewingClientId === clientId) calRenderCard();
  }

  async function calDisconnectOutlook(){
    var clientId = viewingClientId;
    var client = calGetMsal();
    if (client && calState.outlook.account) {
      try { await msalReady; await client.getTokenCache().removeAccount(calState.outlook.account); } catch (e) { /* best effort */ }
    }
    calState.outlook = { connected:false, needsReconnect:false, account:null, email:'', events:[], busy:false };
    if (clientId) await calPersistConnection(clientId, 'outlook', false, '');
    if (viewingClientId === clientId) calRenderCard();
  }

  // ─── Load + render ──────────────────────────────────────────────────────
  async function calLoadForClient(clientId){
    calState.google  = { connected:false, needsReconnect:false, token:null, email:'', events:[], busy:false };
    calState.outlook = { connected:false, needsReconnect:false, account:null, email:'', events:[], busy:false };
    if (isCoachUser) { calRenderCard(); return; }   // clients only — see comment above

    var { data } = await sb.from('client_calendar_connections').select('*').eq('client_id', clientId);
    if (viewingClientId !== clientId) return;
    (data || []).forEach(function(row){
      if (!row.connected) return;
      calState[row.provider].connected = true;
      calState[row.provider].needsReconnect = true;   // flips false once a silent/real token comes back
      calState[row.provider].email = row.account_email || '';
    });
    calRenderCard();

    // We used to auto-attempt a "silent" Google token request here so
    // returning clients wouldn't have to click "Connect" every visit. GIS's
    // silent prompt is documented as best-effort only — when there's no
    // usable session (third-party cookies blocked, token expired, etc.) it
    // can fall back to opening a real, visible sign-in popup on its own,
    // with no click from the client. That reads as "Google keeps opening by
    // itself." There's no safe way to guarantee it stays silent, so we no
    // longer call it automatically — the client sees "Reconnect Google" and
    // any popup only happens from their own click on calConnectGoogle().
    if (calState.outlook.connected) {
      var client = calGetMsal();
      if (client) {
        msalReady.then(function(){ return client.getAllAccounts(); }).then(function(accounts){
          if (viewingClientId !== clientId || !accounts.length) return;
          var account = accounts[0];
          return client.acquireTokenSilent({ scopes: CALENDAR_CONFIG.microsoftScopes, account: account }).then(async function(tokenResp){
            if (viewingClientId !== clientId) return;
            calState.outlook.account = account;
            calState.outlook.needsReconnect = false;
            calState.outlook.events = await calFetchOutlookEvents(tokenResp.accessToken);
            if (viewingClientId === clientId) calRenderCard();
          });
        }).catch(function(){ /* leave needsReconnect true */ });
      }
    }
  }

  function calSetStatus(msg, isError){
    var el = $('cpCalStatus');
    el.textContent = msg || '';
    el.classList.toggle('is-error', !!isError);
  }

  function calProviderBtnLabel(provider, name){
    var s = calState[provider];
    if (s.busy) return 'Connecting…';
    if (s.connected && s.needsReconnect) return 'Reconnect ' + name;
    if (s.connected) return name + ' · ' + (s.email || 'Connected');
    return 'Connect ' + name;
  }

  function calRenderButtons(){
    var g = $('cpCalConnectGoogle'), o = $('cpCalConnectOutlook');
    g.textContent = calProviderBtnLabel('google', 'Google');
    g.classList.toggle('is-connected', calState.google.connected && !calState.google.needsReconnect);
    g.classList.toggle('is-loading', calState.google.busy);
    o.textContent = calProviderBtnLabel('outlook', 'Outlook');
    o.classList.toggle('is-connected', calState.outlook.connected && !calState.outlook.needsReconnect);
    o.classList.toggle('is-loading', calState.outlook.busy);
  }

  function calFormatEventWhen(ev){
    if (ev.allDay) return ev.start.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' }) + ' · All day';
    return ev.start.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' }) + ' · '
      + ev.start.toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit' });
  }

  function calRenderEvents(){
    var events = calState.google.events.concat(calState.outlook.events)
      .sort(function(a,b){ return a.start - b.start; });
    if (!calState.google.connected && !calState.outlook.connected) {
      $('cpCalEventList').innerHTML = '<p class="cp-caption" style="margin:0;">Connect a calendar above to see your upcoming sessions and appointments here.</p>';
      return;
    }
    if (!events.length) {
      $('cpCalEventList').innerHTML = '<p class="cp-caption" style="margin:0;">Nothing on your calendar in the next ' + CAL_WINDOW_DAYS + ' days.</p>';
      return;
    }
    var dotColor = { google:'#f02348', outlook:'#2a9df0' };
    var h = '';
    events.forEach(function(ev){
      h += '<div class="cp-cal-event-row">'
        + '<span class="cp-cal-event-when">' + esc(calFormatEventWhen(ev)) + '</span>'
        + '<div class="cp-cal-event-body">'
        + '<p class="cp-cal-event-title">' + esc(ev.title) + '</p>'
        + '<p class="cp-cal-event-meta"><span class="cp-cal-provider-dot" style="background:' + dotColor[ev.provider] + '"></span>' + (ev.provider === 'google' ? 'Google Calendar' : 'Outlook')
        + (ev.joinUrl ? '<a class="cp-cal-event-join" href="' + esc(ev.joinUrl) + '" target="_blank" rel="noopener">Join</a>' : '')
        + '</p>'
        + '</div></div>';
    });
    $('cpCalEventList').innerHTML = h;
  }

  function calRenderCard(){
    $('cpCalendarCard').hidden = isCoachUser;
    renderSessionCTA();
    if (isCoachUser) return;
    calRenderButtons();
    calRenderEvents();
  }

  // ─── Next Session card: "Join call" wired to the connected calendar(s) ──
  // A meeting is "appropriate" to join if it has a call link and is either
  // already underway or starting within the next 15 minutes. Otherwise the
  // client hasn't got anything to join yet, so the CTA suggests booking one.
  var JOIN_WINDOW_MS = 15 * 60 * 1000;

  function calAllEvents(){
    return calState.google.events.concat(calState.outlook.events)
      .sort(function(a,b){ return a.start - b.start; });
  }

  function calJoinableMeeting(){
    var now = new Date();
    var soon = new Date(now.getTime() + JOIN_WINDOW_MS);
    var upcoming = calAllEvents().filter(function(ev){
      return !ev.allDay && ev.joinUrl && ev.end > now && ev.start <= soon;
    });
    return upcoming[0] || null;
  }

  function calScheduleCallUrl(){
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE'
      + '&text=' + encodeURIComponent('Coaching Call')
      + '&details=' + encodeURIComponent('Scheduled from your client portal.');
  }

  function renderSessionCTA(){
    var btn = $('cpJoinCallBtn');
    if (!btn) return;
    if (isCoachUser) { $('cpSessionCard').querySelector('.cp-cta-row').hidden = true; return; }
    $('cpSessionCard').querySelector('.cp-cta-row').hidden = false;
    var meeting = calJoinableMeeting();
    if (meeting) {
      btn.textContent = 'Join call';
      btn.href = meeting.joinUrl;
      btn.classList.remove('cp-cta-schedule');
    } else {
      btn.textContent = 'Schedule a call';
      btn.href = calScheduleCallUrl();
      btn.classList.add('cp-cta-schedule');
    }
  }

  $('cpCalConnectGoogle').addEventListener('click', function(){
    if (calState.google.connected && !calState.google.needsReconnect) calDisconnectGoogle();
    else calConnectGoogle();
  });
  $('cpCalConnectOutlook').addEventListener('click', function(){
    if (calState.outlook.connected && !calState.outlook.needsReconnect) calDisconnectOutlook();
    else calConnectOutlook();
  });

  function renderReminder(){
    var day = portalData.reminderDay, ch = portalData.reminderChannel;
    $('cpRemDay').textContent = day; $('cpRemChannel').textContent = ch;
    $('cpRemToggle').classList.toggle('is-on', portalData.reminderOn);
    var open = portalData.tasks.filter(function(t){ return !t.done; }).length;
    $('cpRemLine').textContent = portalData.reminderOn
      ? open+' of '+portalData.tasks.length+' still open — reminder goes out '+day+' 7:00 AM by '+ch+'.'
      : 'Reminders are off. You will not be nudged before your next call.';
  }

  function persistDashPatch(patch){
    if (!viewingClientId) return Promise.resolve();
    var row = Object.assign({ client_id: viewingClientId }, patch);
    return sb.from('client_dashboard').upsert(row, { onConflict: 'client_id' }).then(function(res){
      if (res.error) console.error('Failed to save dashboard change:', res.error);
      return res;
    });
  }

  $('cpRemDay').addEventListener('click', function(){
    if (!portalData) return;
    var idx = remDays.indexOf(portalData.reminderDay);
    portalData.reminderDay = remDays[(idx+1+remDays.length) % remDays.length];
    renderReminder();
    persistDashPatch({ reminder_day: portalData.reminderDay });
  });

  $('cpRemChannel').addEventListener('click', function(){
    if (!portalData) return;
    var idx = remChans.indexOf(portalData.reminderChannel);
    portalData.reminderChannel = remChans[(idx+1+remChans.length) % remChans.length];
    renderReminder();
    persistDashPatch({ reminder_channel: portalData.reminderChannel });
  });

  $('cpRemToggle').addEventListener('click', function(){
    if (!portalData) return;
    portalData.reminderOn = !portalData.reminderOn;
    renderReminder();
    persistDashPatch({ reminder_on: portalData.reminderOn });
  });

  $('cpTaskList').addEventListener('click', function(e){
    var btn = e.target.closest('.cp-task-check'); if (!btn || !portalData) return;
    e.stopPropagation();
    var idx = parseInt(btn.getAttribute('data-idx'),10);
    var task = portalData.tasks[idx]; if (!task) return;
    task.done = !task.done;
    renderTasks(); renderReminder();
    sb.from('client_tasks').update({ done: task.done }).eq('id', task.id);
  });

  // ─── Vision board header (client-uploaded image, faded into the page) ──
  function renderVisionBand(){
    var band = $('cpVisionBand');
    if (state.view !== 'client' || !portalData) { band.hidden = true; return; }

    var isOwner = !!(currentUser && viewingClientId && currentUser.id === viewingClientId);
    var url = portalData.visionBoardUrl;
    if (!url && !isOwner) { band.hidden = true; return; }

    band.hidden = false;
    band.classList.remove('is-busy');

    var img = $('cpVisionImg');
    if (url) { img.src = url; img.hidden = false; }
    else { img.hidden = true; img.removeAttribute('src'); }

    $('cpVisionEmptyBtn').hidden = !(isOwner && !url);
    $('cpVisionControls').hidden = !(isOwner && url);
  }

  function setVisionBusy(busy){
    $('cpVisionBand').classList.toggle('is-busy', busy);
  }

  $('cpVisionEmptyBtn').addEventListener('click', function(){ $('cpVisionFileInput').click(); });
  $('cpVisionChangeBtn').addEventListener('click', function(){ $('cpVisionFileInput').click(); });

  $('cpVisionRemoveBtn').addEventListener('click', async function(){
    if (!viewingClientId || !portalData) return;
    if (!window.confirm('Remove your vision board image?')) return;
    setVisionBusy(true);
    await sb.storage.from('vision-boards').remove([viewingClientId + '/vision-board']);
    var prevUrl = portalData.visionBoardUrl;
    portalData.visionBoardUrl = '';
    var res = await persistDashPatch({ vision_board_url: '' });
    if (res && res.error) {
      portalData.visionBoardUrl = prevUrl;
      alert('Removing the vision board failed to save: ' + res.error.message);
    }
    setVisionBusy(false);
    renderVisionBand();
  });

  $('cpVisionFileInput').addEventListener('change', async function(){
    var file = this.files && this.files[0];
    this.value = '';
    if (!file || !viewingClientId) return;
    if (!/^image\//.test(file.type)) { alert('Please choose an image file.'); return; }
    if (file.size > 8 * 1024 * 1024) { alert('That image is too large — please choose one under 8MB.'); return; }

    setVisionBusy(true);
    var path = viewingClientId + '/vision-board';
    var { error } = await sb.storage.from('vision-boards').upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      setVisionBusy(false);
      alert('Upload failed: ' + error.message);
      return;
    }

    var { data: pub } = sb.storage.from('vision-boards').getPublicUrl(path);
    var url = pub.publicUrl + '?t=' + Date.now();
    var prevUrl = portalData.visionBoardUrl;
    portalData.visionBoardUrl = url;
    var res = await persistDashPatch({ vision_board_url: url });
    setVisionBusy(false);
    if (res && res.error) {
      portalData.visionBoardUrl = prevUrl;
      alert('The image uploaded, but saving it to your dashboard failed: ' + res.error.message);
    }
    renderVisionBand();
  });

  // ─── Render: coach roster / flags / reminder queue ─────────────────────
  function renderRoster(){
    var h='';
    roster.forEach(function(c){
      h+='<div class="cp-roster-row" data-view-client="'+c.id+'"><span class="cp-roster-name">'+esc(c.name)+'</span><span class="cp-roster-route">'+esc(c.route)+'</span><span class="cp-roster-week">Wk '+c.weekNow+' / '+c.weekTotal+'</span><div><div class="cp-meter"><div class="cp-meter-fill" style="width:'+c.adh+'%;background:'+c.color+'"></div></div><span class="cp-roster-flag">'+esc(c.flag)+'</span></div><span class="cp-roster-next">'+esc(c.next)+'</span><button type="button" class="cp-roster-edit" data-edit-client="'+c.id+'">Edit</button></div>';
    });
    $('cpRosterList').innerHTML = h || '<p class="cp-caption" style="margin:0;">No clients yet.</p>';
  }

  function renderFlags(){
    var h=''; flags.forEach(function(f){ h+='<div class="cp-flag-row"><p class="cp-flag-name">'+esc(f.name)+'</p><p class="cp-flag-why">'+esc(f.why)+'</p></div>'; });
    $('cpFlagList').innerHTML = h || '<p class="cp-caption" style="margin:0;">Nobody flagged.</p>';
  }

  function renderQueue(){
    var h=''; remQueue.forEach(function(q){ h+='<div class="cp-queue-row"><span class="cp-dot" style="background:'+q.color+'"></span><div><p class="cp-queue-name">'+esc(q.name)+'</p><p class="cp-queue-why">'+esc(q.why)+'</p></div></div>'; });
    $('cpQueueList').innerHTML=h;
    $('cpQueueSummary').textContent = remQueue.length + ' queued';
  }

  // ─── Coach: review queue — clients' claimed non-negotiables ────────────
  function renderNonNegQueue(){
    $('cpNonNegQueueSummary').textContent = reviewQueue.length ? (reviewQueue.length + ' waiting on your review.') : 'Nothing to review right now.';
    var h='';
    reviewQueue.forEach(function(r,i){
      h += '<div class="cp-flag-row"><div class="cp-nn-row"><div><p class="cp-flag-name">'+esc(r.clientName)+'</p><p class="cp-flag-why">'+esc(r.label)+'</p></div>'
         + '<div class="cp-nn-actions"><button type="button" class="cp-roster-edit" data-approve-idx="'+i+'">Approve</button><button type="button" class="cp-roster-edit" data-reject-idx="'+i+'">Send back</button></div></div></div>';
    });
    $('cpNonNegQueueList').innerHTML = h;
  }

  $('cpNonNegQueueList').addEventListener('click', async function(e){
    var approveBtn = e.target.closest('[data-approve-idx]');
    var rejectBtn = e.target.closest('[data-reject-idx]');
    if (!approveBtn && !rejectBtn) return;
    var idx = parseInt((approveBtn||rejectBtn).getAttribute(approveBtn?'data-approve-idx':'data-reject-idx'),10);
    var item = reviewQueue[idx]; if (!item) return;

    if (approveBtn) {
      await sb.from('client_nonnegotiables').update({ status:'archived', archived_at:new Date().toISOString() }).eq('id', item.id);
    } else {
      await sb.from('client_nonnegotiables').update({ status:'active', claimed_at:null }).eq('id', item.id);
    }

    await loadRoster();
    if (viewingClientId === item.clientId && portalData) {
      var data = await fetchPortalData(item.clientId);
      if (viewingClientId !== item.clientId) return;
      portalData.nonNegotiables = data.nonNegotiables;
      renderNonNegotiables();
      renderArchive();
    }
  });

  function renderViewToggle(){
    $('cpCoachView').hidden = state.view !== 'coach';
    $('cpPortalTabs').hidden = state.view !== 'client';
    if (state.view === 'client') {
      setPortalTab(state.portalTab || 'portal');
    } else {
      hideAllPortalTabs();
    }
  }

  function findRosterClient(id){
    return roster.filter(function(r){ return r.id === id; })[0];
  }

  $('cpRosterList').addEventListener('click', function(e){
    var editBtn = e.target.closest('[data-edit-client]');
    if (editBtn) {
      e.stopPropagation();
      var eid = editBtn.getAttribute('data-edit-client');
      var ec = findRosterClient(eid);
      openEditPortal(eid, ec ? ec.name : '');
      return;
    }
    var row = e.target.closest('[data-view-client]'); if (!row) return;
    var cid = row.getAttribute('data-view-client');
    var c = findRosterClient(cid);
    enterClientPortalView(cid, c ? c.name : '');
  });

  // ─── Side sheet: notes (dynamic) + reminders (static help copy) ───────
  var REMINDER_HELP = {
    kicker:"Weekly Reminder", title:"How the nudge works",
    lede:"One reminder a week, listing only what is still open.",
    rows:[
      {label:"Send day & time",meta:"Editable",body:"Set from the reminder controls on your dashboard."},
      {label:"What it contains",meta:"Open items only",body:"Just the assignments you haven't checked off."},
      {label:"Channel",meta:"Text · email · push",body:"Pick whichever you'll actually see."}
    ]
  };

  function openSheet(key){
    if (key === 'reminders') {
      renderSheet(REMINDER_HELP.kicker, REMINDER_HELP.title, REMINDER_HELP.lede, REMINDER_HELP.rows, 'reminders');
      return;
    }
    if (key === 'notes') {
      if (!portalData) return;
      var rows = portalData.notes.map(function(n){ return { label:n.label, meta:n.meta, body:n.body }; });
      renderSheet('Session Notes', 'Recaps & decisions', 'Every call ends with a written recap.', rows, 'notes');
      return;
    }
  }

  function renderSheet(kicker, title, lede, rows, stateKey){
    state.openCard = stateKey;
    $('cpSheetKicker').textContent = kicker; $('cpSheetTitle').textContent = title; $('cpSheetLede').textContent = lede;
    var h='';
    rows.forEach(function(r,i){
      var rk = stateKey+':'+i, isOpen = !!state.openRows[rk];
      h+='<div class="cp-sheet-row'+(isOpen?' is-open':'')+'" data-row="'+rk+'"><div class="cp-sheet-row-head"><div><span class="cp-sheet-row-label">'+esc(r.label)+'</span><span class="cp-sheet-row-meta">'+esc(r.meta)+'</span></div><span class="cp-sheet-row-plus">+</span></div><p class="cp-sheet-row-body">'+esc(r.body)+'</p></div>';
    });
    $('cpSheetRows').innerHTML = h || '<p class="cp-caption">Nothing here yet.</p>';
    $('cpSheetOverlay').hidden=false;
  }

  function closeSheet(){ state.openCard=null; $('cpSheetOverlay').hidden=true; }

  document.addEventListener('click',function(e){
    var t=e.target.closest('[data-open]');
    if(t && !e.target.closest('.cp-task-check')) openSheet(t.getAttribute('data-open'));
  });

  $('cpSheetClose').addEventListener('click',closeSheet);
  $('cpSheetBackdrop').addEventListener('click',closeSheet);

  $('cpSheetRows').addEventListener('click',function(e){
    var row=e.target.closest('.cp-sheet-row'); if(!row) return;
    var rk=row.getAttribute('data-row'); state.openRows[rk]=!state.openRows[rk];
    row.classList.toggle('is-open',!!state.openRows[rk]);
  });

  document.addEventListener('keydown',function(e){
    if(e.key!=='Escape') return;
    if(!$('cpSheetOverlay').hidden) closeSheet();
    if(!$('cpEditOverlay').hidden) closeEditPortal();
    if(!$('cpHwFormOverlay').hidden) { closeModal('cpHwFormOverlay'); return; }
    if(!$('cpCurOverlay').hidden) { closeCurriculum(); return; }
    if(!$('cpGoalFormOverlay').hidden) { closeGoalForm(); return; }
    if(!$('cpHwSheetOverlay').hidden) closeHwSheet();
  });

  // ─── Coach: Edit portal ─────────────────────────────────────────────────
  (function(){
    var h = '<option value="">— none —</option>';
    CARDIO_OPTIONS.forEach(function(c){ h += '<option value="'+c.value+'">'+esc(c.label)+'</option>'; });
    $('cpEditCardioType').innerHTML = h;
  })();

  $('cpEditCardioType').addEventListener('change', function(){
    var opt = CARDIO_OPTIONS.filter(function(c){ return c.value === $('cpEditCardioType').value; })[0];
    $('cpEditCardioGoal').placeholder = opt ? opt.hint : 'e.g. 30 min @ zone 2';
  });

  var editSections = {
    cpEditOnboardingList: { items: [], fields: [
      { key:'label', placeholder:'Checklist item', type:'text' }
    ] },
    cpEditNonNegList: { items: [], fields: [
      { key:'label', placeholder:'Non-negotiable', type:'text' }
    ] },
    cpEditTaskList:     { items: [], fields: [
      { key:'label', placeholder:'Task', type:'text' },
      { key:'coreKey', type:'select', options: CORE_DEFS.map(function(c){ return { value:c.key, label:c.label }; }) }
    ] },
    cpEditNoteList:     { items: [], fields: [
      { key:'label', placeholder:'Title', type:'text' },
      { key:'meta', placeholder:'Date', type:'text' },
      { key:'body', placeholder:'Recap', type:'text' }
    ] },
    cpEditMetricList:   { items: [], fields: [
      { key:'label', placeholder:'Label', type:'text' },
      { key:'value', placeholder:'Value', type:'text' }
    ] },
    cpEditResourceList: { items: [], fields: [
      { key:'label', placeholder:'Resource name', type:'text' }
    ] },
    cpEditWinList:      { items: [], fields: [
      { key:'label', placeholder:'Win', type:'text' },
      { key:'meta', placeholder:'When', type:'text' }
    ] },
    cpEditHabitList:    { items: [], fields: [
      { key:'label', placeholder:'Habit', type:'text' }
    ] },
    cpEditGoalList:     { items: [], fields: [
      { key:'title', placeholder:'Goal title', type:'text' },
      { key:'coreKey', type:'select', options: [{value:'',label:'— Core —'}].concat(CORE_DEFS.map(function(c){ return { value:c.key, label:c.label }; })) },
      { key:'targetDate', placeholder:'Target date (YYYY-MM-DD)', type:'text' }
    ] }
  };

  function renderListEditor(containerId){
    var sec = editSections[containerId];
    var h='';
    sec.items.forEach(function(item,i){
      h+='<div class="cp-assign-row">';
      sec.fields.forEach(function(f){
        if (f.type === 'select') {
          h+='<select data-field="'+f.key+'" data-idx="'+i+'">';
          f.options.forEach(function(o){ h+='<option value="'+o.value+'"'+(item[f.key]===o.value?' selected':'')+'>'+esc(o.label)+'</option>'; });
          h+='</select>';
        } else {
          h+='<input type="text" placeholder="'+esc(f.placeholder||'')+'" value="'+esc(item[f.key]==null?'':item[f.key])+'" data-field="'+f.key+'" data-idx="'+i+'" />';
        }
      });
      h+='<button type="button" class="cp-assign-remove" data-remove-idx="'+i+'">×</button></div>';
    });
    $(containerId).innerHTML = h;
  }

  Object.keys(editSections).forEach(function(containerId){
    var el = $(containerId);
    el.addEventListener('input', function(e){
      var t = e.target.closest('[data-field]'); if (!t) return;
      var sec = editSections[containerId];
      sec.items[parseInt(t.getAttribute('data-idx'),10)][t.getAttribute('data-field')] = t.value;
    });
    el.addEventListener('change', function(e){
      var t = e.target.closest('[data-field]'); if (!t) return;
      var sec = editSections[containerId];
      sec.items[parseInt(t.getAttribute('data-idx'),10)][t.getAttribute('data-field')] = t.value;
    });
    el.addEventListener('click', function(e){
      var btn = e.target.closest('[data-remove-idx]'); if (!btn) return;
      var sec = editSections[containerId];
      sec.items.splice(parseInt(btn.getAttribute('data-remove-idx'),10),1);
      renderListEditor(containerId);
    });
  });

  $('cpEditOnboardingAdd').addEventListener('click', function(){ editSections.cpEditOnboardingList.items.push({label:'',done:false}); renderListEditor('cpEditOnboardingList'); });
  $('cpEditNonNegAdd').addEventListener('click', function(){ editSections.cpEditNonNegList.items.push({label:'',status:'active'}); renderListEditor('cpEditNonNegList'); });
  $('cpEditTaskAdd').addEventListener('click', function(){ editSections.cpEditTaskList.items.push({label:'',coreKey:CORE_DEFS[0].key,done:false}); renderListEditor('cpEditTaskList'); });
  $('cpEditNoteAdd').addEventListener('click', function(){ editSections.cpEditNoteList.items.push({label:'',meta:'',body:''}); renderListEditor('cpEditNoteList'); });
  $('cpEditMetricAdd').addEventListener('click', function(){ editSections.cpEditMetricList.items.push({label:'',value:''}); renderListEditor('cpEditMetricList'); });
  $('cpEditResourceAdd').addEventListener('click', function(){ editSections.cpEditResourceList.items.push({label:'',color:'#2a9df0'}); renderListEditor('cpEditResourceList'); });
  $('cpEditWinAdd').addEventListener('click', function(){ editSections.cpEditWinList.items.push({label:'',meta:'',color:'#77d770'}); renderListEditor('cpEditWinList'); });
  $('cpEditHabitAdd').addEventListener('click', function(){ editSections.cpEditHabitList.items.push({label:'',done:false}); renderListEditor('cpEditHabitList'); });
  $('cpEditGoalAdd').addEventListener('click', function(){ editSections.cpEditGoalList.items.push({title:'',description:'',coreKey:'',targetDate:'',status:'not_started',progress:0,createdBy:'coach'}); renderListEditor('cpEditGoalList'); });

  function renderCoreEditor(){
    var h='';
    editState.cores.forEach(function(c,i){
      h+='<div class="cp-assign-row"><span class="cp-core-edit-label">'+esc(c.label)+'</span><input type="number" min="0" max="100" value="'+c.pct+'" data-core-idx="'+i+'" data-core-field="pct" style="width:70px;flex:none;" /><input type="text" value="'+esc(c.note)+'" placeholder="Note" data-core-idx="'+i+'" data-core-field="note" /></div>';
    });
    $('cpEditCoreList').innerHTML = h;
  }

  $('cpEditCoreList').addEventListener('input', function(e){
    var t = e.target.closest('[data-core-field]'); if (!t || !editState) return;
    var idx = parseInt(t.getAttribute('data-core-idx'),10);
    var field = t.getAttribute('data-core-field');
    editState.cores[idx][field] = field === 'pct' ? (parseInt(t.value,10) || 0) : t.value;
  });

  async function openEditPortal(clientId, name){
    editState = null;
    $('cpEditTitle').textContent = name;
    $('cpEditSave').disabled = true;
    $('cpEditOverlay').hidden = false;

    var data = await fetchPortalData(clientId);
    editState = data;

    $('cpEditRoute').value = editState.route;
    $('cpEditWeekNow').value = editState.weekNow;
    $('cpEditWeekTotal').value = editState.weekTotal;
    $('cpEditStreak').value = editState.streakWeeks;
    $('cpEditAdherence').value = editState.adherencePct;
    $('cpEditFlagStatus').value = editState.flagStatus;
    $('cpEditSessionLabel').value = editState.nextSessionLabel;
    $('cpEditSessionAgenda').value = editState.nextSessionAgenda;
    $('cpEditReminderDay').value = editState.reminderDay;
    $('cpEditReminderChannel').value = editState.reminderChannel;
    $('cpEditReminderOn').checked = editState.reminderOn;
    $('cpEditCardioType').value = editState.preferredCardio;
    $('cpEditCardioType').dispatchEvent(new Event('change'));
    $('cpEditCardioGoal').value = editState.cardioGoal;
    $('cpEditTrainerizeUrl').value = editState.trainerizeUrl;

    renderCoreEditor();

    editSections.cpEditOnboardingList.items = editState.onboardingItems;
    editSections.cpEditNonNegList.items = editState.nonNegotiables.filter(function(t){ return t.status !== 'archived'; });
    editSections.cpEditTaskList.items = editState.tasks;
    editSections.cpEditNoteList.items = editState.notes;
    editSections.cpEditMetricList.items = editState.metrics;
    editSections.cpEditResourceList.items = editState.resources;
    editSections.cpEditWinList.items = editState.wins;
    editSections.cpEditHabitList.items = editState.habits;
    editSections.cpEditGoalList.items = editState.goals.map(function(g){ return { id:g.id, title:g.title, description:g.description, coreKey:g.coreKey, targetDate:g.targetDate, status:g.status, progress:g.progress, createdBy:g.createdBy }; });
    Object.keys(editSections).forEach(renderListEditor);

    $('cpEditorPreviewKicker').textContent = 'What ' + (name.split(' ')[0] || 'they') + ' sees';
    scrollToEditorSection('overview');
    $('cpEditorScroll').scrollTop = 0;
    renderEditorPreview();

    $('cpEditSave').disabled = false;
  }

  function renderEditorPreview(){
    if (!editState) return;

    var h = '';
    editState.cores.forEach(function(c){
      h += '<div class="cp-editor-preview-core-row"><div class="cp-editor-preview-core-top">'
         + '<span class="cp-dot" style="background:'+c.color+'"></span>'
         + '<span class="cp-core-label">'+esc(c.label)+'</span>'
         + '<span class="cp-core-pct">'+(parseInt(c.pct,10)||0)+'%</span></div>'
         + '<div class="cp-meter"><div class="cp-meter-fill" style="width:'+(parseInt(c.pct,10)||0)+'%;background:'+c.color+'"></div></div></div>';
    });
    $('cpEditorPreviewCores').innerHTML = h;

    var openTasks = editSections.cpEditTaskList.items.filter(function(t){ return (t.label||'').trim() && !t.done; });
    $('cpEditorPreviewReminder').textContent = ($('cpEditReminderDay').value || 'Monday') + ' by ' + ($('cpEditReminderChannel').value || 'text')
      + ' — ' + openTasks.length + ' open item' + (openTasks.length === 1 ? '' : 's') + '.';

    var th = '';
    editSections.cpEditTaskList.items.forEach(function(t){
      if (!(t.label||'').trim()) return;
      th += '<div class="cp-editor-preview-task"><span class="cp-check"></span><span class="cp-label">'+esc(t.label)+'</span></div>';
    });
    $('cpEditorPreviewTasks').innerHTML = th || '<p class="cp-caption" style="margin:9px 0 0;">No tasks assigned.</p>';

    $('cpEditorPreviewSession').textContent = $('cpEditSessionLabel').value || 'Not scheduled';
    $('cpEditorPreviewAgenda').textContent = $('cpEditSessionAgenda').value || '';
  }

  $('cpEditOverlay').addEventListener('input', renderEditorPreview);
  $('cpEditOverlay').addEventListener('change', renderEditorPreview);

  function closeEditPortal(){ editState = null; $('cpEditOverlay').hidden = true; }

  async function syncListTable(table, clientId, rows, conflictKey){
    if (conflictKey) {
      return sb.from(table).upsert(rows, { onConflict: 'client_id,' + conflictKey });
    }
    await sb.from(table).delete().eq('client_id', clientId);
    if (rows.length) return sb.from(table).insert(rows);
  }

  // Non-negotiables get their own sync: it only replaces active/claimed rows,
  // leaving archived rows (the client's confirmed history) untouched.
  async function syncNonNegotiables(clientId, rows){
    await sb.from('client_nonnegotiables').delete().eq('client_id', clientId).neq('status','archived');
    if (rows.length) return sb.from('client_nonnegotiables').insert(rows);
  }

  $('cpEditSave').addEventListener('click', async function(){
    if (!editState) return;
    var clientId = editState.clientId;
    setLoading($('cpEditSave'), true, 'Saving…');

    var flagVal = $('cpEditFlagStatus').value;
    var dashRow = {
      client_id: clientId,
      route: $('cpEditRoute').value.trim(),
      week_now: parseInt($('cpEditWeekNow').value,10) || 0,
      week_total: parseInt($('cpEditWeekTotal').value,10) || 0,
      streak_weeks: parseInt($('cpEditStreak').value,10) || 0,
      adherence_pct: parseInt($('cpEditAdherence').value,10) || 0,
      flag_status: flagVal,
      flag_color: FLAG_COLORS[flagVal] || '#77d770',
      next_session_label: $('cpEditSessionLabel').value.trim(),
      next_session_agenda: $('cpEditSessionAgenda').value.trim(),
      reminder_day: $('cpEditReminderDay').value,
      reminder_channel: $('cpEditReminderChannel').value,
      reminder_on: $('cpEditReminderOn').checked,
      preferred_cardio: $('cpEditCardioType').value,
      cardio_goal: $('cpEditCardioGoal').value.trim(),
      trainerize_url: $('cpEditTrainerizeUrl').value.trim()
    };

    var onboardingRows = editState.onboardingItems.filter(function(t){ return (t.label||'').trim(); }).map(function(t,i){
      return { client_id: clientId, label: t.label.trim(), done: !!t.done, position:i };
    });

    var coreRows = editState.cores.map(function(c,i){
      return { client_id: clientId, core_key: c.key, label: c.label, color: c.color, pct: parseInt(c.pct,10)||0, note: c.note||'', position:i };
    });
    var taskRows = editState.tasks.filter(function(t){ return (t.label||'').trim(); }).map(function(t,i){
      return { client_id: clientId, label: t.label.trim(), core_key: t.coreKey||'', color: coreColor(t.coreKey), done: !!t.done, position:i };
    });
    var noteRows = editState.notes.filter(function(n){ return (n.label||'').trim(); }).map(function(n){
      return { client_id: clientId, label: n.label.trim(), meta: n.meta||'', body: n.body||'' };
    });
    var metricRows = editState.metrics.filter(function(m){ return (m.label||'').trim(); }).map(function(m,i){
      return { client_id: clientId, label: m.label.trim(), value: m.value||'', position:i };
    });
    var resourceRows = editState.resources.filter(function(r){ return (r.label||'').trim(); }).map(function(r,i){
      return { client_id: clientId, label: r.label.trim(), color: r.color||'#2a9df0', position:i };
    });
    var winRows = editState.wins.filter(function(w){ return (w.label||'').trim(); }).map(function(w,i){
      return { client_id: clientId, label: w.label.trim(), meta: w.meta||'', color: w.color||'#77d770', position:i };
    });
    var nonNegRows = editSections.cpEditNonNegList.items.filter(function(t){ return (t.label||'').trim(); }).map(function(t,i){
      return { client_id: clientId, label: t.label.trim(), status: t.status || 'active', claimed_at: t.claimedAt || null, position:i };
    });
    var habitRows = editState.habits.filter(function(h){ return (h.label||'').trim(); }).map(function(h,i){
      return { client_id: clientId, label: h.label.trim(), done: !!h.done, position:i };
    });

    var goalRows = editSections.cpEditGoalList.items.filter(function(g){ return (g.title||'').trim(); }).map(function(g){
      // Re-inserted with their original id/description/progress so a save
      // here doesn't wipe what was set from the Goals tab.
      var row = { client_id: clientId, title: g.title.trim(), description: g.description||'', core_key: g.coreKey||'', target_date: g.targetDate||null, status: g.status||'not_started', progress: g.progress||0, created_by: g.createdBy||'coach' };
      if (g.id) row.id = g.id;
      return row;
    });

    var results = await Promise.all([
      sb.from('client_dashboard').upsert(dashRow, { onConflict: 'client_id' }),
      syncListTable('client_cores', clientId, coreRows, 'core_key'),
      syncListTable('client_onboarding_items', clientId, onboardingRows),
      syncListTable('client_tasks', clientId, taskRows),
      syncListTable('client_notes', clientId, noteRows),
      syncListTable('client_metrics', clientId, metricRows),
      syncListTable('client_resources', clientId, resourceRows),
      syncListTable('client_wins', clientId, winRows),
      syncNonNegotiables(clientId, nonNegRows),
      syncListTable('client_habits', clientId, habitRows),
      syncListTable('client_goals', clientId, goalRows)
    ]);

    var saveError = results.map(function(r){ return r && r.error; }).filter(Boolean)[0];
    setLoading($('cpEditSave'), false, 'Save');
    if (saveError) {
      console.error('Failed to save portal edits:', saveError);
      alert('Saving failed: ' + saveError.message);
      return;
    }
    closeEditPortal();
    await loadRoster();
    if (viewingClientId === clientId) {
      var c = findRosterClient(clientId);
      loadClientPortal(clientId, c ? c.name : '');
    }
  });

  $('cpEditCancel').addEventListener('click',closeEditPortal);
  $('cpEditClose').addEventListener('click',closeEditPortal);
  $('cpEditBack').addEventListener('click',closeEditPortal);

  // ─── Editor: section jump nav + scrollspy ──────────────────────────────
  var EDITOR_SECTIONS = ['overview','cores','plan','progress','goals','library'];

  function scrollToEditorSection(id){
    var root = $('cpEditorScroll');
    var target = root.querySelector('[data-editor-sec="'+id+'"]');
    if (target) root.scrollTop = target.offsetTop - 16;
    setActiveEditorNav(id);
  }

  function setActiveEditorNav(id){
    $('cpEditorNav').querySelectorAll('[data-editor-jump]').forEach(function(btn){
      btn.classList.toggle('is-active', btn.getAttribute('data-editor-jump') === id);
    });
  }

  $('cpEditorNav').addEventListener('click', function(e){
    var btn = e.target.closest('[data-editor-jump]'); if (!btn) return;
    scrollToEditorSection(btn.getAttribute('data-editor-jump'));
  });

  $('cpEditorScroll').addEventListener('scroll', function(){
    var root = $('cpEditorScroll');
    var current = EDITOR_SECTIONS[0];
    EDITOR_SECTIONS.forEach(function(id){
      var el = root.querySelector('[data-editor-sec="'+id+'"]');
      if (el && el.offsetTop - 60 <= root.scrollTop) current = id;
    });
    setActiveEditorNav(current);
  });

})();
