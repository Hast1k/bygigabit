let currentUserData = null;
let user2FAEnabled = false;

// ЗАВАНТАЖЕННЯ ДАНИХ ПРОФІЛЮ ТА СТАНУ 2FA
async function loadUserProfile() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.status === 401) {
      window.location.href = '/auth?next=/profile';
      return;
    }
    const data = await res.json();
    if (data.ok && data.user) {
      currentUserData = data.user;
      user2FAEnabled = !!data.user.twoFactorEnabled;

      // Оновлення нікнейма
      const nickEl = document.getElementById('profileNickname');
      if (nickEl) {
        nickEl.textContent = data.user.nickname || (data.user.email ? data.user.email.split('@')[0] : 'Трейдер');
      }

      // Оновлення пошти
      const emailEl = document.getElementById('userEmailMeta');
      if (emailEl) {
        emailEl.textContent = data.user.email;
      }

      // Оновлення бейджів ролі
      const role = (data.user.role || 'TRADER').toUpperCase();
      const userRoleBadge = document.getElementById('userRoleBadge');
      if (userRoleBadge) userRoleBadge.textContent = role;
      const roleTextMeta = document.getElementById('roleTextMeta');
      if (roleTextMeta) roleTextMeta.textContent = role;
      const navRole = document.getElementById('navRoleBadge');
      if (navRole) navRole.textContent = role + ' ROLE';

      // Оновлення статусу 2FA
      update2FAStatusUI(user2FAEnabled);

      // Оновлення кваліфікації
      const expLevel = data.user.experienceLevel || localStorage.getItem('bygigabit_experience_level') || 'beginner';
      applyQualificationUI(expLevel);
    }
  } catch (err) {
    console.error('Помилка завантаження профілю:', err);
  }
}

// ОНОВЛЕННЯ СТАТУСУ ТА КНОПОК 2FA
function update2FAStatusUI(enabled) {
  user2FAEnabled = !!enabled;

  const statusWord = document.getElementById('twoFaStatusWord');
  if (statusWord) {
    statusWord.textContent = enabled ? 'Увімкнено' : 'Вимкнено';
    statusWord.style.color = enabled ? 'var(--green)' : 'var(--red)';
  }

  const metaText = document.getElementById('user2FAStatusText');
  if (metaText) {
    metaText.innerHTML = enabled
      ? '<span class="badge badge-green">АКТИВНИЙ</span>'
      : '<span class="badge badge-red">ВИМКНЕНО</span>';
  }

  const btnAction = document.getElementById('btn2FAAction');
  if (btnAction) {
    btnAction.textContent = enabled ? 'Вимкнути 2FA' : 'Увімкнути 2FA';
  }
}

// РЕДАГУВАННЯ НІКНЕЙМА
function openEditNickname() {
  const box = document.getElementById('nicknameEditBox');
  const input = document.getElementById('inputNewNickname');
  const currentNick = document.getElementById('profileNickname').textContent;

  if (box && input) {
    box.style.display = 'flex';
    input.value = currentNick.trim();
    input.focus();
  }
}

function closeEditNickname() {
  const box = document.getElementById('nicknameEditBox');
  if (box) {
    box.style.display = 'none';
  }
}

async function saveNickname() {
  const input = document.getElementById('inputNewNickname');
  if (!input) return;

  const newNick = input.value.trim();
  if (!newNick) {
    showToast("Ім'я користувача не може бути порожнім");
    return;
  }

  try {
    const res = await fetch('/api/user/nickname', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: newNick })
    });
    const data = await res.json();
    if (data.ok) {
      document.getElementById('profileNickname').textContent = data.nickname;
      showToast(data.message || "Ім'я успішно оновлено");
      closeEditNickname();

      const cached = localStorage.getItem('bygigabit_user');
      if (cached) {
        try {
          const u = JSON.parse(cached);
          u.nickname = data.nickname;
          localStorage.setItem('bygigabit_user', JSON.stringify(u));
        } catch (e) {}
      }
    } else {
      showToast(data.error || "Помилка оновлення імені");
    }
  } catch (err) {
    showToast("Помилка з'єднання із сервером");
  }
}

// ПЕРЕМИКАННЯ КВАЛІФІКАЦІЇ ТРЕЙДЕРА
function applyQualificationUI(level) {
  const pillBeg = document.getElementById('profPillBeginner');
  const pillPro = document.getElementById('profPillPro');

  if (pillBeg && pillPro) {
    if (level === 'pro') {
      pillBeg.classList.remove('active');
      pillPro.classList.add('active');
    } else {
      pillPro.classList.remove('active');
      pillBeg.classList.add('active');
    }
  }
}

