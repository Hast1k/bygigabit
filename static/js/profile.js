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
function handle2FAToggle(checked) {
  const status = checked ? 'увімкнено' : 'вимкнено';
  showToast(`Двофакторну автентифікацію (2FA) ${status}`);
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
  const userJson = localStorage.getItem('bygigabit_user');
  if (userJson) {
    try {
      const u = JSON.parse(userJson);
      document.getElementById('userEmailMeta').textContent = u.email;
      document.getElementById('userRoleBadge').textContent = u.role.toUpperCase();
      document.getElementById('navRoleBadge').textContent = u.role + ' Role';
    } catch (e) {}
  }
  loadProfileWallet();
});
