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
      title: "Get Started",
      links: [
        { label: "Client Portal", href: `${root}client-portal/` },
        { label: "Apply for Coaching", href: "https://tally.so/r/w5JXKE", external: true },
        { label: "Science of Chasing Change", href: "https://chasingchange.beehiiv.com/", external: true },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About", href: `${root}about/` },
        { label: "Testimonials", href: `${root}testimonials.html` },
        { label: "Contact", href: `${root}contact/` },
        { label: "Privacy Policy", href: `${root}privacy-policy/` },
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
