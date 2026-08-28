(function () {

  // Read the auth link type (recovery / invite / magiclink) before Supabase
  // processes and clears the URL hash.
  var urlAuthType = (function(){
    var raw = (window.location.hash || '') + ' ' + (window.location.search || '');
    var m = raw.match(/type=([a-z]+)/);
    return m ? m[1] : null;
  })();

  // ─── Config ───────────────────────────────────────────────────────────
  var SUPABASE_URL = 'https://datrgkjqwyfcbmtwwifm.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_HrGR9fNaldor1FvDa0sDWA_VM3EPTZ9';
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
  // wins, messages) is a free-form list per client, loaded from Supabase.
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

  var FLAG_COLORS = { 'On track':'#77d770', 'Needs a nudge':'#f58b1c', 'At risk':'#f02348' };

  var remDays  = ["Monday","Tuesday","Sunday"];
  var remChans = ["text","email","push"];

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

  var roster = [];          // coach view: [{id,name,route,weekNow,weekTotal,adh,flag,color,next,...}]
  var flags = [];
  var remQueue = [];

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
      if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
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

  // ─── Show dashboard ───────────────────────────────────────────────────
  async function showDash(user){
    // Get profile from Supabase (role + name)
    var { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).single();

    if (needsPassword || (profile && profile.has_password === false)) {
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
      $('cpWelcome').textContent   = 'Welcome back, ' + firstNameOf(profile, user) + '.';
      $('cpRouteLine').textContent = 'Coach Dashboard';
      renderViewToggle();
      loadRoster();
    } else {
      state.view = 'client';
      loadClientPortal(user.id, firstNameOf(profile, user));
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
      sb.from('client_messages').select('*').eq('client_id', clientId).order('created_at', { ascending:true })
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
      cores: cores,
      tasks: (results[2].data || []).map(function(t){ return { id:t.id, label:t.label, coreKey:t.core_key, color:t.color, done:t.done }; }),
      notes: (results[3].data || []).map(function(n){ return { id:n.id, label:n.label, meta:n.meta, body:n.body }; }),
      metrics: (results[4].data || []).map(function(m){ return { id:m.id, label:m.label, value:m.value }; }),
      resources: (results[5].data || []).map(function(r){ return { id:r.id, label:r.label, color:r.color }; }),
      wins: (results[6].data || []).map(function(w){ return { id:w.id, label:w.label, meta:w.meta, color:w.color }; }),
      messages: (results[7].data || []).map(function(m){ return { id:m.id, sender:m.sender, body:m.body, createdAt:m.created_at }; })
    };
  }

  async function loadClientPortal(clientId, displayName){
    viewingClientId = clientId;
    portalData = null;
    $('cpWelcome').textContent = 'Welcome to Your Race, ' + displayName + '.';
    $('cpRouteLine').textContent = 'Loading…';

    var data = await fetchPortalData(clientId);
    if (viewingClientId !== clientId) return; // superseded by a newer view

    portalData = data;
    $('cpRouteLine').textContent = (data.route || 'No route set yet') + ' · Week ' + data.weekNow + ' of ' + data.weekTotal;
    $('cpRoute').textContent = data.route || '—';
    $('cpWeek').textContent  = 'Week ' + data.weekNow + ' of ' + data.weekTotal;
    $('cpWeekLine2').textContent = 'Week ' + data.weekNow + ' of ' + data.weekTotal;
    $('cpStreakLine').textContent = data.streakWeeks > 0 ? (data.streakWeeks + '-week streak') : 'No active streak';

    renderClientPortal();
    renderViewToggle();
    calLoadForClient(clientId);
  }

  // ─── Coach: roster (loaded from every client's profile + dashboard row) ─
  async function loadRoster(){
    var { data: profs } = await sb.from('profiles').select('id, full_name, email, role');
    var clients = (profs || []).filter(function(p){ return p.role !== 'coach' && p.email !== COACH_EMAIL; });
    var ids = clients.map(function(p){ return p.id; });

    var dashRows = [], taskRows = [];
    if (ids.length) {
      var results = await Promise.all([
        sb.from('client_dashboard').select('*').in('client_id', ids),
        sb.from('client_tasks').select('client_id, done').in('client_id', ids)
      ]);
      dashRows = results[0].data || [];
      taskRows = results[1].data || [];
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
        name: p.full_name || p.email,
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

    renderRoster(); renderFlags(); renderQueue();
  }

  // ─── Coach: open a client's portal to see what they see ───────────────
  function enterClientPortalView(clientId, name){
    state.view = 'client';
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
    renderViewToggle();
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
    renderBars();
    renderNotesCard();
    renderMetrics();
    renderChips();
    renderWins();
    renderSessionCard();
    renderMessages();
    renderReminder();
  }

  function renderCoreList(){
    var h=''; portalData.cores.forEach(function(c){ h+='<div class="cp-core-row"><div class="cp-core-row-top"><span class="cp-dot" style="background:'+c.color+'"></span><span class="cp-core-label">'+esc(c.label)+'</span><span class="cp-core-pct">'+c.pct+'%</span></div><div class="cp-meter"><div class="cp-meter-fill" style="width:'+c.pct+'%;background:'+c.color+'"></div></div></div>'; });
    $('cpCoreList').innerHTML=h;
  }

  function renderTasks(){
    var h='';
    portalData.tasks.forEach(function(t,i){
      var color = t.color || coreColor(t.coreKey);
      h+='<div class="cp-task-row"><button type="button" class="cp-task-check'+(t.done?' is-done':'')+'" data-idx="'+i+'">'+(t.done?'✓':'')+'</button><span class="cp-dot" style="background:'+color+'"></span><span class="cp-task-label'+(t.done?' is-done':'')+'">'+esc(t.label)+'</span><span class="cp-task-meta">'+esc(t.coreKey||'')+'</span></div>';
    });
    $('cpTaskList').innerHTML = h || '<p class="cp-caption" style="margin:0;">No assignments yet.</p>';
    $('cpTaskCount').textContent = portalData.tasks.length + (portalData.tasks.length===1?' assignment':' assignments');
  }

  function renderBars(){
    var vals = portalData.adherenceHistory || [];
    if (!vals.length) { $('cpBars').innerHTML = '<p class="cp-caption" style="margin:0;">No history yet.</p>'; return; }
    var max=Math.max.apply(null,vals), h='';
    vals.forEach(function(v){ var ht=Math.round((v/max)*78),bg=v>=70?'#071f35':'rgba(7,31,53,0.16)'; h+='<div class="cp-bar" style="height:'+ht+'px;background:'+bg+'"></div>'; });
    $('cpBars').innerHTML=h;
  }

  function renderNotesCard(){
    var recent = portalData.notes.slice(0,4);
    var h=''; recent.forEach(function(n){ h+='<div class="cp-note-row"><span class="cp-note-label">'+esc(n.label)+'</span><span class="cp-note-meta">'+esc(n.meta)+'</span></div>'; });
    $('cpNoteList').innerHTML = h || '<p class="cp-caption" style="margin:0;">No session notes yet.</p>';
  }

  function renderWins(){
    var h=''; portalData.wins.forEach(function(w){ h+='<div class="cp-win-row"><span class="cp-dot" style="background:'+(w.color||'#77d770')+'"></span><span class="cp-win-label">'+esc(w.label)+'</span><span class="cp-win-meta">'+esc(w.meta)+'</span></div>'; });
    $('cpWinList').innerHTML = h || '<p class="cp-caption" style="margin:0;">No wins logged yet.</p>';
  }

  function renderMetrics(){
    var h=''; portalData.metrics.forEach(function(m){ h+='<div class="cp-metric-row"><span class="cp-metric-label">'+esc(m.label)+'</span><span class="cp-metric-value">'+esc(m.value)+'</span></div>'; });
    $('cpMetricList').innerHTML = h || '<p class="cp-caption" style="margin:0;">No metrics yet.</p>';
  }

  function renderChips(){
    var h=''; portalData.resources.forEach(function(r){ h+='<span class="cp-chip"><span class="cp-dot" style="background:'+(r.color||'#2a9df0')+'"></span>'+esc(r.label)+'</span>'; });
    $('cpResourceChips').innerHTML = h || '<p class="cp-caption" style="margin:0;">Nothing assigned yet.</p>';
  }

  function renderSessionCard(){
    $('cpSessionLabel').textContent = portalData.nextSessionLabel || 'Not scheduled yet';
    $('cpSessionAgenda').textContent = portalData.nextSessionAgenda || 'Your coach hasn\'t set an agenda yet.';
  }

  function renderMessages(){
    var recent = portalData.messages.slice(-6);
    var h=''; recent.forEach(function(m){
      var who = m.sender === 'coach' ? 'Coach' : 'Client';
      var when = m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '';
      h+='<div class="cp-message"><p class="cp-message-meta">'+esc(who)+(when?' · '+esc(when):'')+'</p><p class="cp-message-body">'+esc(m.body)+'</p></div>';
    });
    $('cpMessageList').innerHTML = h || '<p class="cp-caption" style="margin:0;">No messages yet.</p>';
  }

  $('cpMessageInput').addEventListener('keydown', async function(e){
    if (e.key !== 'Enter') return;
    var body = this.value.trim();
    if (!body || !viewingClientId) return;
    var clientId = viewingClientId;
    this.value = '';
    var sender = isCoachUser ? 'coach' : 'client';
    await sb.from('client_messages').insert({ client_id: clientId, sender: sender, body: body });
    if (viewingClientId !== clientId) return;
    var { data } = await sb.from('client_messages').select('*').eq('client_id', clientId).order('created_at', { ascending:true });
    portalData.messages = (data || []).map(function(m){ return { id:m.id, sender:m.sender, body:m.body, createdAt:m.created_at }; });
    renderMessages();
  });

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
        allDay: allDay
      };
    });
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
        allDay: allDay
      };
    });
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

    // Best-effort silent reconnect so returning clients don't have to click
    // "Connect" again every visit. Falls back to "Reconnect" if it can't.
    if (calState.google.connected) {
      calRequestGoogleToken(true).then(async function(token){
        if (viewingClientId !== clientId) return;
        calState.google.token = token;
        calState.google.needsReconnect = false;
        calState.google.events = await calFetchGoogleEvents(token);
        if (viewingClientId === clientId) calRenderCard();
      }).catch(function(){ /* leave needsReconnect true */ });
    }
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
        + '<p class="cp-cal-event-meta"><span class="cp-cal-provider-dot" style="background:' + dotColor[ev.provider] + '"></span>' + (ev.provider === 'google' ? 'Google Calendar' : 'Outlook') + '</p>'
        + '</div></div>';
    });
    $('cpCalEventList').innerHTML = h;
  }

  function calRenderCard(){
    $('cpCalendarCard').hidden = isCoachUser;
    if (isCoachUser) return;
    calRenderButtons();
    calRenderEvents();
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

  function persistReminderPatch(patch){
    if (!viewingClientId) return;
    var row = Object.assign({ client_id: viewingClientId }, patch);
    sb.from('client_dashboard').upsert(row, { onConflict: 'client_id' });
  }

  $('cpRemDay').addEventListener('click', function(){
    if (!portalData) return;
    var idx = remDays.indexOf(portalData.reminderDay);
    portalData.reminderDay = remDays[(idx+1+remDays.length) % remDays.length];
    renderReminder();
    persistReminderPatch({ reminder_day: portalData.reminderDay });
  });

  $('cpRemChannel').addEventListener('click', function(){
    if (!portalData) return;
    var idx = remChans.indexOf(portalData.reminderChannel);
    portalData.reminderChannel = remChans[(idx+1+remChans.length) % remChans.length];
    renderReminder();
    persistReminderPatch({ reminder_channel: portalData.reminderChannel });
  });

  $('cpRemToggle').addEventListener('click', function(){
    if (!portalData) return;
    portalData.reminderOn = !portalData.reminderOn;
    renderReminder();
    persistReminderPatch({ reminder_on: portalData.reminderOn });
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

  function renderViewToggle(){
    $('cpClientView').hidden = state.view !== 'client';
    $('cpCoachView').hidden = state.view !== 'coach';
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
  });

  // ─── Coach: Edit portal ─────────────────────────────────────────────────
  var editSections = {
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

  $('cpEditTaskAdd').addEventListener('click', function(){ editSections.cpEditTaskList.items.push({label:'',coreKey:CORE_DEFS[0].key,done:false}); renderListEditor('cpEditTaskList'); });
  $('cpEditNoteAdd').addEventListener('click', function(){ editSections.cpEditNoteList.items.push({label:'',meta:'',body:''}); renderListEditor('cpEditNoteList'); });
  $('cpEditMetricAdd').addEventListener('click', function(){ editSections.cpEditMetricList.items.push({label:'',value:''}); renderListEditor('cpEditMetricList'); });
  $('cpEditResourceAdd').addEventListener('click', function(){ editSections.cpEditResourceList.items.push({label:'',color:'#2a9df0'}); renderListEditor('cpEditResourceList'); });
  $('cpEditWinAdd').addEventListener('click', function(){ editSections.cpEditWinList.items.push({label:'',meta:'',color:'#77d770'}); renderListEditor('cpEditWinList'); });

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

    renderCoreEditor();

    editSections.cpEditTaskList.items = editState.tasks;
    editSections.cpEditNoteList.items = editState.notes;
    editSections.cpEditMetricList.items = editState.metrics;
    editSections.cpEditResourceList.items = editState.resources;
    editSections.cpEditWinList.items = editState.wins;
    Object.keys(editSections).forEach(renderListEditor);

    $('cpEditSave').disabled = false;
  }

  function closeEditPortal(){ editState = null; $('cpEditOverlay').hidden = true; }

  async function syncListTable(table, clientId, rows, conflictKey){
    if (conflictKey) {
      return sb.from(table).upsert(rows, { onConflict: 'client_id,' + conflictKey });
    }
    await sb.from(table).delete().eq('client_id', clientId);
    if (rows.length) return sb.from(table).insert(rows);
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
      reminder_on: $('cpEditReminderOn').checked
    };

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

    await Promise.all([
      sb.from('client_dashboard').upsert(dashRow, { onConflict: 'client_id' }),
      syncListTable('client_cores', clientId, coreRows, 'core_key'),
      syncListTable('client_tasks', clientId, taskRows),
      syncListTable('client_notes', clientId, noteRows),
      syncListTable('client_metrics', clientId, metricRows),
      syncListTable('client_resources', clientId, resourceRows),
      syncListTable('client_wins', clientId, winRows)
    ]);

    setLoading($('cpEditSave'), false, 'Save');
    closeEditPortal();
    await loadRoster();
    if (viewingClientId === clientId) {
      var c = findRosterClient(clientId);
      loadClientPortal(clientId, c ? c.name : '');
    }
  });

  $('cpEditCancel').addEventListener('click',closeEditPortal);
  $('cpEditClose').addEventListener('click',closeEditPortal);
  $('cpEditBackdrop').addEventListener('click',closeEditPortal);

})();
