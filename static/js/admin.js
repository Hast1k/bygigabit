let allUsers = [];
let allPositions = [];
let allOrders = [];
let areaChartInstance = null;
let barChartInstance = null;
let activeModalUserId = null;

window.addEventListener('DOMContentLoaded', () => {
  initSidebarToggle();
  initCharts();
  loadAdminData();
});

function initSidebarToggle() {
  const sidebarToggle = document.querySelector('#sidebarToggle');
  if (sidebarToggle) {
    if (localStorage.getItem('sb|sidebar-toggle') === 'true') {
      document.body.classList.add('sb-sidenav-toggled');
    }
    sidebarToggle.addEventListener('click', event => {
      event.preventDefault();
      document.body.classList.toggle('sb-sidenav-toggled');
      localStorage.setItem('sb|sidebar-toggle', document.body.classList.contains('sb-sidenav-toggled'));
      setTimeout(() => {
        if (areaChartInstance) areaChartInstance.resize();
        if (barChartInstance) barChartInstance.resize();
      }, 300);
    });
  }
}

function switchNav(linkEl) {
  document.querySelectorAll('.sb-nav-link').forEach(el => el.classList.remove('active'));
  linkEl.classList.add('active');
  const targetId = linkEl.getAttribute('href');
  if (targetId && targetId.startsWith('#')) {
    const targetSection = document.querySelector(targetId);
    if (targetSection) {
      targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}

function syncSearch(val) {
  const tableInput = document.getElementById('userSearchInput');
  if (tableInput) {
    tableInput.value = val;
    filterUsers();
  }
}

async function loadAdminData() {
  await Promise.all([
    loadAdminStats(),
    loadAdminUsers(),
    loadAdminPositions(),
    loadAdminOrders()
  ]);
}

async function loadAdminStats() {
  try {
    const res = await fetch('/api/admin/stats');
    const data = await res.json();
    if (data.ok) {
      const s = data.stats;
      document.getElementById('statTotalUsers').textContent = s.totalUsers;
      document.getElementById('statActivePositions').textContent = s.activePositions;
      document.getElementById('statTotalBalance').textContent = '$' + (s.totalSystemBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
      document.getElementById('statBlockedUsers').textContent = s.blockedUsers;
      
      const ordersEl = document.getElementById('statActiveOrders');
      if (ordersEl) ordersEl.textContent = s.activeLimitOrders || 0;
      
      const marginEl = document.getElementById('statMarginLocked');
      if (marginEl) marginEl.textContent = '$' + (s.totalMarginLocked || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
    }
  } catch (err) {
    console.error("Помилка завантаження статистики:", err);
  }
}

async function loadAdminUsers() {
  try {
    const res = await fetch('/api/admin/users');
    const data = await res.json();
    if (data.ok) {
      allUsers = data.users || [];
      filterUsers();
    }
  } catch (err) {
    console.error("Помилка завантаження списку користувачів:", err);
  }
}

function filterUsers() {
  const query = document.getElementById('userSearchInput').value.toLowerCase().trim();
  const roleFilter = document.getElementById('userRoleFilter').value;
  const statusFilter = document.getElementById('userStatusFilter') ? document.getElementById('userStatusFilter').value : 'all';
  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML = '';

  const filtered = allUsers.filter(u => {
    const matchesEmail = u.email && u.email.toLowerCase().includes(query);
    const matchesNick = u.nickname && u.nickname.toLowerCase().includes(query);
    if (query && !matchesEmail && !matchesNick) return false;
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (statusFilter === 'active' && u.isBlocked) return false;
    if (statusFilter === 'blocked' && !u.isBlocked) return false;
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Користувачів за вказаними параметрами не знайдено</td></tr>';
    return;
  }

  filtered.forEach(u => {
    const tr = document.createElement('tr');
    const isBlocked = u.isBlocked;
    const roleBadgeClass = u.role === 'Admin' ? 'badge-red' : 'badge-cyan';
    const statusBadge = isBlocked 
      ? '<span class="badge badge-red">Заблоковано</span>' 
      : '<span class="badge badge-green">Активний</span>';
    const btnBlockText = isBlocked ? 'Розблокувати' : 'Блокувати';
    const btnBlockClass = isBlocked ? 'btn-success' : 'btn-danger';

    tr.innerHTML = `
      <td style="color:#94a3b8;" class="mono">#${u.id}</td>
      <td style="font-weight:600; color:#fff;">
        <div>${u.email}</div>
        ${u.nickname ? `<div style="font-size:11px; color:var(--text-muted); font-weight:400;">@${u.nickname}</div>` : ''}
      </td>
      <td><span class="badge ${roleBadgeClass}">${u.role}</span></td>
      <td>${u.twoFactor ? '<span style="color:var(--green); font-weight:600;">Увімкнено</span>' : '<span style="color:#64748b;">Вимкнено</span>'}</td>
      <td style="font-weight:700; color:var(--green);" class="mono">$${u.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      <td class="mono">${u.tradesCount || 0}</td>
      <td style="font-size:11px; color:#94a3b8;" class="mono">${u.registeredAt || '-'}</td>
      <td>${statusBadge}</td>
      <td class="actions-cell">
        <div class="admin-actions-dropdown">
          <button type="button" class="btn-dots-menu" onclick="toggleActionsMenu(event, ${u.id})" title="Вибір дій">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2.2"></circle>
              <circle cx="12" cy="12" r="2.2"></circle>
              <circle cx="12" cy="19" r="2.2"></circle>
            </svg>
          </button>
          <div id="actionsMenu_${u.id}" class="actions-dropdown-menu" style="display:none;">
            <button type="button" class="actions-dropdown-item" onclick="openBalanceModal(${u.id}, '${u.email}', ${u.balance}); closeAllActionMenus();">
              Баланс
            </button>
            <button type="button" class="actions-dropdown-item" onclick="changeUserRole(${u.id}, '${u.role}'); closeAllActionMenus();">
              Змінити роль
            </button>
            <button type="button" class="actions-dropdown-item" onclick="resetUser2FA(${u.id}, '${u.email}'); closeAllActionMenus();">
              Скинути 2FA
            </button>
            <button type="button" class="actions-dropdown-item ${u.isBlocked ? 'item-unblock' : 'item-danger'}" onclick="toggleBlockUser(${u.id}); closeAllActionMenus();">
              ${btnBlockText}
            </button>
            <button type="button" class="actions-dropdown-item" onclick="openTradesModal(${u.id}, '${u.email}'); closeAllActionMenus();">
              Угоди трейдера
            </button>
          </div>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function toggleBlockUser(userId) {
  try {
    const res = await fetch(`/api/admin/users/${userId}/toggle-block`, { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message);
      loadAdminData();
    } else {
      showToast(`Помилка: ${data.error}`);
    }
  } catch (err) {
    showToast('Помилка сервера при зміні статусу');
  }
}

async function changeUserRole(userId, currentRole) {
  const newRole = currentRole === 'Admin' ? 'Trader' : 'Admin';
  if (!confirm(`Змінити роль користувача #${userId} з ${currentRole} на ${newRole}?`)) {
    return;
  }
  try {
    const res = await fetch(`/api/admin/users/${userId}/role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message);
      loadAdminUsers();
    } else {
      showToast(`Помилка: ${data.error}`);
    }
  } catch (err) {
    showToast('Помилка сервера при зміні ролі');
  }
}

async function resetUser2FA(userId, email) {
  if (!confirm(`Скинути налаштування 2FA для ${email}? Користувач зможе увійти без другого фактора.`)) {
    return;
  }
  try {
    const res = await fetch(`/api/admin/users/${userId}/reset-2fa`, { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message);
      loadAdminUsers();
    } else {
      showToast(`Помилка: ${data.error}`);
    }
  } catch (err) {
    showToast('Помилка сервера при скиданні 2FA');
  }
}

function openBalanceModal(userId, email, currentBalance) {
  activeModalUserId = userId;
  document.getElementById('balanceModalEmail').textContent = email;
  document.getElementById('balanceModalInput').value = currentBalance;
  document.getElementById('balanceModal').classList.add('active');
}

function closeBalanceModal() {
  activeModalUserId = null;
  document.getElementById('balanceModal').classList.remove('active');
}

function setQuickBalance(amount) {
  document.getElementById('balanceModalInput').value = amount;
}

async function submitBalanceChange() {
  if (!activeModalUserId) return;
  const rawVal = document.getElementById('balanceModalInput').value;
  const newBalance = parseFloat(rawVal);
  if (isNaN(newBalance) || newBalance < 0) {
    showToast('Введіть коректну суму балансу (>= 0)');
    return;
  }

  try {
    const res = await fetch(`/api/admin/users/${activeModalUserId}/balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ balance: newBalance })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message);
      closeBalanceModal();
      loadAdminData();
    } else {
      showToast(`Помилка: ${data.error}`);
    }
  } catch (err) {
    showToast('Помилка сервера при оновленні балансу');
  }
}

async function openTradesModal(userId, email) {
  document.getElementById('tradesModalEmail').textContent = email;
  const tbody = document.getElementById('userTradesTableBody');
  tbody.innerHTML = '<tr><td colspan="10" class="empty-state">Завантаження журналу угод...</td></tr>';
  document.getElementById('tradesModal').classList.add('active');

  try {
    const res = await fetch(`/api/admin/users/${userId}/trades`);
    const data = await res.json();
    if (data.ok) {
      const trades = data.trades || [];
      tbody.innerHTML = '';
      if (trades.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-state">У трейдера поки немає завершених угод</td></tr>';
        return;
      }
      trades.forEach(t => {
        const tr = document.createElement('tr');
        const pnlColor = t.pnl >= 0 ? 'var(--green)' : 'var(--red)';
        const sideBadge = t.side === 'long' ? '<span class="badge badge-green">LONG</span>' : '<span class="badge badge-red">SHORT</span>';
        tr.innerHTML = `
          <td style="color:#94a3b8;" class="mono">${t.id}</td>
          <td style="font-weight:700;">${t.symbol}</td>
          <td>${sideBadge}</td>
          <td class="mono">$${Number(t.price).toFixed(2)}</td>
          <td class="mono">$${Number(t.closePrice).toFixed(2)}</td>
          <td class="mono">$${Number(t.margin).toFixed(2)}</td>
          <td class="mono">${t.leverage}x</td>
          <td style="font-weight:700; color:${pnlColor};" class="mono">${t.pnl >= 0 ? '+' : ''}$${Number(t.pnl).toFixed(2)}</td>
          <td style="color:${pnlColor};" class="mono">${t.roi >= 0 ? '+' : ''}${Number(t.roi).toFixed(2)}%</td>
          <td style="font-size:11px; color:#94a3b8;" class="mono">${t.time}</td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="10" class="empty-state">Помилка: ${data.error}</td></tr>`;
    }
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-state">Помилка зв\'язку з сервером</td></tr>';
  }
}

function closeTradesModal() {
  document.getElementById('tradesModal').classList.remove('active');
}

async function loadAdminPositions() {
  const tbody = document.getElementById('positionsTableBody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/admin/positions');
    const data = await res.json();
    if (data.ok) {
      allPositions = data.positions || [];
      renderPositionsTable();
    }
  } catch (err) {
    console.error("Помилка завантаження відкритих позицій:", err);
  }
}

function renderPositionsTable() {
  const tbody = document.getElementById('positionsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (allPositions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-state">На даний момент немає активних відкритих позицій</td></tr>';
    return;
  }

  allPositions.forEach(p => {
    const tr = document.createElement('tr');
    const sideBadge = p.side === 'long' ? '<span class="badge badge-green">LONG</span>' : '<span class="badge badge-red">SHORT</span>';
    tr.innerHTML = `
      <td style="color:#94a3b8;" class="mono">
        <div>${p.id}</div>
        ${p.time ? `<div style="font-size:10px; color:#64748b; font-weight:400;">${p.time}</div>` : ''}
      </td>
      <td style="font-weight:600; color:#fff;">${p.userEmail || ('User #' + p.user_id)}</td>
      <td style="font-weight:700; color:var(--cyan);">${p.symbol}</td>
      <td>${sideBadge}</td>
      <td class="mono">${p.size}</td>
      <td class="mono">$${Number(p.entryPrice).toFixed(2)}</td>
      <td style="color:var(--red); font-weight:700;" class="mono">$${Number(p.liqPrice).toFixed(2)}</td>
      <td class="mono">$${Number(p.margin).toFixed(2)}</td>
      <td class="mono">${p.leverage}x</td>
      <td style="text-align:right;">
        <button class="btn btn-danger" style="padding:4px 10px; font-size:11px;" onclick="adminClosePosition(${p.user_id}, '${p.id}', ${p.entryPrice})">
          Закрити
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function adminClosePosition(userId, posId, fallbackPrice) {
  if (!confirm(`Примусово закрити відкриту позицію #${posId} трейдера #${userId}?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/admin/positions/${userId}/${posId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markPrice: fallbackPrice })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message);
      loadAdminData();
    } else {
      showToast(`Помилка: ${data.error}`);
    }
  } catch (err) {
    showToast('Помилка сервера при закритті позиції');
  }
}

async function loadAdminOrders() {
  const tbody = document.getElementById('ordersTableBody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/admin/orders');
    const data = await res.json();
    if (data.ok) {
      allOrders = data.orders || [];
      renderOrdersTable();
    }
  } catch (err) {
    console.error("Помилка завантаження ордерів:", err);
  }
}

function renderOrdersTable() {
  const tbody = document.getElementById('ordersTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (allOrders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Активних лімітних ордерів не знайдено</td></tr>';
    return;
  }

  allOrders.forEach(o => {
    const tr = document.createElement('tr');
    const sideBadge = o.side === 'buy' || o.side === 'long' 
      ? '<span class="badge badge-green">BUY</span>' 
      : '<span class="badge badge-red">SELL</span>';

    const ordPrice = parseFloat(o.orderPrice ?? o.price ?? 0);
    const ordMargin = parseFloat(o.margin ?? 0);
    const ordDate = o.createdAt || o.time || '-';

    tr.innerHTML = `
      <td style="color:#94a3b8;" class="mono">${o.id}</td>
      <td style="font-weight:600; color:#fff;">${o.userEmail || ('User #' + o.user_id)}</td>
      <td style="font-weight:700; color:var(--cyan);">${o.symbol}</td>
      <td>${sideBadge}</td>
      <td style="font-weight:700;" class="mono">$${ordPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td class="mono">$${ordMargin.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td style="font-size:11px; color:#94a3b8;" class="mono">${ordDate}</td>
      <td>
        <button class="btn btn-outline" style="padding:5px 10px; font-size:11px; color:var(--red); border-color:var(--red);" onclick="adminCancelOrder(${o.user_id}, '${o.id}')">
          Скасувати
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function adminCancelOrder(userId, orderId) {
  if (!confirm(`Скасувати лімітний ордер #${orderId} та повернути маржу трейдеру?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/admin/orders/${userId}/${orderId}/cancel`, { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message);
      loadAdminData();
    } else {
      showToast(`Помилка: ${data.error}`);
    }
  } catch (err) {
    showToast('Помилка сервера при скасуванні ордера');
  }
}

function updateChartColors(theme) {
  if (typeof Chart === 'undefined') return;
  const isLight = theme === 'light';
  Chart.defaults.color = isLight ? '#475569' : '#94a3af';
  Chart.defaults.borderColor = isLight ? '#e2e8f0' : '#1f293d';
  const gridColor = isLight ? 'rgba(226, 232, 240, 0.8)' : 'rgba(31, 41, 61, 0.5)';
  if (areaChartInstance) {
    areaChartInstance.options.scales.x.grid.color = gridColor;
    areaChartInstance.options.scales.y.grid.color = gridColor;
    areaChartInstance.update();
  }
  if (barChartInstance) {
    barChartInstance.options.scales.y.grid.color = gridColor;
    barChartInstance.update();
  }
}

function initCharts() {
  if (typeof Chart === 'undefined') return;
  const currentTheme = localStorage.getItem('bygigabit_theme') || 'dark';
  const isLight = currentTheme === 'light';
  Chart.defaults.color = isLight ? '#475569' : '#94a3af';
  Chart.defaults.borderColor = isLight ? '#e2e8f0' : '#1f293d';
  Chart.defaults.font.family = "'Inter', -apple-system, sans-serif";

  window.addEventListener('themechange', (e) => {
    updateChartColors(e.detail.theme);
  });

  const ctxArea = document.getElementById('adminAreaChart');
  if (ctxArea) {
    areaChartInstance = new Chart(ctxArea, {
      type: 'line',
      data: {
        labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
        datasets: [{
          label: 'Торговий об\'єм (USDT)',
          data: [18400, 26500, 39100, 51200, 68900, 84200, 102400],
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.12)',
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#38bdf8',
          pointBorderColor: '#0b0f19',
          pointRadius: 4,
          pointHoverRadius: 6,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { grid: { color: 'rgba(31, 41, 61, 0.5)' } },
          y: {
            grid: { color: 'rgba(31, 41, 61, 0.5)' },
            ticks: {
              callback: value => '$' + (value / 1000) + 'k'
            }
          }
        }
      }
    });
  }

  const ctxBar = document.getElementById('adminBarChart');
  if (ctxBar) {
    barChartInstance = new Chart(ctxBar, {
      type: 'bar',
      data: {
        labels: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT'],
        datasets: [{
          label: 'Кількість угод',
          data: [214, 142, 98, 54, 38],
          backgroundColor: [
            'rgba(59, 130, 246, 0.85)',
            'rgba(16, 185, 129, 0.85)',
            'rgba(56, 189, 248, 0.85)',
            'rgba(245, 158, 11, 0.85)',
            'rgba(168, 85, 247, 0.85)'
          ],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: 'rgba(31, 41, 61, 0.5)' } }
        }
      }
    });
  }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 4000);
}

function toggleActionsMenu(event, userId) {
  event.stopPropagation();
  const menu = document.getElementById(`actionsMenu_${userId}`);
  if (!menu) return;
  const isShown = menu.style.display === 'block';
  closeAllActionMenus();
  if (!isShown) {
    menu.style.display = 'block';
    const btn = event.currentTarget;
    if (btn) btn.classList.add('active');

    const rect = menu.getBoundingClientRect();
    if (rect.bottom > window.innerHeight) {
      menu.style.top = 'auto';
      menu.style.bottom = '100%';
      menu.style.marginTop = '0';
      menu.style.marginBottom = '4px';
    } else {
      menu.style.top = '100%';
      menu.style.bottom = 'auto';
      menu.style.marginTop = '4px';
      menu.style.marginBottom = '0';
    }
  }
}

function closeAllActionMenus() {
  document.querySelectorAll('.actions-dropdown-menu').forEach(m => {
    m.style.display = 'none';
  });
  document.querySelectorAll('.btn-dots-menu').forEach(b => {
    b.classList.remove('active');
  });
}

document.addEventListener('click', () => {
  closeAllActionMenus();
});
