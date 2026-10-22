let authMode = 'login';
function switchAuthMode(mode) {
  authMode = mode;
  document.getElementById('tabLogin').classList.toggle('active', mode === 'login');
  document.getElementById('tabRegister').classList.toggle('active', mode === 'register');
  const title = document.getElementById('authTitle');
  const sub = document.getElementById('authSubtitle');
  const btn = document.getElementById('btnSubmitAuth');
  const repeatGroup = document.getElementById('repeatPasswordGroup');
  if (mode === 'login') {
    title.textContent = 'Вхід у ByGigaBit';
    sub.textContent = 'Введіть дані для доступу до віртуального рахунку та торгівлі';
    btn.textContent = 'Продовжити вхід';
    repeatGroup.style.display = 'none';
  } else {
    title.textContent = 'Створення акаунта трейдера';
    sub.textContent = 'Отримайте стартовий віртуальний баланс $10,000 USDT для Paper Trading';
    btn.textContent = 'Зареєструватися ($10,000 бонус)';
    repeatGroup.style.display = 'block';
  }
  cancel2FA();
}
function fillCreds(email, role) {
  document.getElementById('authEmail').value = email;
  document.getElementById('authPassword').value = 'SecurePass123!';
  showToast(`Заповнено облікові дані для ролі: ${role}`);
}
async function handleMainSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  if (authMode === 'register') {
    const repeat = document.getElementById('authPasswordRepeat').value;
    if (password !== repeat) {
      showToast('Паролі не співпадають!');
      return;
    }
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
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
        document.getElementById('auth2FAStep').style.display = 'block';
        showToast(data.message);
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
    showToast('Введіть 6-значний код!');
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
      showToast(data.error || 'Невірний код 2FA');
    }
  } catch (err) {
    showToast('Помилка підтвердження 2FA');
  }
}
function completeLogin(data) {
  localStorage.setItem('bygigabit_token', data.token);
  localStorage.setItem('bygigabit_user', JSON.stringify(data.user));
  showToast(data.message);
  const urlParams = new URLSearchParams(window.location.search);
  const nextUrl = urlParams.get('next');
  setTimeout(() => {
    if (nextUrl) {
      window.location.href = nextUrl;
    } else if (data.user.role === 'Admin') {
      window.location.href = '/admin';
    } else {
      window.location.href = '/chart';
    }
  }, 1000);
}
function cancel2FA() {
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
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('mode') === 'register' || window.location.pathname === '/register') {
    switchAuthMode('register');
  }
});
