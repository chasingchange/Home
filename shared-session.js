(() => {
  const ACCOUNTS_KEY = "ccAccounts";
  const SESSION_KEY = "ccSession";
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
    return cloneAccounts(normalized);
  };

  const ready = (async () => {
    const opfsAccounts = await readOpfsAccounts();
    const localAccounts = readLocalAccounts();
    const initialAccounts = Object.keys(opfsAccounts || {}).length ? opfsAccounts : localAccounts;
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

    if (!name || !normalizedEmail || !password) {
      return { ok: false, error: "Enter your name, email, and password to create an account." };
    }

    if (accountsCache[normalizedEmail]) {
      return { ok: false, error: "Account already exists. Log in instead." };
    }

    accountsCache[normalizedEmail] = ensureAccountShape({
      name,
      password,
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
    if (!normalizedEmail || !password) {
      return { ok: false, error: "Enter email + password." };
    }

    const account = accountsCache[normalizedEmail];
    if (!account || account.password !== password) {
      return { ok: false, error: "Login failed. Check your email/password." };
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
  };

  const renderPersistentAccountCard = () => {
    if (document.getElementById("ccPersistentAccountCard")) return;

    const card = document.createElement("section");
    card.id = "ccPersistentAccountCard";
    card.className = "cc-account-card";
    card.innerHTML = `
      <p class="cc-account-title">Account</p>
      <p id="ccAccountStatus" class="cc-account-status">Not Logged In</p>
      <div class="cc-account-actions">
        <button id="ccLoginBtn" type="button" class="cc-account-login-btn">Log In</button>
        <button id="ccCreateBtn" type="button" class="cc-account-create-btn">Create</button>
        <button id="ccLogoutBtn" type="button" class="cc-account-logout-btn" hidden>Log Out</button>
      </div>
    `;
    document.body.appendChild(card);

    const statusEl = card.querySelector("#ccAccountStatus");
    const loginBtn = card.querySelector("#ccLoginBtn");
    const createBtn = card.querySelector("#ccCreateBtn");
    const logoutBtn = card.querySelector("#ccLogoutBtn");

    const syncCard = () => {
      const name = getCurrentDisplayName();
      statusEl.textContent = name ? `Welcome Back To The Race, ${name}` : "Not Logged In";
      loginBtn.hidden = !!name;
      createBtn.hidden = !!name;
      logoutBtn.hidden = !name;
      const pageLoginStatus = document.getElementById("pageLoginStatus");
      if (pageLoginStatus) pageLoginStatus.textContent = statusEl.textContent;
    };

    loginBtn?.addEventListener("click", async () => {
      const email = window.prompt("Email:");
      if (!email) return;
      const password = window.prompt("Password:");
      if (!password) return;
      const result = await login(email, password);
      if (!result.ok) window.alert(result.error || "Login failed.");
      syncCard();
    });

    createBtn?.addEventListener("click", async () => {
      const name = window.prompt("Name:");
      if (!name) return;
      const email = window.prompt("Email:");
      if (!email) return;
      const password = window.prompt("Password:");
      if (!password) return;
      const result = await createAccount({ name, email, password });
      if (!result.ok) window.alert(result.error || "Unable to create account.");
      syncCard();
    });

    logoutBtn?.addEventListener("click", () => {
      logout();
      syncCard();
    });

    syncCard();
  };

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", renderPersistentAccountCard, { once: true });
    } else {
      renderPersistentAccountCard();
    }
  }
})();
