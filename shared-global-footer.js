(function () {
  function getSiteRootPath() {
    const scriptSrc = document.currentScript?.src;
    if (scriptSrc) {
      const scriptUrl = new URL(scriptSrc, window.location.href);
      return scriptUrl.pathname.replace(/\/shared-global-footer\.js$/, "/");
    }

    const pathname = window.location.pathname;
    const lastSlash = pathname.lastIndexOf("/");
    return `${pathname.slice(0, lastSlash + 1)}`;
  }

  if (document.getElementById("ccGlobalFooter")) return;

  const root = getSiteRootPath();
  const year = new Date().getFullYear();

  const columns = [
    {
      title: "Body",
      links: [
        { label: "1RM Calculator", href: `${root}1RM Calculator/Index.html` },
        { label: "Split Sculptor", href: `${root}split-sculptor/index.html` },
        { label: "Exercise Matrix", href: `${root}exercise-matrix/index.html` },
        { label: "Physique Roadmap", href: `${root}physique-roadmap/index.html` },
        { label: "Gym Locator", href: `${root}gym-locator/index.html` },
        { label: "Macro Calculator", href: `${root}macro/index.html` },
      ],
    },
    {
      title: "Mind & Art",
      links: [
        { label: "Scriptor System", href: `${root}art/scriptor-system/index.html` },
        { label: "Gagging the Critic", href: `${root}gagging-the-critic/index.html` },
        { label: "I AM Worksheet", href: `${root}i-am-worksheet/index.html` },
      ],
    },
    {
      title: "Career & Life",
      links: [
        { label: "5 Ps Career Fit Calculator", href: `${root}career-core/index.html` },
        { label: "Founder’s Calendar", href: `${root}founders-calendar/index.html` },
        { label: "The Companion Chart", href: `${root}companion-chart/index.html` },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About", href: `${root}about/index.html` },
        { label: "Testimonials", href: `${root}testimonials.html` },
        { label: "Contact", href: `${root}contact/index.html` },
      ],
    },
    {
      title: "Get Started",
      links: [
        { label: "Client Portal", href: `${root}client-portal/index.html` },
        { label: "Apply for Coaching", href: "https://tally.so/r/w5JXKE", external: true },
        { label: "Science of Chasing Change", href: "https://chasingchange.beehiiv.com/", external: true },
      ],
    },
  ];

  function renderColumn(column) {
    const items = column.links
      .map((link) => {
        const attrs = link.external ? ' target="_blank" rel="noopener noreferrer"' : "";
        return `<li><a href="${link.href}" class="cc-global-footer-link"${attrs}>${link.label}</a></li>`;
      })
      .join("");
    return `
      <div class="cc-global-footer-col">
        <p class="cc-global-footer-col-title">${column.title}</p>
        <ul class="cc-global-footer-col-list">${items}</ul>
      </div>
    `;
  }

  const footer = document.createElement("footer");
  footer.id = "ccGlobalFooter";
  footer.className = "cc-global-footer";
  footer.innerHTML = `
    <div class="cc-global-footer-inner">
      <div class="cc-global-footer-cols">
        ${columns.map(renderColumn).join("")}
      </div>
      <div class="cc-global-footer-bottom">
        <p class="cc-global-footer-copy">© ${year} Chasing Change — 1% better every day.</p>
        <nav class="cc-global-footer-legal" aria-label="Legal">
          <a href="${root}privacy-policy/index.html" class="cc-global-footer-legal-link">Privacy Policy</a>
        </nav>
      </div>
    </div>
  `;

  const existingFooter = document.querySelector("footer:not(#ccGlobalFooter)");
  if (existingFooter) {
    existingFooter.replaceWith(footer);
  } else {
    document.body.appendChild(footer);
  }
})();
