(function () {
  function openCoachingModal(url) {
    if (!url) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'cc-modal';
    dialog.innerHTML = `
      <div class="cc-modal-shell">
        <div class="cc-modal-head">
          <strong>Apply for Coaching</strong>
          <button type="button" class="cc-modal-close" aria-label="Close coaching form">Close</button>
        </div>
        <iframe class="cc-modal-frame" src="${url}" title="Apply for coaching form" loading="lazy"></iframe>
      </div>
    `;
    document.body.appendChild(dialog);

    const closeBtn = dialog.querySelector('.cc-modal-close');
    closeBtn?.addEventListener('click', () => {
      dialog.close();
    });

    dialog.addEventListener('close', () => {
      dialog.remove();
    });

    dialog.showModal();
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-coaching-popup-url]');
    if (!trigger) return;
    event.preventDefault();
    const url = trigger.getAttribute('data-coaching-popup-url');
    openCoachingModal(url);
  });
})();
