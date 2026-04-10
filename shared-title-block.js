(function () {
  const COACHING_URL = 'https://tally.so/r/w5JXKE';

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-coaching-popup-url]');
    if (!trigger) return;
    event.preventDefault();
    window.open(COACHING_URL, '_blank', 'noopener,noreferrer');
  });
})();
