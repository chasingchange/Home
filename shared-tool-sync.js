// Cross-device sync for site tools. Requires the Supabase JS CDN script to be
// loaded first, and a `tool_saves` table (see scripts/tool_saves.sql).
(function () {
  // Falls back to the known project values if shared-supabase-config.js
  // wasn't loaded first, so this still works standalone.
  const SUPABASE_URL = window.CC_SUPABASE_URL || "https://datrgkjqwyfcbmtwwifm.supabase.co";
  const SUPABASE_ANON_KEY = window.CC_SUPABASE_KEY || "sb_publishable_HrGR9fNaldor1FvDa0sDWA_VM3EPTZ9";

  function createClient() {
    if (!window.supabase || !window.supabase.createClient) return null;
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  const sb = createClient();

  function getSignInUrl() {
    const path = window.location.pathname;
    const depth = path.replace(/\/[^/]*$/, "").split("/").filter(Boolean).length;
    return `${"../".repeat(Math.max(depth, 1))}client-portal/`;
  }

  // toolKey: string identifying this save row.
  // options.getData(): () => JSON-serializable data to push, or null/undefined to skip.
  // options.setData(data): applies cloud data locally (e.g. write to localStorage + re-render).
  // options.statusEl: optional element to show sync status text in.
  // options.signInUrl: optional override for the "sign in" link target.
  window.ToolSync = window.ToolSync || {
    getClient() {
      return sb;
    },

    // Fires cb(user|null) once immediately, then again on every auth change.
    onUser(cb) {
      if (!sb || typeof cb !== "function") return;
      sb.auth.getSession().then(({ data: { session } }) => {
        cb(session && session.user ? session.user : null);
      });
      sb.auth.onAuthStateChange((_event, session) => {
        cb(session && session.user ? session.user : null);
      });
    },

    init(toolKey, options) {
      const { getData, setData, statusEl } = options || {};
      const signInUrl = (options && options.signInUrl) || getSignInUrl();
      const state = { user: null, suspend: false, timer: null };

      function updateStatus() {
        if (!statusEl) return;
        if (!sb) {
          statusEl.textContent = "";
          return;
        }
        if (state.user) {
          statusEl.textContent = `Signed in as ${state.user.email} — synced across your devices.`;
        } else {
          statusEl.innerHTML = `Saved on this device only. <a href="${signInUrl}" class="underline font-semibold">Sign in</a> to sync across devices.`;
        }
      }

      async function pull() {
        if (!sb || !state.user || typeof setData !== "function") return;
        const { data, error } = await sb
          .from("tool_saves")
          .select("data")
          .eq("user_id", state.user.id)
          .eq("tool_key", toolKey)
          .maybeSingle();

        if (error) return;

        if (data && data.data) {
          state.suspend = true;
          try {
            setData(data.data);
          } finally {
            state.suspend = false;
          }
        } else {
          push(true);
        }
      }

      function push(immediate) {
        if (!sb || !state.user || typeof getData !== "function" || state.suspend) return;
        clearTimeout(state.timer);
        const run = () => {
          const payload = getData();
          if (payload == null) return;
          sb.from("tool_saves")
            .upsert({
              user_id: state.user.id,
              tool_key: toolKey,
              data: payload,
              updated_at: new Date().toISOString(),
            })
            .then(() => {});
        };
        if (immediate) run();
        else state.timer = setTimeout(run, 600);
      }

      async function start() {
        updateStatus();
        if (!sb) return;
        const {
          data: { session },
        } = await sb.auth.getSession();
        state.user = session && session.user ? session.user : null;
        if (state.user) await pull();
        updateStatus();

        sb.auth.onAuthStateChange(async (_event, session) => {
          state.user = session && session.user ? session.user : null;
          if (state.user) await pull();
          updateStatus();
        });
      }

      start();

      return { save: () => push(false) };
    },
  };
})();
