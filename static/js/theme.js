/* ═══════════════════════════════════════════════════════════
   THEME MANAGER — Dark / Light Toggle
   Persists preference in localStorage
═══════════════════════════════════════════════════════════ */
(function ThemeManager() {
  'use strict';

  const KEY = 'plcgen-theme';

  function getStored() {
    try { return localStorage.getItem(KEY); } catch { return null; }
  }
  function setStored(t) {
    try { localStorage.setItem(KEY, t); } catch {}
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);

    const isDark = theme === 'dark';

    // Update ALL theme icons
    document.querySelectorAll('[id^="theme-icon"]').forEach(el => {
      el.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    });

    // Update sidebar label
    const lbl = document.getElementById('theme-label-side');
    if (lbl) lbl.textContent = isDark ? 'Light Mode' : 'Dark Mode';

    setStored(theme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  }

  // Init from storage or prefer-color-scheme
  const stored = getStored();
  if (stored) {
    applyTheme(stored);
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }

  // Wire up toggle buttons
  function wireButtons() {
    ['theme-toggle', 'theme-toggle-top'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', toggleTheme);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireButtons);
  } else {
    wireButtons();
  }

  // Expose globally
  window.ThemeManager = { toggle: toggleTheme, apply: applyTheme };
})();
