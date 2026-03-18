(() => {
  const ACCOUNTS_KEY = "ccAccounts";
  const SESSION_KEY = "ccSession";

  const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

  const readAccounts = () => {
    try {
      return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "{}");
    } catch {
      return {};
    }
  };

  const writeAccounts = (accounts) => {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  };

  const getCurrentUserEmail = () => normalizeEmail(localStorage.getItem(SESSION_KEY) || "");

  const getCurrentAccount = () => {
    const email = getCurrentUserEmail();
    if (!email) return null;

    const accounts = readAccounts();
    return accounts[email] ? { email, account: accounts[email] } : null;
  };

  const ensureAccountShape = (account) => ({
    name: account?.name || "",
    password: account?.password || "",
    calculators: account?.calculators || {},
    createdAt: account?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const createAccount = (input, maybePassword) => {
    const name = typeof input === "object" ? String(input?.name || "").trim() : "";
    const email = typeof input === "object" ? input?.email : input;
    const password = typeof input === "object" ? input?.password : maybePassword;
    const normalizedEmail = normalizeEmail(email);
    if (!name || !normalizedEmail || !password) {
      return { ok: false, error: "Enter your name, email, and password to create an account." };
    }

    const accounts = readAccounts();
    if (accounts[normalizedEmail]) {
      return { ok: false, error: "Account already exists. Log in instead." };
    }

    accounts[normalizedEmail] = ensureAccountShape({ name, password });
    writeAccounts(accounts);
    localStorage.setItem(SESSION_KEY, normalizedEmail);

    return { ok: true, email: normalizedEmail, name };
  };

  const login = (email, password) => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !password) {
      return { ok: false, error: "Enter email + password." };
    }

    const accounts = readAccounts();
    const account = accounts[normalizedEmail];

    if (!account || account.password !== password) {
      return { ok: false, error: "Login failed. Check your email/password." };
    }

    localStorage.setItem(SESSION_KEY, normalizedEmail);
    return { ok: true, email: normalizedEmail };
  };

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
  };

  const saveCalculatorData = (calculatorKey, data) => {
    const session = getCurrentAccount();
    if (!session || !calculatorKey) return false;

    const accounts = readAccounts();
    const nextAccount = ensureAccountShape(accounts[session.email]);
    nextAccount.calculators[calculatorKey] = {
      ...(nextAccount.calculators[calculatorKey] || {}),
      ...data,
      updatedAt: new Date().toISOString(),
    };

    accounts[session.email] = nextAccount;
    writeAccounts(accounts);
    return true;
  };

  const getCalculatorData = (calculatorKey) => {
    const session = getCurrentAccount();
    if (!session || !calculatorKey) return null;
    return session.account.calculators?.[calculatorKey] || null;
  };

  const getCurrentDisplayName = () => {
    const session = getCurrentAccount();
    if (!session) return "";
    return session.account.name || session.email.split("@")[0];
  };

  window.ChasingChangeSession = {
    createAccount,
    login,
    logout,
    getCurrentUserEmail,
    getCurrentDisplayName,
    getCurrentAccount,
    saveCalculatorData,
    getCalculatorData,
  };
})();
