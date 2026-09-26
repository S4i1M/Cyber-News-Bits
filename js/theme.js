/* ══════════════════════════════════════════════════════════════
   THEME MANAGER — dark/light toggle with localStorage persistence
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var stored = null;
  try { stored = localStorage.getItem('cnb-theme'); } catch (e) { /* private mode */ }

  var theme = stored || 'dark'; // cyber site → dark by default
  apply(theme);

  function apply(t) {
    document.documentElement.setAttribute('data-theme', t);
    var btn = document.getElementById('themeToggle');
    if (btn) btn.setAttribute('aria-label', 'Switch to ' + (t === 'dark' ? 'light' : 'dark') + ' theme');
  }

  // Toggle handler — delegated so it works even if button renders later
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('#themeToggle');
    if (!btn) return;
    theme = theme === 'dark' ? 'light' : 'dark';
    apply(theme);
    try { localStorage.setItem('cnb-theme', theme); } catch (err) { /* ignore */ }
  });
})();
