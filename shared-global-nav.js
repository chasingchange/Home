(function () {
  const COACHING_URL = 'https://tally.so/r/w5JXKE';

  document.addEventListener('click', (event) => {
    const coachingLink = event.target.closest('[data-apply-coaching]');
    if (coachingLink) {
      coachingLink.setAttribute('href', COACHING_URL);
      coachingLink.setAttribute('target', '_blank');
      coachingLink.setAttribute('rel', 'noopener noreferrer');
    }
  });

  document.querySelectorAll('.cc-mobile-toggle').forEach((button) => {
    const controlledId = button.getAttribute('aria-controls');
    if (!controlledId) return;
    const panel = document.getElementById(controlledId);
    if (!panel) return;
    const nav = button.closest('.cc-global-nav');

    button.addEventListener('click', (event) => {
      const bounds = button.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      button.style.setProperty('--ripple-x', `${x}px`);
      button.style.setProperty('--ripple-y', `${y}px`);

      const isOpen = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!isOpen));
      button.classList.toggle('is-open', !isOpen);
      nav?.classList.toggle('is-open', !isOpen);
      panel.classList.toggle('hidden', isOpen);
    });
  });
})();
