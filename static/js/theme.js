function getSavedTheme() {
  return localStorage.getItem('bygigabit_theme') || 'dark';
}
function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    if (document.body) document.body.classList.add('light-theme');
  } else {
    document.documentElement.removeAttribute('data-theme');
    if (document.body) document.body.classList.remove('light-theme');
  }
  localStorage.setItem('bygigabit_theme', theme);
  document.querySelectorAll('.btn-theme-toggle').forEach(btn => {
    btn.textContent = theme === 'light' ? 'Тема: Світла' : 'Тема: Темна';
  });
  window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
}
function toggleTheme() {
  const current = getSavedTheme();
  const next = current === 'light' ? 'dark' : 'light';
  applyTheme(next);
}
(function() {
  const saved = getSavedTheme();
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
window.addEventListener('DOMContentLoaded', () => {
  const saved = getSavedTheme();
  applyTheme(saved);
});
