(() => {
  const ADMIN_UNLOCKED_KEY = "ccAdminUnlocked";
  const PAGE_HTML_OVERRIDES_KEY = "ccPageHtmlOverrides";

  const pageKey = `${location.pathname}`;

  const readOverrides = () => {
    try {
      return JSON.parse(localStorage.getItem(PAGE_HTML_OVERRIDES_KEY) || "{}");
    } catch {
      return {};
    }
  };

  const applySavedPage = () => {
    const overrides = readOverrides();
    const saved = overrides[pageKey];
    const editableRoot = document.querySelector("[data-admin-edit-root]");
    if (saved && editableRoot) editableRoot.innerHTML = saved;
  };

  const isUnlocked = () => localStorage.getItem(ADMIN_UNLOCKED_KEY) === "true";

  const mountAdminBar = () => {
    if (!isUnlocked()) return;
    const root = document.querySelector("[data-admin-edit-root]");
    if (!root) return;

    let editing = false;
    const bar = document.createElement("div");
    bar.style.cssText = "position:fixed;bottom:14px;right:14px;z-index:9999;display:flex;gap:8px;align-items:center;background:#071f35;color:#fff;padding:10px 12px;border-radius:12px;font:700 12px Muli, sans-serif;box-shadow:0 10px 30px rgba(7,31,53,.25);";
    bar.innerHTML = '<span>Admin</span>';

    const editBtn = document.createElement("button");
    editBtn.textContent = "Enable editing";
    editBtn.style.cssText = "border:0;border-radius:8px;padding:7px 10px;background:#77d770;color:#071f35;font-weight:800;cursor:pointer;";

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Save page";
    saveBtn.style.cssText = "border:1px solid rgba(255,255,255,.4);border-radius:8px;padding:7px 10px;background:transparent;color:#fff;font-weight:800;cursor:pointer;";

    editBtn.addEventListener("click", () => {
      editing = !editing;
      root.contentEditable = String(editing);
      editBtn.textContent = editing ? "Disable editing" : "Enable editing";
      root.style.outline = editing ? "2px dashed #77d770" : "";
    });

    saveBtn.addEventListener("click", () => {
      const overrides = readOverrides();
      overrides[pageKey] = root.innerHTML;
      localStorage.setItem(PAGE_HTML_OVERRIDES_KEY, JSON.stringify(overrides));
      saveBtn.textContent = "Saved";
      setTimeout(() => (saveBtn.textContent = "Save page"), 1000);
    });

    bar.append(editBtn, saveBtn);
    document.body.appendChild(bar);
  };

  document.addEventListener("DOMContentLoaded", () => {
    applySavedPage();
    mountAdminBar();
  });
})();
