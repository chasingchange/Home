(function () {
  function getSiteRootPath() {
    const scriptSrc = document.currentScript?.src;
    if (scriptSrc) {
      const scriptUrl = new URL(scriptSrc, window.location.href);
      return scriptUrl.pathname.replace(/\/shared-global-nav\.js$/, "/");
    }

    const pathname = window.location.pathname;
    const lastSlash = pathname.lastIndexOf("/");
    return `${pathname.slice(0, lastSlash + 1)}`;
  }

  if (typeof window.removeLegacyTitleCards === "function") {
    window.removeLegacyTitleCards();
  }

  const existingGlobalNav = document.getElementById("ccGlobalNav");
  if (existingGlobalNav) return;

  const root = getSiteRootPath();
  const nav = document.createElement("header");
  nav.className = "cc-global-nav-wrap";
  nav.innerHTML = `
    <nav id="ccGlobalNav" aria-label="Primary navigation" class="cc-global-nav">
      <a href="${root}index.html" class="cc-global-nav-link cc-global-nav-link--home">Home</a>
      <a href="${root}testimonials.html" class="cc-global-nav-link">Testimonials</a>
      <a href="${root}about/index.html" class="cc-global-nav-link">About</a>
      <a href="https://tally.so/r/w5JXKE" class="cc-global-nav-link" target="_blank" rel="noopener noreferrer">Apply for Coaching</a>
      <a href="${root}contact/index.html" class="cc-global-nav-link">Contact</a>
      <span class="cc-global-nav-separator" aria-hidden="true">|</span>
      <button type="button" data-core="Body" class="cc-global-nav-core">Body</button>
      <button type="button" data-core="Art" class="cc-global-nav-core">Art</button>
      <button type="button" data-core="Mind" class="cc-global-nav-core">Mind</button>
      <button type="button" data-core="Soul" class="cc-global-nav-core">Soul</button>
      <button type="button" data-core="Career" class="cc-global-nav-core">Career</button>
      <button type="button" data-core="Life" class="cc-global-nav-core">Life</button>
    </nav>
    <section id="ccGlobalMegaMenu" class="cc-global-mega cc-is-hidden" aria-live="polite">
      <p id="ccGlobalMegaTitle" class="cc-global-mega-title"></p>
      <div id="ccGlobalMegaItems" class="cc-global-mega-items"></div>
    </section>
  `;

  document.body.prepend(nav);

  const resources = [
    { title: "1RM Calculator", core: "Body", url: `${root}1RM Calculator/Index.html` },
    { title: "Split Sculptor", core: "Body", url: `${root}split-sculptor/index.html` },
    { title: "Running Calculator", core: "Body", url: `${root}running-calculator/index.html` },
    { title: "Macro Calculator", core: "Body", url: `${root}macro/index.html` },
    { title: "Gym Locator", core: "Body", url: `${root}gym-locator/index.html` },
    { title: "Scriptor System", core: "Art", url: `${root}art/scriptor-system/index.html` },
    { title: "Gagging the Critic", core: "Mind", url: `${root}gagging-the-critic/index.html` },
    { title: "Preparing Route", core: "Mind", url: `${root}preparing-route/index.html` },
    { title: "5 Ps Career Fit Calculator", core: "Career", url: `${root}career-core/index.html` },
    { title: "Exercise Matrix", core: "Life", url: `${root}exercise-matrix/index.html` },
    { title: "Physique Roadmap", core: "Soul", url: `${root}physique-roadmap/index.html` },
  ];

  const coreTopBar = nav.querySelector("#ccGlobalNav");
  const coreMegaMenu = nav.querySelector("#ccGlobalMegaMenu");
  const coreMegaMenuTitle = nav.querySelector("#ccGlobalMegaTitle");
  const coreMegaMenuItems = nav.querySelector("#ccGlobalMegaItems");

  function setActiveCoreTab(activeTab) {
    coreTopBar.querySelectorAll("button[data-core]").forEach((btn) => {
      const active = btn === activeTab;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-expanded", active ? "true" : "false");
    });
  }

  function renderCoreMegaMenu(activeCore) {
    const coreMatches = resources
      .filter((resource) => resource.core.toLowerCase() === activeCore.toLowerCase())
      .sort((a, b) => a.title.localeCompare(b.title));

    if (!coreMatches.length) {
      coreMegaMenu.classList.add("cc-is-hidden");
      return;
    }

    coreMegaMenuTitle.textContent = `Explore ${activeCore}`;
    coreMegaMenuItems.innerHTML = coreMatches
      .map((resource) => `<a href="${resource.url}" class="cc-global-mega-item">${resource.title}</a>`)
      .join("");
    coreMegaMenu.classList.remove("cc-is-hidden");
  }

  coreTopBar.addEventListener("click", (event) => {
    const tab = event.target.closest("button[data-core]");
    if (!tab) return;

    const isActive = tab.getAttribute("aria-expanded") === "true";
    if (isActive) {
      coreMegaMenu.classList.add("cc-is-hidden");
      setActiveCoreTab(null);
      return;
    }

    renderCoreMegaMenu(tab.dataset.core);
    setActiveCoreTab(tab);
  });

  document.addEventListener("click", (event) => {
    if (coreTopBar.contains(event.target) || coreMegaMenu.contains(event.target)) return;
    coreMegaMenu.classList.add("cc-is-hidden");
    setActiveCoreTab(null);
  });

  const hasBottomCta = document.querySelector(".cc-bottom-coaching-wrap");
  if (!hasBottomCta) {
    const footer = document.querySelector("footer");
    const copyrightLine = Array.from(document.querySelectorAll("p")).find((p) => /©\s*\d{4}\s*Chasing Change/i.test((p.textContent || "").trim()));
    const anchor = footer || copyrightLine?.closest("footer") || copyrightLine;
    const container = anchor?.parentElement;

    if (anchor && container) {
      const ctaWrap = document.createElement("section");
      ctaWrap.className = "cc-bottom-coaching-wrap";
      ctaWrap.innerHTML = `
        <a href="https://tally.so/r/w5JXKE" class="cc-title-coaching cc-bottom-coaching" target="_blank" rel="noopener noreferrer">
          Want this dialed in? Apply for coaching →
        </a>
      `;
      container.insertBefore(ctaWrap, anchor);
    }
  }
})();