async function selectProfileLevel(level) {
  applyQualificationUI(level);
  localStorage.setItem('bygigabit_experience_level', level);

  try {
    await fetch('/api/user/experience', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ experienceLevel: level })
    });
    showToast(`Рівень кваліфікації оновлено: ${level === 'pro' ? 'PRO' : 'Новачок'}`);
  } catch (e) {}
}

// ПОКАЗ / ПРИХОВУВАННЯ ПАРОЛЯ
function togglePassField(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;

  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';

  if (btn) {
    if (isPassword) {
      btn.innerHTML = `
        <svg class="eye-svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
      `;
      btn.style.color = 'var(--cyan)';
    } else {
      btn.innerHTML = `
        <svg class="eye-svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      `;
      btn.style.color = 'var(--text-dim)';
    }
  }
}

// ЗМІНА ПАРОЛЯ
async function handlePasswordChange(e) {
  e.preventDefault();

  const currentPassword = document.getElementById('currPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const repeatPassword = document.getElementById('repeatPassword').value;

  if (newPassword.length < 8 || newPassword.length > 128) {
    showToast('Новий пароль має містити від 8 до 128 символів');
    return;
  }

  if (newPassword !== repeatPassword) {
    showToast('Новий пароль та повтор не співпадають');
    return;
  }

  try {
    const res = await fetch('/api/user/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword, repeatPassword })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message || 'Пароль успішно змінено. Інші сеанси завершено.');
      document.getElementById('formChangePassword').reset();
    } else {
      showToast(data.error || 'Помилка зміни пароля');
    }
  } catch (err) {
    showToast("Помилка з'єднання із сервером");
  }
}

// 2FA УВІМКНУТИ / ВИМКНУТИ ТА РОЗГОРТАННЯ АКОРДЕОНА
async function handle2FAToggleClick() {
  if (user2FAEnabled) {
    const disablePanel = document.getElementById('panelDisable2FA');
    const enablePanel = document.getElementById('panelEnable2FA');
    if (enablePanel) enablePanel.style.display = 'none';

    if (disablePanel) {
      const isVisible = disablePanel.style.display === 'block';
      disablePanel.style.display = isVisible ? 'none' : 'block';
      if (!isVisible) {
        document.getElementById('disableVerifyCode').value = '';
        document.getElementById('disableVerifyCode').focus();
      }
    }
  } else {
    const enablePanel = document.getElementById('panelEnable2FA');
    const disablePanel = document.getElementById('panelDisable2FA');
    if (disablePanel) disablePanel.style.display = 'none';

    if (enablePanel) {
      const isVisible = enablePanel.style.display === 'block';
      if (isVisible) {
        enablePanel.style.display = 'none';
      } else {
        enablePanel.style.display = 'block';
        await generateAndShow2FASecret();
      }
    }
  }
}

// ГЕНЕРАЦІЯ УНІКАЛЬНОГО КЛЮЧА ТА SVG QR-КОДУ
async function generateAndShow2FASecret() {
  const qrWrapper = document.getElementById('qrSvgWrapper');
  const secretInput = document.getElementById('totpSecretValue');

  if (qrWrapper) {
    qrWrapper.innerHTML = '<div class="qr-loading-spinner mono">Генерація безпечного ключа...</div>';
  }

  try {
    const res = await fetch('/api/user/2fa/generate-secret', { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      if (secretInput) {
        secretInput.value = data.secret;
      }
      if (qrWrapper) {
        qrWrapper.innerHTML = data.qr_svg;
      }
      const verifyInput = document.getElementById('enableVerifyCode');
      if (verifyInput) {
        verifyInput.value = '';
        verifyInput.focus();
      }
    } else {
      if (qrWrapper) {
        qrWrapper.innerHTML = '<div style="color:var(--red); font-size:11px;">Помилка створення QR</div>';
      }
      showToast(data.error || 'Помилка генерації ключа 2FA');
    }
  } catch (err) {
    if (qrWrapper) {
      qrWrapper.innerHTML = '<div style="color:var(--red); font-size:11px;">Помилка мережі</div>';
    }
    showToast("Помилка з'єднання із сервером");
  }
}

// КОПІЮВАННЯ СЕКРЕТНОГО КЛЮЧА
function copySecretKey() {
  const secretInput = document.getElementById('totpSecretValue');
  if (!secretInput || !secretInput.value) return;

  navigator.clipboard.writeText(secretInput.value).then(() => {
    showToast('Секретний ключ 2FA скопійовано в буфер обміну');
  }).catch(() => {
    secretInput.select();
    document.execCommand('copy');
    showToast('Секретний ключ 2FA скопійовано');
  });
}

// ПІДТВЕРДЖЕННЯ АКТИВАЦІЇ 2FA
async function submitEnable2FA() {
  const codeInput = document.getElementById('enableVerifyCode');
  const code = codeInput ? codeInput.value.trim() : '';

  if (code.length !== 6) {
    showToast('Введіть 6-значний код із застосунку або пошти');
    return;
  }

  try {
    const res = await fetch('/api/user/2fa/confirm-enable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message || 'Двофакторну автентифікацію успішно активовано!');
      update2FAStatusUI(true);
      collapse2FAPanels();
    } else {
      showToast(data.error || 'Невірний код підтвердження');
    }
  } catch (err) {
    showToast("Помилка підтвердження 2FA");
  }
}

// ПІДТВЕРДЖЕННЯ ВИМКНЕННЯ 2FA
async function submitDisable2FA() {
  const codeInput = document.getElementById('disableVerifyCode');
  const code = codeInput ? codeInput.value.trim() : '';

  if (code.length !== 6) {
    showToast('Введіть 6-значний код для підтвердження вимкнення');
    return;
  }

  try {
    const res = await fetch('/api/user/2fa/confirm-disable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message || 'Двофакторну автентифікацію вимкнено');
      update2FAStatusUI(false);
      collapse2FAPanels();
    } else {
      showToast(data.error || 'Невірний код для вимкнення 2FA');
    }
  } catch (err) {
    showToast("Помилка вимкнення 2FA");
  }
}

// ЗГОРТАННЯ ПАНЕЛЕЙ 2FA
function collapse2FAPanels() {
  const enablePanel = document.getElementById('panelEnable2FA');
  const disablePanel = document.getElementById('panelDisable2FA');
  if (enablePanel) enablePanel.style.display = 'none';
  if (disablePanel) disablePanel.style.display = 'none';
}

// ВІДПРАВКА РЕЗЕРВНОГО КОДУ НА ПОШТУ
async function sendLostKeyEmailCode() {
  try {
    const res = await fetch('/api/auth/2fa/send-email-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message || 'Одноразовий резервний код відправлено на вашу пошту!');
    } else {
      showToast(data.error || 'Помилка надсилання коду');
    }
  } catch (err) {
    showToast("Помилка з'єднання із сервером");
  }
}

// ВІРТУАЛЬНИЙ ГАМАНЕЦЬ
async function loadProfileWallet() {
  try {
    const res = await fetch('/api/wallet');
    if (res.status === 401) {
      window.location.href = '/auth?next=/profile';
      return;
    }
    const data = await res.json();
    if (data.ok) {
      const eqEl = document.getElementById('profEquity');
      const balEl = document.getElementById('profBalance');
      const usedEl = document.getElementById('profUsedMargin');
      const availEl = document.getElementById('profAvailMargin');
      const pnlEl = document.getElementById('profRealizedPnL');

      if (eqEl) eqEl.textContent = '$' + data.equity.toLocaleString('en-US', { minimumFractionDigits: 2 });
      if (balEl) balEl.textContent = '$' + data.balance.toLocaleString('en-US', { minimumFractionDigits: 2 });
      if (usedEl) usedEl.textContent = '$' + data.usedMargin.toLocaleString('en-US', { minimumFractionDigits: 2 });
      if (availEl) availEl.textContent = '$' + data.availableMargin.toLocaleString('en-US', { minimumFractionDigits: 2 });

      if (pnlEl) {
        const pnl = data.realizedPnL || 0;
        const sign = pnl >= 0 ? '+' : '';
        pnlEl.textContent = `${sign}$${pnl.toFixed(2)}`;
        pnlEl.style.color = pnl >= 0 ? 'var(--green)' : 'var(--red)';
      }
    }
  } catch (err) {
    console.error("Помилка завантаження гаманця:", err);
  }
}

async function resetWallet() {
  if (!confirm('Ви дійсно бажаєте скинути віртуальний баланс до стартових $10,000 USDT? Всі відкриті позиції буде анульовано.')) {
    return;
  }
  try {
    const res = await fetch('/api/wallet/reset', { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message);
      loadProfileWallet();
    } else {
      showToast('Помилка при скиданні балансу');
    }
  } catch (err) {
    showToast("Помилка з'єднання із сервером");
  }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 4000);
}

async function handleLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem('bygigabit_token');
    localStorage.removeItem('bygigabit_user');
    window.location.href = '/';
  } catch (e) {
    window.location.href = '/';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  loadUserProfile();
  loadProfileWallet();
});
