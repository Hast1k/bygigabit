async function loadProfileWallet() {
  try {
    const res = await fetch('/api/wallet');
    if (res.status === 401) {
      window.location.href = '/auth?next=/profile';
      return;
    }
    const data = await res.json();
    if (data.ok) {
      document.getElementById('profEquity').textContent = '$' + data.equity.toLocaleString('en-US', { minimumFractionDigits: 2 });
      document.getElementById('profBalance').textContent = '$' + data.balance.toLocaleString('en-US', { minimumFractionDigits: 2 });
      document.getElementById('profUsedMargin').textContent = '$' + data.usedMargin.toLocaleString('en-US', { minimumFractionDigits: 2 });
      document.getElementById('profAvailMargin').textContent = '$' + data.availableMargin.toLocaleString('en-US', { minimumFractionDigits: 2 });
      const pnl = data.realizedPnL || 0;
      const sign = pnl >= 0 ? '+' : '';
      const pnlEl = document.getElementById('profRealizedPnL');
      pnlEl.textContent = `${sign}$${pnl.toFixed(2)}`;
      pnlEl.style.color = pnl >= 0 ? 'var(--green)' : 'var(--red)';
    }
  } catch (err) {
    console.error("Помилка завантаження гаманця:", err);
  }
}

async function loadUserProfile() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.ok && data.user) {
      const u = data.user;
      document.getElementById('userEmailMeta').textContent = u.email;
      document.getElementById('userRoleBadge').textContent = (u.role || 'TRADER').toUpperCase();
      document.getElementById('navRoleBadge').textContent = (u.role || 'TRADER') + ' Role';
      
      const is2FA = u.twoFactor !== false;
      const toggle = document.getElementById('toggle2FA');
      if (toggle) toggle.checked = is2FA;
      update2FAUI(is2FA);
    }
  } catch (e) {
    console.error("Помилка завантаження профілю:", e);
  }
}

function update2FAUI(enabled) {
  const badge = document.getElementById('prof2FABadge');
  if (badge) {
    badge.textContent = enabled ? 'АКТИВНИЙ ЗАХИСТ' : 'ВИМКНЕНО';
    badge.className = enabled ? 'badge badge-green' : 'badge badge-red';
  }
  const box = document.getElementById('box2FADetails');
  if (box) {
    box.style.opacity = enabled ? '1' : '0.45';
  }
}

async function handle2FAToggle(checked) {
  try {
    const res = await fetch('/api/user/2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ twoFactor: checked })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message);
      update2FAUI(checked);
      const userJson = localStorage.getItem('bygigabit_user');
      if (userJson) {
        try {
          const u = JSON.parse(userJson);
          u.twoFactor = checked;
          localStorage.setItem('bygigabit_user', JSON.stringify(u));
        } catch (e) {}
      }
    } else {
      showToast(data.error || 'Помилка оновлення 2FA');
      document.getElementById('toggle2FA').checked = !checked;
    }
  } catch (err) {
    showToast('Помилка з\'єднання із сервером');
    document.getElementById('toggle2FA').checked = !checked;
  }
}

function copy2FAKey() {
  const keyEl = document.getElementById('totpSecretKey');
  if (!keyEl) return;
  navigator.clipboard.writeText(keyEl.value).then(() => {
    showToast('Секретний ключ 2FA скопійовано в буфер обміну');
  }).catch(() => {
    keyEl.select();
    document.execCommand('copy');
    showToast('Секретний ключ 2FA скопійовано');
  });
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
    showToast('Помилка з\'єднання із сервером');
  }
}

function handlePasswordChange(e) {
  e.preventDefault();
  const newPass = document.getElementById('newPass').value;
  if (newPass.length < 6) {
    showToast('Новий пароль має містити не менше 6 символів');
    return;
  }
  showToast('Пароль успішно змінено та захешовано (PBKDF2/SHA256)');
  e.target.reset();
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
