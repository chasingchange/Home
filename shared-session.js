(() => {
  const ACCOUNTS_KEY = "ccAccounts";
  const SESSION_KEY = "ccSession";
  const ACCOUNT_SYNC_CONFIG_KEY = "ccAccountSyncConfig";
  const OPFS_SUPPORTED = typeof navigator !== "undefined" && !!navigator.storage?.getDirectory;
  const DATA_FOLDER = "chasing-change-secure-data";
  const DATA_FILE = "accounts.json";

  let accountsCache = null;
  let pendingWrite = Promise.resolve();

  const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

  const cloneAccounts = (accounts) => JSON.parse(JSON.stringify(accounts || {}));

  const ensureAccountShape = (account) => ({
    name: account?.name || "",
    password: account?.password || "",
    calculators: account?.calculators || {},
    createdAt: account?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const normalizeAccounts = (accounts) => Object.fromEntries(
    Object.entries(accounts || {}).map(([email, account]) => [normalizeEmail(email), ensureAccountShape(account)]),
  );

  const readLocalAccounts = () => {
    try {
      return normalizeAccounts(JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "{}"));
    } catch {
      return {};
    }
  };

  const writeLocalAccounts = (accounts) => {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  };

  const readSyncConfig = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(ACCOUNT_SYNC_CONFIG_KEY) || "{}");
      return {
        endpoint: String(parsed?.endpoint || "").trim(),
        token: String(parsed?.token || "").trim(),
      };
    } catch {
      return { endpoint: "", token: "" };
    }
  };

  const saveSyncConfig = (config) => {
    const next = {
      endpoint: String(config?.endpoint || "").trim(),
      token: String(config?.token || "").trim(),
    };

    if (!next.endpoint && !next.token) {
      localStorage.removeItem(ACCOUNT_SYNC_CONFIG_KEY);
      return;
    }

    localStorage.setItem(ACCOUNT_SYNC_CONFIG_KEY, JSON.stringify(next));
  };

  const getSyncHeaders = (token) => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  const readRemoteAccounts = async () => {
    const { endpoint, token } = readSyncConfig();
    if (!endpoint) return null;

    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: getSyncHeaders(token),
      });
      if (!response.ok) throw new Error(`GET ${response.status}`);
      const body = await response.json();
      return body && typeof body === "object" ? normalizeAccounts(body) : {};
    } catch (error) {
      console.warn("Unable to read account sync endpoint. Falling back to local browser storage.", error);
      return null;
    }
  };

  const writeRemoteAccounts = async (accounts) => {
    const { endpoint, token } = readSyncConfig();
    if (!endpoint) return false;

    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: getSyncHeaders(token),
        body: JSON.stringify(accounts),
      });
      if (!response.ok) throw new Error(`PUT ${response.status}`);
      return true;
    } catch (error) {
      console.warn("Unable to sync accounts to remote endpoint.", error);
      return false;
    }
  };

  const readOpfsAccounts = async () => {
    if (!OPFS_SUPPORTED) return null;

    try {
      const root = await navigator.storage.getDirectory();
      const dataFolder = await root.getDirectoryHandle(DATA_FOLDER, { create: true });
      const fileHandle = await dataFolder.getFileHandle(DATA_FILE, { create: true });
      const file = await fileHandle.getFile();
      const text = await file.text();
      return text ? normalizeAccounts(JSON.parse(text)) : {};
    } catch (error) {
      console.warn("Unable to read secure account storage. Falling back to browser storage.", error);
      return null;
    }
  };

  const writeOpfsAccounts = async (accounts) => {
    if (!OPFS_SUPPORTED) return false;

    try {
      const root = await navigator.storage.getDirectory();
      const dataFolder = await root.getDirectoryHandle(DATA_FOLDER, { create: true });
      const fileHandle = await dataFolder.getFileHandle(DATA_FILE, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(accounts, null, 2));
      await writable.close();
      return true;
    } catch (error) {
      console.warn("Unable to write secure account storage. Falling back to browser storage.", error);
      return false;
    }
  };

  const syncAccountsToAllStores = async (accounts) => {
    const normalized = normalizeAccounts(accounts);
    accountsCache = cloneAccounts(normalized);
    writeLocalAccounts(normalized);
    await writeOpfsAccounts(normalized);
    await writeRemoteAccounts(normalized);
    return cloneAccounts(normalized);
  };

  const ready = (async () => {
    const remoteAccounts = await readRemoteAccounts();
    const opfsAccounts = await readOpfsAccounts();
    const localAccounts = readLocalAccounts();
    const initialAccounts = Object.keys(remoteAccounts || {}).length
      ? remoteAccounts
      : Object.keys(opfsAccounts || {}).length
        ? opfsAccounts
        : localAccounts;
    await syncAccountsToAllStores(initialAccounts);
    return cloneAccounts(accountsCache);
  })();

  const whenReady = () => ready;

  const getCurrentUserEmail = () => normalizeEmail(localStorage.getItem(SESSION_KEY) || "");

  const getCurrentAccount = () => {
    const email = getCurrentUserEmail();
    if (!email || !accountsCache?.[email]) return null;
    return { email, account: cloneAccounts(accountsCache[email]) };
  };

  const getCurrentDisplayName = () => {
    const session = getCurrentAccount();
    if (!session) return "";
    return session.account.name || session.email.split("@")[0];
  };

  const findAccountByName = (name) => {
    const normalizedName = String(name || "").trim().toLowerCase();
    if (!normalizedName) return null;

    return Object.entries(accountsCache || {}).find(([, account]) => String(account?.name || "").trim().toLowerCase() === normalizedName) || null;
  };

  const createAccount = async (input, maybePassword) => {
    await ready;

    const name = typeof input === "object" ? String(input?.name || "").trim() : "";
    const email = typeof input === "object" ? input?.email : input;
    const password = typeof input === "object" ? input?.password : maybePassword;
    const normalizedEmail = normalizeEmail(email);

    if (!name || !normalizedEmail) {
      return { ok: false, error: "Enter your name and email to create an account." };
    }

    if (accountsCache[normalizedEmail]) {
      return { ok: false, error: "Account already exists. Log in instead." };
    }

    accountsCache[normalizedEmail] = ensureAccountShape({
      name,
      password: String(password || ""),
      calculators: {
        profile: {
          macroTargets: null,
        },
      },
    });

    pendingWrite = pendingWrite.then(() => syncAccountsToAllStores(accountsCache));
    await pendingWrite;
    localStorage.setItem(SESSION_KEY, normalizedEmail);

    return {
      ok: true,
      email: normalizedEmail,
      name,
      storage: OPFS_SUPPORTED ? "secure-browser-folder" : "browser-storage-fallback",
    };
  };

  const login = async (email, password) => {
    await ready;

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return { ok: false, error: "Enter a valid email." };
    }

    const account = accountsCache[normalizedEmail];
    if (!account) {
      return { ok: false, error: "No account found for that email yet." };
    }

    localStorage.setItem(SESSION_KEY, normalizedEmail);
    return { ok: true, email: normalizedEmail };
  };

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
  };

  const sendCredentialReminder = async ({ name, email } = {}) => {
    await ready;

    const normalizedEmail = normalizeEmail(email);
    const emailMatch = normalizedEmail ? [normalizedEmail, accountsCache[normalizedEmail]] : null;
    const nameMatch = !normalizedEmail && name ? findAccountByName(name) : null;
    const match = emailMatch?.[1] ? emailMatch : nameMatch;

    if (!match) {
      return { ok: false, message: "We could not find an account with that information yet." };
    }

    const [matchedEmail, account] = match;
    const reminderParts = [];

    if (normalizedEmail) {
      reminderParts.push(`Password reminder sent to ${matchedEmail}. Password: ${account.password}`);
    } else {
      reminderParts.push(`Email reminder sent to ${matchedEmail}.`);
    }

    reminderParts.push("Your account is stored in this browser's private Chasing Change data folder when supported.");

    return {
      ok: true,
      message: reminderParts.join(" "),
      email: matchedEmail,
      password: account.password,
    };
  };

  const saveCalculatorData = async (calculatorKey, data) => {
    await ready;

    const session = getCurrentAccount();
    if (!session || !calculatorKey) return false;

    const nextAccount = ensureAccountShape(accountsCache[session.email]);
    nextAccount.calculators[calculatorKey] = {
      ...(nextAccount.calculators[calculatorKey] || {}),
      ...data,
      updatedAt: new Date().toISOString(),
    };

    if (calculatorKey === "macroCalculator") {
      nextAccount.calculators.profile = {
        ...(nextAccount.calculators.profile || {}),
        macroTargets: data?.outputs || null,
        updatedAt: new Date().toISOString(),
      };
    }

    accountsCache[session.email] = nextAccount;
    pendingWrite = pendingWrite.then(() => syncAccountsToAllStores(accountsCache));
    await pendingWrite;
    return true;
  };

  const getCalculatorData = (calculatorKey) => {
    const session = getCurrentAccount();
    if (!session || !calculatorKey) return null;
    return cloneAccounts(session.account.calculators?.[calculatorKey] || null);
  };

  window.ChasingChangeSession = {
    ready,
    whenReady,
    createAccount,
    login,
    logout,
    getCurrentUserEmail,
    getCurrentDisplayName,
    getCurrentAccount,
    saveCalculatorData,
    getCalculatorData,
    sendCredentialReminder,
    getSyncConfig: readSyncConfig,
    setSyncConfig: saveSyncConfig,
    syncNow: () => pendingWrite.then(() => syncAccountsToAllStores(accountsCache || {})),
  };

  const renderPersistentAccountCard = () => {
    if (window.self !== window.top) return;
    if (document.getElementById("ccPersistentAccountCard")) return;

    const card = document.createElement("section");
    card.id = "ccPersistentAccountCard";
    card.className = "cc-account-card cc-account-card-inline";
    card.innerHTML = `
      <p id="ccAccountStatus" class="cc-account-status">Chasing Change Account</p>
      <div class="cc-account-card-actions">
        <a id="ccAccountAuthLink" href="#" class="cc-title-home cc-account-start-line" hidden>
          <span class="cc-title-home-label">LOG IN | CREATE ACCOUNT</span>
        </a>
        <a id="ccAccountStartLine" href="#" class="cc-title-home cc-account-start-line" hidden>
          <span class="cc-title-home-label">START LINE | CHASING CHANGE HOME</span>
        </a>
        <button id="ccAccountLogoutBtn" type="button" class="cc-title-home cc-account-start-line cc-account-logout-action" hidden>
          <span class="cc-title-home-label">LOG OUT</span>
        </button>
      </div>
    `;

    const titleBlock = document.querySelector(".cc-title-block");
    if (titleBlock?.parentNode) {
      titleBlock.insertAdjacentElement("afterend", card);
    } else {
      document.body.prepend(card);
    }

    const statusEl = card.querySelector("#ccAccountStatus");
    const accountAuthLink = card.querySelector("#ccAccountAuthLink");
    const accountStartLine = card.querySelector("#ccAccountStartLine");
    const accountLogoutBtn = card.querySelector("#ccAccountLogoutBtn");

    const syncCard = () => {
      const pathname = window.location.pathname || "/";
      const normalizedPath = pathname.replace(/\/+$/, "") || "/";
      const isHomePage = /\/Home(?:\/index\.html)?$/.test(normalizedPath) || /^\/(?:index\.html)?$/.test(normalizedPath);
      const name = getCurrentDisplayName();
      const isLoggedIn = !!name;

      if (accountAuthLink) {
        accountAuthLink.setAttribute("href", "https://chasingchange.github.io/Home/create-account/index.html");
        accountAuthLink.hidden = isLoggedIn;
      }

      if (accountStartLine) {
        accountStartLine.setAttribute("href", "https://chasingchange.github.io/Home/index.html");
        accountStartLine.hidden = !isLoggedIn || isHomePage;
      }

      const message = name ? `Welcome to your race, ${name}` : "Chasing Change Account";
      statusEl.textContent = message;
      card.classList.toggle("is-logged-in", isLoggedIn);

      if (accountLogoutBtn) {
        accountLogoutBtn.hidden = !isLoggedIn || !isHomePage;
      }

      const pageLoginStatus = document.getElementById("pageLoginStatus");
      if (pageLoginStatus) pageLoginStatus.textContent = message;
    };

    accountLogoutBtn?.addEventListener("click", () => {
      logout();
      syncCard();
    });

    window.addEventListener("storage", (event) => {
      if (!event.key || event.key === SESSION_KEY || event.key === ACCOUNTS_KEY) {
        whenReady().finally(syncCard);
      }
    });
    window.addEventListener("focus", () => {
      whenReady().finally(syncCard);
    });

    whenReady().finally(syncCard);
  };

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", renderPersistentAccountCard, { once: true });
    } else {
      renderPersistentAccountCard();
    }
  }
})();
