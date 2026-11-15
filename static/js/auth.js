let authMode = 'login';
let currentQualification = 'beginner';

function selectQualification(level) {
  currentQualification = level === 'pro' ? 'pro' : 'beginner';
  const cardBeg = document.getElementById('qualBeginner');
  const cardPro = document.getElementById('qualPro');
  const inputEl = document.getElementById('selectedQualification');
  if (cardBeg) cardBeg.classList.toggle('active', currentQualification === 'beginner');
  if (cardPro) cardPro.classList.toggle('active', currentQualification === 'pro');
  if (inputEl) inputEl.value = currentQualification;
  localStorage.setItem('bygigabit_experience_level', currentQualification);
}

function switchAuthMode(mode) {
  authMode = mode;
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const title = document.getElementById('authTitle');
  const sub = document.getElementById('authSubtitle');
  const btn = document.getElementById('btnSubmitAuth');
  const repeatGroup = document.getElementById('repeatPasswordGroup');
  const nickGroup = document.getElementById('nicknameGroup');
  const qualGroup = document.getElementById('qualificationGroup');
  const googleBtnText = document.getElementById('googleBtnText');

  if (tabLogin) tabLogin.classList.toggle('active', mode === 'login');
  if (tabRegister) tabRegister.classList.toggle('active', mode === 'register');

  if (mode === 'login') {
    if (title) title.textContent = 'Вхід у ByGigaBit';
    if (sub) sub.textContent = 'Введіть email та пароль для доступу до віртуального рахунку';
    if (btn) btn.textContent = 'Увійти в термінал';
    if (repeatGroup) repeatGroup.style.display = 'none';
    if (nickGroup) nickGroup.style.display = 'none';
    // При вході вибір ролі чи кваліфікації не потрібен — вони зберігаються у БД
    if (qualGroup) qualGroup.style.display = 'none';
    if (googleBtnText) googleBtnText.textContent = 'Продовжити через Google';
  } else {
    if (title) title.textContent = 'Створення акаунта трейдера';
    if (sub) sub.textContent = 'Отримайте стартовий віртуальний баланс $10,000 USDT для Paper Trading';
    if (btn) btn.textContent = 'Зареєструватися ($10,000 бонус)';
    if (repeatGroup) repeatGroup.style.display = 'block';
    if (nickGroup) nickGroup.style.display = 'block';
    // При реєстрації користувач обирає свій рівень кваліфікації
    if (qualGroup) qualGroup.style.display = 'block';
    if (googleBtnText) googleBtnText.textContent = 'Зареєструватися через Google';
  }
  cancel2FA();
}

async function handleMainSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;

  if (!email || !password) {
    showToast('Заповніть email та пароль');
    return;
  }

  if (authMode === 'register') {
    const repeat = document.getElementById('authPasswordRepeat').value;
    const nicknameEl = document.getElementById('authNickname');
    const nickname = nicknameEl ? nicknameEl.value.trim() : '';

    if (password !== repeat) {
      showToast('Паролі не співпадають!');
      return;
    }
    if (password.length < 6) {
      showToast('Пароль має містити не менше 6 символів');
      return;
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, nickname, password, experienceLevel: currentQualification })
      });
      const data = await res.json();
      if (data.ok) {
        completeLogin(data);
      } else {
        showToast(data.error || 'Помилка реєстрації');
      }
    } catch (err) {
      showToast('Помилка з\'єднання із сервером');
    }
  } else {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();

      if (data.ok && data.requires2FA) {
        document.getElementById('authMainForm').style.display = 'none';
        const step2FA = document.getElementById('auth2FAStep');
        step2FA.style.display = 'block';

        const targetEmailEl = document.getElementById('twoFactorTargetEmail');
        if (targetEmailEl) targetEmailEl.textContent = email;

        const codeInput = document.getElementById('input2FACode');
        if (codeInput) {
          codeInput.value = '';
          codeInput.focus();
        }
        showToast('Код безпеки надіслано на вашу пошту');
      } else if (data.ok && data.token) {
        completeLogin(data);
      } else {
        showToast(data.error || 'Невірні облікові дані');
      }
    } catch (err) {
      showToast('Помилка з\'єднання із сервером');
    }
  }
}

async function verify2FACode() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const code = document.getElementById('input2FACode').value.trim();

  if (code.length !== 6) {
    showToast('Введіть повний 6-значний код безпеки');
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, code2fa: code })
    });
    const data = await res.json();
    if (data.ok && data.token) {
      completeLogin(data);
    } else {
      showToast(data.error || 'Невірний 2FA код');
    }
  } catch (err) {
    showToast('Помилка підтвердження 2FA коду');
  }
}

// Реальна обробка Google OAuth відповіді (Google Identity Services)
window.handleGoogleCredentialResponse = async function(response) {
  if (!response || !response.credential) {
    showToast('Не вдалося отримати токен Google');
    return;
  }
  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credential: response.credential,
        experienceLevel: currentQualification
      })
    });
    const data = await res.json();
    if (data.ok && data.token) {
      completeLogin(data);
    } else {
      showToast(data.error || 'Помилка автентифікації через Google');
    }
  } catch (err) {
    showToast('Помилка зв\'язку із сервером Google');
  }
};

function startGoogleAuth() {
  const onloadEl = document.getElementById('g_id_onload');
  const googleClientId = onloadEl ? onloadEl.dataset.clientId : '';

  if (googleClientId && window.google && window.google.accounts && window.google.accounts.id) {
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: window.handleGoogleCredentialResponse
    });
    window.google.accounts.id.prompt();
  } else {
    // Якщо клієнтський GSI не активний або потрібен повний веб-редирект OAuth
    window.location.href = '/api/auth/google/login';
  }
}

function completeLogin(data) {
  localStorage.setItem('bygigabit_token', data.token);
  localStorage.setItem('bygigabit_user', JSON.stringify(data.user));
  if (data.user && data.user.experienceLevel) {
    localStorage.setItem('bygigabit_experience_level', data.user.experienceLevel);
  }
  showToast(data.message || 'Успішний вхід!');
  const urlParams = new URLSearchParams(window.location.search);
  const nextUrl = urlParams.get('next');
  setTimeout(() => {
    if (nextUrl) {
      window.location.href = nextUrl;
    } else if (data.user && data.user.role === 'Admin') {
      window.location.href = '/admin';
    } else {
      window.location.href = '/chart';
    }
  }, 1000);
}

function cancel2FA() {
  const mainForm = document.getElementById('authMainForm');
  const step2FA = document.getElementById('auth2FAStep');
  if (mainForm) mainForm.style.display = 'block';
  if (step2FA) step2FA.style.display = 'none';
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 4000);
}

window.addEventListener('DOMContentLoaded', () => {
  const savedExp = localStorage.getItem('bygigabit_experience_level') || 'beginner';
  selectQualification(savedExp);

  // Перевірка URL параметрів на наявність помилок OAuth
  const urlParams = new URLSearchParams(window.location.search);
  const authErr = urlParams.get('error');
  if (authErr) {
    if (authErr === 'google_not_configured') {
      showToast('Для входу через Google додайте GOOGLE_CLIENT_ID у файл .env');
    } else {
      showToast(`Помилка авторизації: ${authErr}`);
    }
  }

  if (urlParams.get('mode') === 'register' || window.location.pathname === '/register') {
    switchAuthMode('register');
  } else {
    switchAuthMode('login');
  }
});
