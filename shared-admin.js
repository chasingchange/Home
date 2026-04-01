(() => {
  const ADMIN_UNLOCKED_KEY = "ccAdminUnlocked";
  const PAGE_HTML_OVERRIDES_KEY = "ccPageHtmlOverrides";
  const ADMIN_PASSWORD = "Chasing1228!";
  const pageKey = `${location.pathname}`;

  const readOverrides = () => {
    try { return JSON.parse(localStorage.getItem(PAGE_HTML_OVERRIDES_KEY) || "{}"); }
    catch { return {}; }
  };

  const saveOverride = (root) => {
    const overrides = readOverrides();
    overrides[pageKey] = root.innerHTML;
    localStorage.setItem(PAGE_HTML_OVERRIDES_KEY, JSON.stringify(overrides));
  };

  const applySavedPage = () => {
    const saved = readOverrides()[pageKey];
    const root = document.querySelector("[data-admin-edit-root]");
    if (saved && root) root.innerHTML = saved;
  };

  const setUnlocked = (value) => {
    if (value) localStorage.setItem(ADMIN_UNLOCKED_KEY, "true");
    else localStorage.removeItem(ADMIN_UNLOCKED_KEY);
  };

  const isUnlocked = () => localStorage.getItem(ADMIN_UNLOCKED_KEY) === "true";

  const mountAdminBar = () => {
    const root = document.querySelector("[data-admin-edit-root]");
    if (!root) return;

    let editing = false;
    let moving = false;
    let selected = null;

    const bar = document.createElement("div");
    bar.style.cssText = "position:fixed;bottom:14px;right:14px;z-index:9999;display:flex;gap:8px;align-items:center;background:#071f35;color:#fff;padding:10px 12px;border-radius:12px;font:700 12px Muli, sans-serif;box-shadow:0 10px 30px rgba(7,31,53,.25);";

    const buildLockedView = () => {
      bar.innerHTML = "<span>Admin</span>";
      const input = document.createElement("input");
      input.type = "password";
      input.placeholder = "Password";
      input.style.cssText = "width:108px;padding:6px 8px;border-radius:8px;border:0;";

      const unlockBtn = document.createElement("button");
      unlockBtn.textContent = "Unlock";
      unlockBtn.style.cssText = "border:0;border-radius:8px;padding:7px 10px;background:#77d770;color:#071f35;font-weight:800;cursor:pointer;";

      unlockBtn.addEventListener("click", () => {
        if (input.value === ADMIN_PASSWORD) {
          setUnlocked(true);
          buildUnlockedView();
        } else {
          input.value = "";
          input.placeholder = "Wrong password";
        }
      });

      bar.append(input, unlockBtn);
    };

    const setSelected = (node) => {
      if (selected) selected.style.outline = "";
      selected = node;
      if (selected && moving) selected.style.outline = "2px dashed #77d770";
    };

    const moveSelection = (direction) => {
      if (!selected || !selected.parentElement) return;
      const sibling = direction < 0 ? selected.previousElementSibling : selected.nextElementSibling;
      if (!sibling) return;
      if (direction < 0) selected.parentElement.insertBefore(selected, sibling);
      else selected.parentElement.insertBefore(sibling, selected);
      saveOverride(root);
    };

    const buildUnlockedView = () => {
      bar.innerHTML = "<span>Admin</span>";

      const editBtn = document.createElement("button");
      editBtn.textContent = "Edit text";
      editBtn.style.cssText = "border:0;border-radius:8px;padding:7px 10px;background:#77d770;color:#071f35;font-weight:800;cursor:pointer;";

      const moveBtn = document.createElement("button");
      moveBtn.textContent = "Move blocks";
      moveBtn.style.cssText = "border:1px solid rgba(255,255,255,.4);border-radius:8px;padding:7px 10px;background:transparent;color:#fff;font-weight:800;cursor:pointer;";

      const upBtn = document.createElement("button");
      upBtn.textContent = "↑";
      upBtn.style.cssText = "border:1px solid rgba(255,255,255,.4);border-radius:8px;padding:7px 9px;background:transparent;color:#fff;font-weight:800;cursor:pointer;";
      upBtn.addEventListener("click", () => moveSelection(-1));

      const downBtn = document.createElement("button");
      downBtn.textContent = "↓";
      downBtn.style.cssText = upBtn.style.cssText;
      downBtn.addEventListener("click", () => moveSelection(1));

      const saveBtn = document.createElement("button");
      saveBtn.textContent = "Save";
      saveBtn.style.cssText = "border:1px solid rgba(255,255,255,.4);border-radius:8px;padding:7px 10px;background:transparent;color:#fff;font-weight:800;cursor:pointer;";

      const lockBtn = document.createElement("button");
      lockBtn.textContent = "Lock";
      lockBtn.style.cssText = "border:1px solid rgba(255,255,255,.4);border-radius:8px;padding:7px 10px;background:transparent;color:#fff;font-weight:800;cursor:pointer;";

      editBtn.addEventListener("click", () => {
        editing = !editing;
        root.contentEditable = String(editing);
        root.style.outline = editing ? "2px dashed #77d770" : "";
        editBtn.textContent = editing ? "Stop text" : "Edit text";
      });

      moveBtn.addEventListener("click", () => {
        moving = !moving;
        moveBtn.textContent = moving ? "Stop move" : "Move blocks";
        if (!moving) setSelected(null);
      });

      root.addEventListener("click", (event) => {
        if (!moving) return;
        const target = event.target.closest("section, article, a, div, li, h1, h2, h3, p");
        if (!target || !root.contains(target) || target === root) return;
        event.preventDefault();
        event.stopPropagation();
        setSelected(target);
      });

      saveBtn.addEventListener("click", () => {
        saveOverride(root);
        saveBtn.textContent = "Saved";
        setTimeout(() => (saveBtn.textContent = "Save"), 900);
      });

      lockBtn.addEventListener("click", () => {
        setUnlocked(false);
        moving = false;
        editing = false;
        root.contentEditable = "false";
        root.style.outline = "";
        setSelected(null);
        buildLockedView();
      });

      bar.append(editBtn, moveBtn, upBtn, downBtn, saveBtn, lockBtn);
    };

    isUnlocked() ? buildUnlockedView() : buildLockedView();
    document.body.appendChild(bar);
  };

  document.addEventListener("DOMContentLoaded", () => {
    applySavedPage();
    mountAdminBar();
  });
})();
