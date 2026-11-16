let authMode = 'login';
let currentQualification = 'beginner';
let pendingGoogleEmail = '';
let isGoogleAuthPending = false;

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
  document.getElementById('tabLogin').classList.toggle('active', mode === 'login');
  document.getElementById('tabRegister').classList.toggle('active', mode === 'register');
  const title = document.getElementById('authTitle');
  const sub = document.getElementById('authSubtitle');
  const btn = document.getElementById('btnSubmitAuth');
  const repeatGroup = document.getElementById('repeatPasswordGroup');
  const nickGroup = document.getElementById('nicknameGroup');
  if (mode === 'login') {
    title.textContent = 'Вхід у ByGigaBit';
    sub.textContent = 'Введіть дані для доступу до віртуального рахунку та торгівлі';
    btn.textContent = 'Продовжити вхід';
    repeatGroup.style.display = 'none';
    if (nickGroup) nickGroup.style.display = 'none';
  } else {
    title.textContent = 'Створення акаунта трейдера';
    sub.textContent = 'Отримайте стартовий віртуальний баланс $10,000 USDT для Paper Trading';
    btn.textContent = 'Зареєструватися ($10,000 бонус)';
    repeatGroup.style.display = 'block';
    if (nickGroup) nickGroup.style.display = 'block';
  }
  cancel2FA();
}

async function handleMainSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;

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
      showToast("Помилка з'єднання із сервером");
    }
  } else {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, experienceLevel: currentQualification })
      });
      const data = await res.json();
      if (data.ok && data.requires2FA) {
        document.getElementById('authMainForm').style.display = 'none';
        document.getElementById('auth2FAStep').style.display = 'block';
        showToast(data.message);
      } else if (data.ok && data.token) {
        completeLogin(data);
      } else {
        showToast(data.error || 'Невірні облікові дані');
      }
    } catch (err) {
      showToast("Помилка з'єднання із сервером");
    }
  }
}

async function verify2FACode() {
  const email = document.getElementById('authEmail').value.trim() || pendingGoogleEmail;
  const password = document.getElementById('authPassword').value;
  const code = document.getElementById('input2FACode').value.trim();

  if (code.length !== 6) {
    showToast('Введіть 6-значний код!');
    return;
  }

  try {
    const endpoint = isGoogleAuthPending ? '/api/auth/google' : '/api/auth/login';
    const payload = isGoogleAuthPending
      ? { email: pendingGoogleEmail, code2fa: code, experienceLevel: currentQualification }
      : { email, password, code2fa: code, experienceLevel: currentQualification };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.ok && data.token) {
      completeLogin(data);
    } else {
      showToast(data.error || 'Невірний код 2FA');
    }
  } catch (err) {
    showToast('Помилка підтвердження 2FA');
  }
}

// ЗАПИТ РЕЗЕРВНОГО КОДУ 2FA НА ПОШТУ ПРИ ВХОДІ
async function requestAuthEmailBackupCode() {
  const email = document.getElementById('authEmail').value.trim() || pendingGoogleEmail;
  if (!email) {
    showToast('Вкажіть вашу електронну пошту');
    return;
  }

  try {
    const res = await fetch('/api/auth/2fa/send-email-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message || 'Одноразовий резервний код відправлено на вашу пошту!');
    } else {
      showToast(data.error || 'Помилка відправки коду');
    }
  } catch (err) {
    showToast("Помилка з'єднання із сервером");
  }
}

// ВХІД ЧЕРЕЗ GOOGLE (МОДАЛЬНЕ ВІКНО БЕЗ PROMPT/ALERT)
function startGoogleAuth() {
  openGoogleAuthModal();
}

function openGoogleAuthModal() {
  const modal = document.getElementById('modalGoogleAuth');
  if (modal) {
    modal.style.display = 'flex';
    const input = document.getElementById('customGoogleEmail');
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 50);
    }
  }
}

function closeGoogleAuthModal() {
  const modal = document.getElementById('modalGoogleAuth');
  if (modal) {
    modal.style.display = 'none';
  }
}

function chooseGoogleAccount(email) {
  closeGoogleAuthModal();
  submitGoogleEmail(email);
}

function handleCustomGoogleSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('customGoogleEmail');
  if (!input) return;
  const email = input.value.trim().toLowerCase();
  if (!email) return;
  closeGoogleAuthModal();
  submitGoogleEmail(email);
}

async function submitGoogleEmail(googleEmail) {
  googleEmail = googleEmail.trim().toLowerCase();
  pendingGoogleEmail = googleEmail;
  isGoogleAuthPending = true;

  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: googleEmail,
        nickname: googleEmail.split('@')[0],
        experienceLevel: currentQualification
      })
    });
    const data = await res.json();

    if (data.ok) {
      if (data.needsPassword) {
        // Користувачу треба задати пароль (вікно "Задайте пароль для входження в акаунт")
        openGoogleModal(data.email);
        showToast(data.message);
      } else if (data.requires2FA) {
        document.getElementById('authEmail').value = data.email || googleEmail;
        document.getElementById('authMainForm').style.display = 'none';
        document.getElementById('auth2FAStep').style.display = 'block';
        showToast(data.message);
      } else if (data.token) {
        completeLogin(data);
      }
    } else {
      showToast(data.error || 'Помилка Google авторизації');
    }
  } catch (err) {
    showToast("Помилка з'єднання із сервером Google Auth");
  }
}

function openGoogleModal(email) {
  pendingGoogleEmail = email;
  const modal = document.getElementById('modalGooglePassword');
  if (modal) {
    modal.style.display = 'flex';
    document.getElementById('googleNewPass').value = '';
    document.getElementById('googleRepeatPass').value = '';
    document.getElementById('googleNewPass').focus();
  }
}

function closeGoogleModal() {
  const modal = document.getElementById('modalGooglePassword');
  if (modal) {
    modal.style.display = 'none';
  }
}

async function handleGooglePasswordSubmit(e) {
  e.preventDefault();
  const pass = document.getElementById('googleNewPass').value;
  const repeat = document.getElementById('googleRepeatPass').value;

  if (pass.length < 8 || pass.length > 128) {
    showToast('Пароль має містити від 8 до 128 символів');
    return;
  }

  if (pass !== repeat) {
    showToast('Паролі не співпадають!');
    return;
  }

  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: pendingGoogleEmail,
        nickname: pendingGoogleEmail.split('@')[0],
        password: pass,
        experienceLevel: currentQualification
      })
    });
    const data = await res.json();
    if (data.ok) {
      closeGoogleModal();
      if (data.requires2FA) {
        document.getElementById('authEmail').value = data.email || pendingGoogleEmail;
        document.getElementById('authMainForm').style.display = 'none';
        document.getElementById('auth2FAStep').style.display = 'block';
        showToast(data.message);
      } else if (data.token) {
        completeLogin(data);
      }
    } else {
      showToast(data.error || 'Помилка встановлення пароля');
    }
  } catch (err) {
    showToast("Помилка збереження пароля");
  }
}

function completeLogin(data) {
  localStorage.setItem('bygigabit_token', data.token);
  localStorage.setItem('bygigabit_user', JSON.stringify(data.user));
  if (data.user && data.user.experienceLevel) {
    localStorage.setItem('bygigabit_experience_level', data.user.experienceLevel);
  }
  showToast(data.message);
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
  isGoogleAuthPending = false;
  pendingGoogleEmail = '';
  document.getElementById('authMainForm').style.display = 'block';
  document.getElementById('auth2FAStep').style.display = 'none';
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
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('mode') === 'register' || window.location.pathname === '/register') {
    switchAuthMode('register');
  }
});
