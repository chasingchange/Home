(function () {

  // ─── Config ───────────────────────────────────────────────────────────
  var SUPABASE_URL = 'https://datrgkjqwyfcbmtwwifm.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_HrGR9fNaldor1FvDa0sDWA_VM3EPTZ9';
  var COACH_EMAIL  = 'tywadebusiness@gmail.com';

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // ─── Demo data (same as original — swap per-client later) ────────────
  var route    = "The 10K";
  var weekLine = "week 14 of 26";

  var cores = [
    { n:"01", label:"Body",   color:"#77d770", pct:78, note:"Strength split + meal rotation" },
    { n:"02", label:"Mind",   color:"#2a9df0", pct:64, note:"3-task weekly execution filter" },
    { n:"03", label:"Art",    color:"#ffbd59", pct:41, note:"Weekly creative block held" },
    { n:"04", label:"Soul",   color:"#aa70d7", pct:52, note:"Sleep anchor + weekly reflection" },
    { n:"05", label:"Career", color:"#f02348", pct:70, note:"5Ps audit complete" },
    { n:"06", label:"Life",   color:"#f58b1c", pct:35, note:"Calendar architecture in progress" }
  ];

  var taskData = [
    { id:"t1", label:"Lower strength session — squat wave 3",        color:"#77d770", meta:"Body" },
    { id:"t2", label:"Hit 2,650 kcal on four weekdays",              color:"#77d770", meta:"Body" },
    { id:"t3", label:"Sunday reset: plan the three tasks",           color:"#2a9df0", meta:"Mind" },
    { id:"t4", label:"90-minute creative block, phone out of room",  color:"#ffbd59", meta:"Art"  },
    { id:"t5", label:"Lights out by 10:45 — five nights",           color:"#aa70d7", meta:"Soul" },
    { id:"t6", label:"Draft the 5Ps pay/place notes for Thursday",   color:"#f02348", meta:"Career" }
  ];

  var details = {
    plan:      { kicker:"This Week", title:"Week 14 assignments", lede:"Six assignments across three active cores. Everything here was set on Thursday's call.", rows:[ {label:"Body — training",meta:"4 sessions",body:"Squat wave 3 on Monday, upper push Tuesday, lower accessory Friday, optional conditioning Saturday."},{label:"Body — nutrition",meta:"2,650 kcal",body:"Four weekday hits is the target. Use the five-meal rotation."},{label:"Mind — weekly reset",meta:"Sunday",body:"Three tasks, written down, before the week starts."},{label:"Art — creative block",meta:"90 min",body:"One block, phone in another room, project roadmap open."},{label:"Soul — sleep anchor",meta:"5 nights",body:"Lights out by 10:45. This is the anchor the rest of the week hangs on."} ] },
    cores:     { kicker:"Six Core System", title:"Structure installed to date", lede:"Each core is scored on structure in place, not effort spent.", rows:[ {label:"Body Core",meta:"78%",body:"Personalized weekly split, calorie targets, five-meal rotation, and travel matrix live."},{label:"Mind Core",meta:"64%",body:"Three-task execution framework and weekly reset running."},{label:"Art Core",meta:"41%",body:"Weekly creative block on the calendar four weeks running."},{label:"Soul Core",meta:"52%",body:"Sleep rhythm anchoring and weekly reflection in place."},{label:"Career Core",meta:"70%",body:"5Ps alignment audit complete — place unresolved."},{label:"Life Core",meta:"35%",body:"Opens in week 18. Calendar architecture is the first block."} ] },
    session:   { kicker:"Upcoming Session", title:"Thursday, 9:00 AM", lede:"45 minutes with Tyler.", rows:[ {label:"Agenda",meta:"45 min",body:"Travel week adjustments, the 5Ps place question, and Art block cadence."},{label:"Bring with you",meta:"Prep",body:"Your pay/place notes and which two assignments felt heaviest."},{label:"Reschedule window",meta:"Open",body:"Any slot Tuesday through Friday before noon."} ] },
    notes:     { kicker:"Session Notes", title:"Recaps & decisions", lede:"Every call ends with a written recap.", rows:[ {label:"Week 13 recap",meta:"Aug 14",body:"Held Art block at weekly. Lower session moved to Friday for travel."},{label:"Week 12 recap",meta:"Aug 7",body:"Squat wave reset. Added five-meal rotation."},{label:"Week 11 recap",meta:"Jul 31",body:"5Ps audit run. Place scored low."},{label:"Week 10 recap",meta:"Jul 24",body:"First full week with three-task filter."} ] },
    streaks:   { kicker:"Consistency", title:"Fourteen weeks of adherence", lede:"Adherence is measured against the assignments set that week.", rows:[ {label:"Current streak",meta:"6 weeks",body:"Six consecutive weeks above 70% adherence."},{label:"Weakest link",meta:"Sleep",body:"The sleep anchor slips first in a heavy week."},{label:"Minimum viable week",meta:"Fallback",body:"Two sessions, one creative block, Sunday reset."} ] },
    metrics:   { kicker:"Body Metrics", title:"Trend & progress photos", lede:"Weekly bodyweight trend, strength markers, and a photo every fourteen days.", rows:[ {label:"Bodyweight trend",meta:"-8.4 lb",body:"Down 8.4 lb over 14 weeks — inside the target band."},{label:"Strength markers",meta:"3 lifts",body:"Squat, bench, and row all up. Squat +35 lb since week one."},{label:"Progress photos",meta:"Every 14 days",body:"Same lighting, same time of day, same angles. Private to you and your coach."} ] },
    library:   { kicker:"Resource Library", title:"Assigned to you", lede:"Tools filtered to the cores you have open right now.", rows:[ {label:"Split Sculptor",meta:"Body",body:"Your current weekly split including the travel substitution matrix."},{label:"Macro Calculator",meta:"Body",body:"Set to 2,650 kcal at your current bodyweight."},{label:"1RM Calculator",meta:"Body",body:"Used to set squat wave percentages."},{label:"5 Ps Career Fit Calculator",meta:"Career",body:"Re-run it after the place conversation."},{label:"I AM Worksheet",meta:"Mind",body:"Assigned for week 15 alongside the friction audit."} ] },
    messages:  { kicker:"Messages", title:"Between sessions", lede:"Direct coach access for things that can't wait for Thursday.", rows:[ {label:"Tyler",meta:"Yesterday",body:"Swap Thursday's lower session to Friday — travel week."},{label:"You",meta:"2 days ago",body:"Flight moved to Thursday morning. Training is the thing at risk."},{label:"Tyler",meta:"Last week",body:"Six days of adherence with no extra time spent."} ] },
    reminders: { kicker:"Weekly Reminder", title:"How the nudge works", lede:"One reminder a week, listing only what is still open.", rows:[ {label:"Send day & time",meta:"Editable",body:"Default is Tuesday at 7:00 AM."},{label:"What it contains",meta:"Open items only",body:"Just the assignments you haven't checked off, grouped by core."},{label:"Channel",meta:"Text · email · push",body:"Text by default."},{label:"If the week is broken",meta:"Fallback",body:"Switches to minimum viable week."},{label:"Escalation",meta:"Silence after 5 days",body:"No activity for five days and your coach sees it in their queue."} ] },
    wins:      { kicker:"Milestones", title:"Wins on record", lede:"Logged as they happen, so a slow week has context.", rows:[ {label:"Squat +35 lb",meta:"Week 12",body:"From the week-one baseline, with bodyweight down 8 lb."},{label:"Six-week streak",meta:"Week 14",body:"Longest run of green weeks since starting."},{label:"Creative block held 4 weeks",meta:"Week 13",body:"First time creative work survived a busy stretch."},{label:"5Ps audit complete",meta:"Week 11",body:"First structured read on whether the current role supports the direction."} ] }
  };

  var roster = [
    {name:"Marcus T.", route:"The 10K",     week:"Wk 14 / 26",adh:86,flag:"On track",     color:"#77d770",next:"Tue 9:00 AM"},
    {name:"Devon R.",  route:"The Marathon", week:"Wk 22 / 39",adh:74,flag:"On track",     color:"#77d770",next:"Tue 4:30 PM"},
    {name:"Priya S.",  route:"The 5K",       week:"Wk 6 / 12", adh:58,flag:"Needs a nudge",color:"#f58b1c",next:"Wed 8:00 AM"},
    {name:"Alex M.",   route:"The 10K",      week:"Wk 3 / 26", adh:91,flag:"On track",     color:"#77d770",next:"Wed 12:00 PM"},
    {name:"Jamie L.",  route:"The 5K",       week:"Wk 9 / 12", adh:34,flag:"At risk",      color:"#f02348",next:"Thu 7:30 AM"}
  ];

  var flags = [
    {name:"Jamie L.", why:"Two missed calls and no check-in for 11 days. Route ends in three weeks."},
    {name:"Priya S.", why:"Training adherence fine, sleep anchor slipping four weeks running."},
    {name:"Devon R.", why:"Life Core opens next week — calendar audit not sent yet."}
  ];

  var remQueue = [
    {name:"Jamie L.",why:"5 of 6 open · no check-in for 11 days",color:"#f02348"},
    {name:"Priya S.",why:"3 of 5 open · sleep anchor slipping",   color:"#f58b1c"},
    {name:"Devon R.",why:"1 of 6 open · on track",                color:"#77d770"}
  ];

  var metrics   = [{label:"Bodyweight trend",value:"−8.4 lb"},{label:"Est. squat 1RM",value:"+35 lb"},{label:"Last photo",value:"Week 14"}];
  var resources = [{label:"Split Sculptor",color:"#77d770"},{label:"Macro Calculator",color:"#77d770"},{label:"1RM Calculator",color:"#77d770"},{label:"5 Ps Career Fit",color:"#f02348"},{label:"I AM Worksheet",color:"#2a9df0"}];
  var noteList  = [{label:"Held Art block at weekly cadence",meta:"Wk 13"},{label:"Squat wave reset after stalled top set",meta:"Wk 12"},{label:"5Ps audit — place scored low",meta:"Wk 11"}];
  var wins      = [{label:"Squat +35 lb from baseline",meta:"Wk 12",color:"#77d770"},{label:"Six consecutive green weeks",meta:"Wk 14",color:"#2a9df0"},{label:"Creative block held four weeks",meta:"Wk 13",color:"#ffbd59"}];
  var barValues = [42,55,38,61,70,48,66,74,58,80,86,72,91,84];
  var remDays   = ["Monday","Tuesday","Sunday"];
  var remChans  = ["text","email","push"];

  var state = {view:"client",openCard:null,openRows:{},done:{},remOn:true,remDayIdx:1,remChIdx:0};
  var pwOpen = false;
  var countdownInterval = null;

  var $ = function(id){ return document.getElementById(id); };

  function esc(s){ return String(s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); }

  // ─── Check existing session on load ───────────────────────────────────
  (async function(){
    var { data:{ session } } = await sb.auth.getSession();
    if (session) { showDash(session.user); return; }

    // Handle magic link token in URL (Supabase handles the hash automatically)
    sb.auth.onAuthStateChange(function(event, session){
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
    $('cpPwRevealBtn').textContent = pwOpen ? 'Sign in without password' : 'I know my password';
    $('cpEmailHint').hidden = pwOpen;
    if (pwOpen) $('cpPasswordInput').focus();
  });

  // ─── Send OTP / magic link ────────────────────────────────────────────
  $('cpEmailSubmit').addEventListener('click', async function(){
    var email = $('cpEmailInput').value.trim();
    if (!email) { showErr('cpEmailError','Enter your email address.'); return; }

    setLoading($('cpEmailSubmit'), true, 'Sending…');
    hideErr('cpEmailError');

    // Try OTP first
    var { error } = await sb.auth.signInWithOtp({
      email: email,
      options: { shouldCreateUser: false }
    });

    setLoading($('cpEmailSubmit'), false, 'Email me a sign-in code');

    if (error) {
      // OTP failed — fall back to magic link
      var res = await sb.auth.signInWithOtp({
        email: email,
        options: { emailRedirectTo: window.location.href, shouldCreateUser: false }
      });
      if (res.error) {
        showErr('cpEmailError','No account found for that email. Ask your coach for an invite.');
        return;
      }
      $('cpMagicEmail').textContent = email;
      showStep('cpStepMagic');
      return;
    }

    $('cpSentTo').textContent = email;
    showStep('cpStepCode');
    startCountdown();
    setTimeout(function(){ var f=$('cpCodeRow').querySelector('input'); if(f) f.focus(); }, 50);
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
    showDash(data.user);
  });

  // ─── OTP code inputs ──────────────────────────────────────────────────
  var codeRow = $('cpCodeRow');
  for (var ci = 0; ci < 6; ci++) {
    (function(){
      var inp = document.createElement('input');
      inp.type='text'; inp.maxLength=1; inp.inputMode='numeric'; inp.className='cp-code-input';
      inp.addEventListener('input', function(e){
        e.target.value = e.target.value.replace(/[^0-9]/g,'');
        if (e.target.value && e.target.nextElementSibling) e.target.nextElementSibling.focus();
      });
      inp.addEventListener('keydown', function(e){
        if (e.key==='Backspace' && !e.target.value && e.target.previousElementSibling) e.target.previousElementSibling.focus();
      });
      codeRow.appendChild(inp);
    })();
  }

  $('cpOpenPortal').addEventListener('click', async function(){
    var inputs = codeRow.querySelectorAll('input');
    var token  = Array.from(inputs).map(function(i){ return i.value; }).join('');
    if (token.length < 6) { showErr('cpCodeError','Enter all six digits.'); return; }

    var email = $('cpSentTo').textContent;
    setLoading($('cpOpenPortal'), true, 'Verifying…');
    hideErr('cpCodeError');

    var { data, error } = await sb.auth.verifyOtp({ email, token, type:'email' });

    setLoading($('cpOpenPortal'), false, 'Open my portal');

    if (error) { showErr('cpCodeError','That code didn\'t work. Check it or resend.'); return; }
    showDash(data.user);
  });

  $('cpBackToEmail').addEventListener('click', function(){ stopCountdown(); showStep('cpStepEmail'); });
  $('cpBackFromMagic').addEventListener('click', function(){ showStep('cpStepEmail'); });

  $('cpResend').addEventListener('click', async function(e){
    e.preventDefault();
    var email = $('cpSentTo').textContent;
    await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    stopCountdown(); startCountdown();
  });

  // ─── Countdown timer ──────────────────────────────────────────────────
  function startCountdown(){
    var secs = 599;
    $('cpCountdown').textContent = 'Code expires in 9:59';
    countdownInterval = setInterval(function(){
      secs--;
      if (secs <= 0){ stopCountdown(); $('cpCountdown').textContent = 'Code expired — resend above'; return; }
      var m = Math.floor(secs/60), s = secs % 60;
      $('cpCountdown').textContent = 'Code expires in '+m+':'+(s<10?'0':'')+s;
    }, 1000);
  }

  function stopCountdown(){ if(countdownInterval){ clearInterval(countdownInterval); countdownInterval=null; } }

  // ─── Helpers ──────────────────────────────────────────────────────────
  function showStep(id){
    ['cpStepEmail','cpStepCode','cpStepMagic'].forEach(function(s){ $(s).hidden = s!==id; });
    hideErr('cpEmailError'); hideErr('cpCodeError');
  }

  function showErr(id, msg){ var e=$(id); e.textContent=msg; e.classList.add('show'); }
  function hideErr(id){ var e=$(id); e.textContent=''; e.classList.remove('show'); }

  function setLoading(btn, loading, label){
    btn.disabled = loading;
    btn.textContent = label;
  }

  // ─── Show dashboard ───────────────────────────────────────────────────
  async function showDash(user){
    stopCountdown();
    $('cpAuth').hidden = true;
    $('cpDash').hidden = false;

    // Get profile from Supabase (role + name)
    var { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).single();

    var isCoach = (profile && profile.role === 'coach') || user.email === COACH_EMAIL;
    var firstName = profile && profile.full_name
      ? profile.full_name.split(' ')[0]
      : user.email.split('@')[0];

    // Coach toggle only visible to coach
    $('cpViewToggle').hidden = !isCoach;

    $('cpWelcome').textContent    = 'Welcome back, ' + firstName + '.';
    $('cpRouteLine').textContent  = route + ' · ' + weekLine + ' · weekly cadence';
    $('cpRoute').textContent      = route;
    $('cpWeek').textContent       = weekLine;
    $('cpWeekLine2').textContent  = weekLine;
    $('cpStreakLine').textContent  = '6-week streak';

    renderAll();
  }

  // ─── Sign out ─────────────────────────────────────────────────────────
  $('cpSignOut').addEventListener('click', async function(){
    await sb.auth.signOut();
    location.reload();
  });

  // ─── Render functions (identical to original) ─────────────────────────
  function renderAll(){
    renderCoreList(); renderCoreGrid(); renderTasks(); renderBars();
    renderNotes(); renderWins(); renderMetrics(); renderChips();
    renderRoster(); renderFlags(); renderQueue(); renderReminder();
    renderViewToggle();
  }

  function renderCoreList(){
    var h=''; cores.forEach(function(c){ h+='<div class="cp-core-row"><div class="cp-core-row-top"><span class="cp-dot" style="background:'+c.color+'"></span><span class="cp-core-label">'+c.label+'</span><span class="cp-core-pct">'+c.pct+'%</span></div><div class="cp-meter"><div class="cp-meter-fill" style="width:'+c.pct+'%;background:'+c.color+'"></div></div></div>'; });
    $('cpCoreList').innerHTML=h;
  }

  function renderCoreGrid(){
    var h=''; cores.forEach(function(c){ h+='<div class="cp-core-cell"><span class="cp-core-cell-n">'+c.n+'</span><div class="cp-core-cell-label"><span class="cp-dot" style="background:'+c.color+'"></span><span>'+c.label+'</span></div><p class="cp-core-cell-note">'+c.note+'</p><div class="cp-meter"><div class="cp-meter-fill" style="width:'+c.pct+'%;background:'+c.color+'"></div></div></div>'; });
    $('cpCoreGrid').innerHTML=h;
  }

  function renderTasks(){
    var h=''; taskData.forEach(function(t){ var done=!!state.done[t.id]; h+='<div class="cp-task-row"><button type="button" class="cp-task-check'+(done?' is-done':'')+'" data-task="'+t.id+'">'+(done?'✓':'')+'</button><span class="cp-dot" style="background:'+t.color+'"></span><span class="cp-task-label'+(done?' is-done':'')+'">'+esc(t.label)+'</span><span class="cp-task-meta">'+t.meta+'</span></div>'; });
    $('cpTaskList').innerHTML=h;
    $('cpTaskCount').textContent=taskData.length+' assignments';
  }

  function renderBars(){
    var max=Math.max.apply(null,barValues),h='';
    barValues.forEach(function(v){ var ht=Math.round((v/max)*78),bg=v>=70?'#071f35':'rgba(7,31,53,0.16)'; h+='<div class="cp-bar" style="height:'+ht+'px;background:'+bg+'"></div>'; });
    $('cpBars').innerHTML=h;
  }

  function renderNotes(){
    var h=''; noteList.forEach(function(n){ h+='<div class="cp-note-row"><span class="cp-note-label">'+esc(n.label)+'</span><span class="cp-note-meta">'+n.meta+'</span></div>'; });
    $('cpNoteList').innerHTML=h;
  }

  function renderWins(){
    var h=''; wins.forEach(function(w){ h+='<div class="cp-win-row"><span class="cp-dot" style="background:'+w.color+'"></span><span class="cp-win-label">'+esc(w.label)+'</span><span class="cp-win-meta">'+w.meta+'</span></div>'; });
    $('cpWinList').innerHTML=h;
  }

  function renderMetrics(){
    var h=''; metrics.forEach(function(m){ h+='<div class="cp-metric-row"><span class="cp-metric-label">'+m.label+'</span><span class="cp-metric-value">'+m.value+'</span></div>'; });
    $('cpMetricList').innerHTML=h;
  }

  function renderChips(){
    var h=''; resources.forEach(function(r){ h+='<span class="cp-chip"><span class="cp-dot" style="background:'+r.color+'"></span>'+esc(r.label)+'</span>'; });
    $('cpResourceChips').innerHTML=h;
  }

  function renderRoster(){
    var h=''; roster.forEach(function(c){ h+='<div class="cp-roster-row"><span class="cp-roster-name">'+esc(c.name)+'</span><span class="cp-roster-route">'+c.route+'</span><span class="cp-roster-week">'+c.week+'</span><div><div class="cp-meter"><div class="cp-meter-fill" style="width:'+c.adh+'%;background:'+c.color+'"></div></div><span class="cp-roster-flag">'+c.flag+'</span></div><span class="cp-roster-next">'+c.next+'</span></div>'; });
    $('cpRosterList').innerHTML=h;
  }

  function renderFlags(){
    var h=''; flags.forEach(function(f){ h+='<div class="cp-flag-row"><p class="cp-flag-name">'+esc(f.name)+'</p><p class="cp-flag-why">'+esc(f.why)+'</p></div>'; });
    $('cpFlagList').innerHTML=h;
  }

  function renderQueue(){
    var h=''; remQueue.forEach(function(q){ h+='<div class="cp-queue-row"><span class="cp-dot" style="background:'+q.color+'"></span><div><p class="cp-queue-name">'+esc(q.name)+'</p><p class="cp-queue-why">'+esc(q.why)+'</p></div></div>'; });
    $('cpQueueList').innerHTML=h;
  }

  function renderReminder(){
    var day=remDays[state.remDayIdx], ch=remChans[state.remChIdx];
    $('cpRemDay').textContent=day; $('cpRemChannel').textContent=ch;
    $('cpRemToggle').classList.toggle('is-on',state.remOn);
    $('cpRemToggleCoach').classList.toggle('is-on',state.remOn);
    var open=taskData.length-Object.values(state.done).filter(Boolean).length;
    $('cpRemLine').textContent=state.remOn?open+' of '+taskData.length+' still open — reminder goes out '+day+' 7:00 AM by '+ch+'.':'Reminders are off. You will not be nudged before Thursday\'s call.';
    $('cpQueueSummary').textContent='5 queued · sends '+day+' 7:00 AM by '+ch;
  }

  function renderViewToggle(){
    document.querySelectorAll('.cp-view-btn').forEach(function(b){ b.classList.toggle('is-active',b.getAttribute('data-view')===state.view); });
    $('cpClientView').hidden=state.view!=='client';
    $('cpCoachView').hidden=state.view!=='coach';
  }

  // ─── Interactions ─────────────────────────────────────────────────────
  document.querySelectorAll('.cp-view-btn').forEach(function(b){
    b.addEventListener('click',function(){ state.view=b.getAttribute('data-view'); renderViewToggle(); });
  });

  $('cpRemDay').addEventListener('click',function(){ state.remDayIdx=(state.remDayIdx+1)%remDays.length; renderReminder(); });
  $('cpRemChannel').addEventListener('click',function(){ state.remChIdx=(state.remChIdx+1)%remChans.length; renderReminder(); });

  function toggleRem(){ state.remOn=!state.remOn; renderReminder(); }
  $('cpRemToggle').addEventListener('click',toggleRem);
  $('cpRemToggleCoach').addEventListener('click',toggleRem);

  $('cpTaskList').addEventListener('click',function(e){
    var btn=e.target.closest('.cp-task-check'); if(!btn) return;
    e.stopPropagation();
    var id=btn.getAttribute('data-task'); state.done[id]=!state.done[id];
    renderTasks(); renderReminder();
  });

  // ─── Side sheet ───────────────────────────────────────────────────────
  function openSheet(key){
    var d=details[key]; if(!d) return;
    state.openCard=key;
    $('cpSheetKicker').textContent=d.kicker; $('cpSheetTitle').textContent=d.title; $('cpSheetLede').textContent=d.lede;
    var h='';
    d.rows.forEach(function(r,i){
      var rk=key+':'+i, isOpen=!!state.openRows[rk];
      h+='<div class="cp-sheet-row'+(isOpen?' is-open':'')+'" data-row="'+rk+'"><div class="cp-sheet-row-head"><div><span class="cp-sheet-row-label">'+esc(r.label)+'</span><span class="cp-sheet-row-meta">'+r.meta+'</span></div><span class="cp-sheet-row-plus">+</span></div><p class="cp-sheet-row-body">'+esc(r.body)+'</p></div>';
    });
    $('cpSheetRows').innerHTML=h;
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

  document.addEventListener('keydown',function(e){ if(e.key==='Escape' && !$('cpSheetOverlay').hidden) closeSheet(); });

})();
