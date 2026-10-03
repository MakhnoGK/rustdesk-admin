// Applies the persisted theme before the first paint (an external file: the CSP forbids inline scripts).
(function () {
  try {
    var stored = localStorage.getItem('rustdesk-admin-theme');
    var dark =
      stored === 'dark' ||
      ((stored === null || stored === 'system') &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {
    // Storage unavailable: the app applies the system theme once it starts.
  }
})();
