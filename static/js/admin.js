let allUsers = [];
let areaChartInstance = null;
let barChartInstance = null;
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
function syncSearch(val) {
  const tableInput = document.getElementById('userSearchInput');
  if (tableInput) {
    tableInput.value = val;
    filterUsers();
  }
}
async function loadAdminData() {
  await Promise.all([loadAdminStats(), loadAdminUsers()]);
}
async function loadAdminStats() {
  try {
    const res = await fetch('/api/admin/stats');
    const data = await res.json();
    if (data.ok) {
      const s = data.stats;
      document.getElementById('statTotalUsers').textContent = s.totalUsers;
      document.getElementById('statActivePositions').textContent = s.activePositions;
      document.getElementById('statTotalBalance').textContent = '$' + s.totalSystemBalance.toLocaleString('en-US', { minimumFractionDigits: 2 });
      document.getElementById('statBlockedUsers').textContent = s.blockedUsers;
    }
  } catch (err) {
    console.error("Помилка завантаження статистики адмінки:", err);
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
    console.error("Помилка завантаження користувачів:", err);
  }
}
function filterUsers() {
  const query = document.getElementById('userSearchInput').value.toLowerCase().trim();
  const roleFilter = document.getElementById('userRoleFilter').value;
  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML = '';
  const filtered = allUsers.filter(u => {
    if (query && !u.email.toLowerCase().includes(query)) return false;
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    return true;
  });
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Користувачів за вказаним фільтром не знайдено</td></tr>';
    return;
  }
  filtered.forEach(u => {
    const tr = document.createElement('tr');
    tr.className = 'mono';
    const isBlocked = u.isBlocked;
    const roleBadgeClass = u.role === 'Admin' ? 'badge-red' : 'badge-cyan';
    const statusBadge = isBlocked 
      ? '<span class="badge badge-red">ЗАБЛОКОВАНО</span>' 
      : '<span class="badge badge-green">АКТИВНИЙ</span>';
    const btnText = isBlocked ? 'Розблокувати' : 'Заблокувати';
    const btnClass = isBlocked ? 'btn-success' : 'btn-danger';
    tr.innerHTML = `
      <td style="color:#94a3b8;">#${u.id}</td>
      <td style="font-weight:600; color:#fff;">${u.email}</td>
      <td><span class="badge ${roleBadgeClass}">${u.role.toUpperCase()}</span></td>
      <td>${u.twoFactor ? '<span style="color:var(--green);">Увімкнено (Email)</span>' : '<span style="color:#64748b;">Вимкнено</span>'}</td>
      <td style="font-weight:700;">$${u.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      <td>${u.tradesCount}</td>
      <td style="font-size:11px; color:#94a3b8;">${u.registeredAt}</td>
      <td>${statusBadge}</td>
      <td>
        <button class="btn ${btnClass}" style="padding:4px 10px; font-size:11px;" onclick="toggleBlockUser(${u.id})">
          ${btnText}
        </button>
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
          data: [12400, 18500, 24100, 31200, 48900, 56200, 68400],
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
          data: [142, 89, 64, 38, 22],
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
