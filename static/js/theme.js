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
  initExperienceController();
});

// ========================================================
// РІВЕНЬ КВАЛІФІКАЦІЇ ТРЕЙДЕРА (НОВАЧОК / PRO)
// ========================================================
function getExperienceLevel() {
  return localStorage.getItem('bygigabit_experience_level') || 'beginner';
}

function applyExperienceLevel(level, notifyServer = false) {
  const valid = level === 'pro' ? 'pro' : 'beginner';
  localStorage.setItem('bygigabit_experience_level', valid);
  document.documentElement.setAttribute('data-experience', valid);

  document.querySelectorAll('.exp-toggle-pill').forEach(pill => {
    pill.classList.remove('beginner', 'pro');
    pill.classList.add(valid);
    const label = pill.querySelector('.exp-label');
    if (label) {
      label.textContent = valid === 'pro' ? 'PRO ТРЕЙДЕР' : 'НОВАЧОК';
    } else {
      pill.textContent = valid === 'pro' ? 'PRO ТРЕЙДЕР' : 'НОВАЧОК';
    }
  });

  // Оновлення елементів профілю, якщо вони присутні
  const profBadge = document.getElementById('profExpBadge');
  if (profBadge) {
    profBadge.textContent = valid === 'pro' ? 'ДОСВІДЧЕНИЙ (PRO)' : 'НОВАЧОК';
    profBadge.className = valid === 'pro' ? 'badge badge-magenta' : 'badge badge-cyan';
  }
  const btnBeg = document.getElementById('profBtnBeginner');
  const btnPro = document.getElementById('profBtnPro');
  if (btnBeg && btnPro) {
    btnBeg.classList.toggle('active', valid === 'beginner');
    btnPro.classList.toggle('active', valid === 'pro');
  }

  // Показувати або приховувати підказки для новачка
  document.querySelectorAll('.beginner-guide-badge, .beginner-hint-box').forEach(el => {
    el.style.display = valid === 'beginner' ? 'block' : 'none';
  });

  window.dispatchEvent(new CustomEvent('experiencechange', { detail: { level: valid } }));

  if (notifyServer) {
    fetch('/api/user/experience', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: valid })
    }).catch(() => {});
  }
}

function toggleExperienceLevel() {
  const current = getExperienceLevel();
  const next = current === 'pro' ? 'beginner' : 'pro';
  applyExperienceLevel(next, true);
  if (typeof showToast === 'function') {
    showToast(next === 'pro' ? 'Режим PRO активовано: повний біржовий термінал' : 'Режим Новачка: підказки та розширені пояснення увімкнено');
  }
}

function initExperienceController() {
  const current = getExperienceLevel();
  applyExperienceLevel(current, false);
}

