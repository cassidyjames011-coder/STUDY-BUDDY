(() => {
  'use strict';
  const key = 'studioza_theme_v1';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let saved = null;
  try { saved = localStorage.getItem(key); } catch {}
  let theme = saved === 'dark' || saved === 'light' ? saved : system.matches ? 'dark' : 'light';
  function apply() {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#17131D' : '#F5F1EA');
    const button = document.getElementById('btn-theme-toggle');
    if (!button) return;
    button.setAttribute('aria-pressed', String(theme === 'dark'));
    document.getElementById('label-theme-toggle').textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
    document.getElementById('theme-toggle-icon').textContent = theme === 'dark' ? '☀' : '☾';
  }
  apply();
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      saved = theme;
      try { localStorage.setItem(key, theme); } catch {}
      apply();
    });
  });
  system.addEventListener('change', event => {
    if (saved === 'dark' || saved === 'light') return;
    theme = event.matches ? 'dark' : 'light';
    apply();
  });
})();

