// ============================================
// CHASING CHANGE PORTAL — SUPABASE CONFIG
// ============================================

const SUPABASE_URL = 'https://datrgkjqwyfcbmtwwifm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_HrGR9fNaldor1FvDa0sDWA_VM3EPTZ9';

// Initialize Supabase client (loaded via CDN in each HTML file)
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Get current session
async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

// Get current user profile (includes role)
async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data;
}

// Require login — redirect to login.html if no session
async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
}

// Require coach role — redirect to client dashboard if not coach
async function requireCoach() {
  const session = await requireAuth();
  if (!session) return null;
  const profile = await getProfile(session.user.id);
  if (!profile || profile.role !== 'coach') {
    window.location.href = 'client.html';
    return null;
  }
  return { session, profile };
}

// Sign out
async function signOut() {
  await supabase.auth.signOut();
  window.location.href = 'login.html';
}

// Format date nicely
function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}
