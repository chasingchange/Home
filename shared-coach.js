(() => {
  const CLIENTS_KEY = "ccCoachClients";
  const ACTIVE_CLIENT_KEY = "ccCoachActiveClientId";
  const ADMIN_AUTH_KEY = "ccAdminAuthed";

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const nowIso = () => new Date().toISOString();

  const parseJsonSafe = (raw, fallback) => {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch (error) {
      console.warn("Unable to parse coach storage payload.", error);
      return fallback;
    }
  };

  const normalizeToolRecord = (record) => {
    const savedValues = record && typeof record.savedValues === "object" ? record.savedValues : {};
    return {
      savedValues,
      coachNotes: String(record?.coachNotes || ""),
      updatedAt: record?.updatedAt || nowIso(),
    };
  };

  const buildClientId = () => {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
    return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const normalizeClient = (input = {}) => {
    const toolData = Object.fromEntries(
      Object.entries(input?.toolData || {}).map(([toolKey, payload]) => [toolKey, normalizeToolRecord(payload)]),
    );

    const uniqueNameKey = String(input?.uniqueNameKey || input?.name || "").trim().toLowerCase();

    return {
      id: String(input?.id || buildClientId()),
      name: String(input?.name || "").trim(),
      uniqueNameKey,
      email: String(input?.email || "").trim(),
      phone: String(input?.phone || "").trim(),
      notes: String(input?.notes || "").trim(),
      createdAt: input?.createdAt || nowIso(),
      updatedAt: input?.updatedAt || nowIso(),
      archivedAt: input?.archivedAt || null,
      toolData,
    };
  };

  const readStore = () => {
    const parsed = parseJsonSafe(localStorage.getItem(CLIENTS_KEY) || "{}", {});
    return {
      clients: Array.isArray(parsed?.clients) ? parsed.clients.map(normalizeClient) : [],
      schemaVersion: 1,
      updatedAt: parsed?.updatedAt || nowIso(),
    };
  };

  const writeStore = (store) => {
    const next = {
      clients: (store?.clients || []).map(normalizeClient),
      schemaVersion: 1,
      updatedAt: nowIso(),
    };
    localStorage.setItem(CLIENTS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("cc-coach-clients-changed"));
    return next;
  };

  const listClients = ({ includeArchived = false, search = "" } = {}) => {
    const normalizedQuery = String(search || "").trim().toLowerCase();
    let clients = readStore().clients;
    if (!includeArchived) clients = clients.filter((client) => !client.archivedAt);
    if (normalizedQuery) {
      clients = clients.filter((client) => {
        const haystack = [client.name, client.email, client.phone, client.notes].join(" ").toLowerCase();
        return haystack.includes(normalizedQuery);
      });
    }
    return clients
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map((client) => clone(client));
  };

  const getClientById = (clientId) => {
    if (!clientId) return null;
    const found = readStore().clients.find((client) => client.id === String(clientId));
    return found ? clone(found) : null;
  };

  const createClient = (payload = {}) => {
    const name = String(payload?.name || "").trim();
    if (!name) return { ok: false, error: "Client full name is required." };

    const store = readStore();
    const uniqueNameKey = name.toLowerCase();
    const duplicate = store.clients.find((client) => !client.archivedAt && client.uniqueNameKey === uniqueNameKey);
    if (duplicate) {
      return { ok: false, error: "A client with that full name already exists. Use edit/update instead." };
    }

    const client = normalizeClient({
      id: buildClientId(),
      name,
      uniqueNameKey,
      email: payload?.email,
      phone: payload?.phone,
      notes: payload?.notes,
      toolData: {},
    });

    store.clients.push(client);
    writeStore(store);
    localStorage.setItem(ACTIVE_CLIENT_KEY, client.id);
    window.dispatchEvent(new CustomEvent("cc-coach-active-client-changed", { detail: { clientId: client.id } }));
    return { ok: true, client: clone(client) };
  };

  const updateClient = (clientId, patch = {}) => {
    const id = String(clientId || "").trim();
    if (!id) return { ok: false, error: "Client ID is required." };

    const store = readStore();
    const idx = store.clients.findIndex((client) => client.id === id);
    if (idx < 0) return { ok: false, error: "Client not found." };

    const existing = store.clients[idx];
    const nextName = patch.name !== undefined ? String(patch.name || "").trim() : existing.name;
    if (!nextName) return { ok: false, error: "Client full name cannot be blank." };

    const duplicate = store.clients.find((client) => client.id !== id && !client.archivedAt && client.uniqueNameKey === nextName.toLowerCase());
    if (duplicate) {
      return { ok: false, error: "Another client already uses that full name." };
    }

    const next = normalizeClient({
      ...existing,
      ...patch,
      name: nextName,
      uniqueNameKey: nextName.toLowerCase(),
      updatedAt: nowIso(),
    });

    store.clients[idx] = next;
    writeStore(store);
    return { ok: true, client: clone(next) };
  };

  const deleteOrArchiveClient = (clientId, options = {}) => {
    const id = String(clientId || "").trim();
    const hardDelete = options?.hardDelete === true;
    if (!id) return { ok: false, error: "Client ID is required." };

    const store = readStore();
    const idx = store.clients.findIndex((client) => client.id === id);
    if (idx < 0) return { ok: false, error: "Client not found." };

    const target = store.clients[idx];
    if (hardDelete) {
      store.clients.splice(idx, 1);
    } else {
      store.clients[idx] = normalizeClient({ ...target, archivedAt: nowIso(), updatedAt: nowIso() });
    }

    writeStore(store);
    if (localStorage.getItem(ACTIVE_CLIENT_KEY) === id) {
      localStorage.removeItem(ACTIVE_CLIENT_KEY);
    }
    window.dispatchEvent(new CustomEvent("cc-coach-active-client-changed", { detail: { clientId: null } }));
    return { ok: true };
  };

  const saveToolData = (clientId, toolKey, payload = {}) => {
    const id = String(clientId || "").trim();
    const key = String(toolKey || "").trim();
    if (!id || !key) return { ok: false, error: "Client ID and tool key are required." };
    if (!payload || typeof payload !== "object") {
      return { ok: false, error: "Tool payload must be an object." };
    }

    const store = readStore();
    const idx = store.clients.findIndex((client) => client.id === id);
    if (idx < 0) return { ok: false, error: "Client not found." };

    const next = normalizeClient(store.clients[idx]);
    next.toolData[key] = normalizeToolRecord({
      savedValues: payload.savedValues || payload,
      coachNotes: payload.coachNotes || "",
      updatedAt: nowIso(),
    });
    next.updatedAt = nowIso();
    store.clients[idx] = next;
    writeStore(store);
    localStorage.setItem(ACTIVE_CLIENT_KEY, id);
    window.dispatchEvent(new CustomEvent("cc-coach-active-client-changed", { detail: { clientId: id } }));

    return { ok: true, client: clone(next), toolRecord: clone(next.toolData[key]) };
  };

  const loadToolData = (clientId, toolKey) => {
    const client = getClientById(clientId);
    if (!client) return null;
    const key = String(toolKey || "").trim();
    if (!key) return null;
    return clone(client.toolData?.[key] || null);
  };

  const getActiveClientId = () => String(localStorage.getItem(ACTIVE_CLIENT_KEY) || "");
  const setActiveClientId = (clientId) => {
    const id = String(clientId || "").trim();
    if (!id) {
      localStorage.removeItem(ACTIVE_CLIENT_KEY);
    } else {
      localStorage.setItem(ACTIVE_CLIENT_KEY, id);
    }
    window.dispatchEvent(new CustomEvent("cc-coach-active-client-changed", { detail: { clientId: id || null } }));
  };

  const isCoachMode = () => sessionStorage.getItem(ADMIN_AUTH_KEY) === "1";

  window.ChasingChangeCoach = {
    isCoachMode,
    listClients,
    getClientById,
    getActiveClientId,
    setActiveClientId,
    createClient,
    updateClient,
    deleteOrArchiveClient,
    saveToolData,
    loadToolData,
  };
})();
