let allHistory = [];
async function loadAnalytics() {
  try {
    const res = await fetch('/api/analytics/metrics');
    if (res.status === 401) {
      window.location.href = '/auth?next=/analytics';
      return;
    }
    const data = await res.json();
    if (!data.ok) return;
    const m = data.metrics;
    allHistory = data.history || [];
    document.getElementById('metricWinRate').textContent = m.winRate.toFixed(1) + '%';
    document.getElementById('winBarFill').style.width = Math.min(100, m.winRate) + '%';
    document.getElementById('metricWinLossCount').textContent = `Прибуткові: ${m.winCount} | Збиткові: ${m.lossCount}`;
    const pnlEl = document.getElementById('metricNetProfit');
    const isProfitable = m.netProfit >= 0;
    const sign = isProfitable ? '+' : '';
    pnlEl.textContent = `${sign}$${m.netProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    pnlEl.style.color = isProfitable ? 'var(--green)' : 'var(--red)';
    document.getElementById('metricPF').textContent = m.profitFactor.toFixed(2);
    document.getElementById('metricRR').innerHTML = `Середній R:R: <strong>1:${m.avgRR.toFixed(2)}</strong>`;
    document.getElementById('metricTotalTrades').textContent = m.totalTrades;
    document.getElementById('metricExtremes').textContent = `Найкраща: +$${m.bestTrade} | Найгірша: $${m.worstTrade}`;
    drawEquityCurve(data.equityCurve || []);
    applyFilters();
  } catch (err) {
    console.error("Помилка завантаження аналітики:", err);
  }
}
function drawEquityCurve(points) {
  const svg = document.getElementById('equitySvg');
  if (!svg || points.length === 0) return;
  const w = 800;
  const h = 200;
  const pad = 30;
  const balances = points.map(p => p.balance);
  const minBal = Math.min(...balances) * 0.98;
  const maxBal = Math.max(...balances) * 1.02;
  const range = maxBal - minBal || 1;
  const coords = points.map((p, idx) => {
    const x = pad + (idx / Math.max(1, points.length - 1)) * (w - pad * 2);
    const y = h - pad - ((p.balance - minBal) / range) * (h - pad * 2);
    return { x, y, b: p.balance, t: p.trade };
  });
  let pathD = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 1; i < coords.length; i++) {
    pathD += ` L ${coords[i].x} ${coords[i].y}`;
  }
  const areaD = `${pathD} L ${coords[coords.length - 1].x} ${h - pad} L ${coords[0].x} ${h - pad} Z`;
  let svgHtml = `
    <defs>
      <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#00FF00" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="#00FF00" stop-opacity="0.0"/>
      </linearGradient>
    </defs>
    <!-- Горизонтальні лінії сітки -->
    <line x1="${pad}" y1="${pad}" x2="${w - pad}" y2="${pad}" stroke="#1f293d" stroke-dasharray="4"/>
    <line x1="${pad}" y1="${h / 2}" x2="${w - pad}" y2="${h / 2}" stroke="#1f293d" stroke-dasharray="4"/>
    <line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="#1f293d" stroke-dasharray="4"/>
    <text x="${pad + 4}" y="${pad + 12}" fill="#64748b" font-size="11" font-family="JetBrains Mono">$${Math.round(maxBal).toLocaleString()}</text>
    <text x="${pad + 4}" y="${h - pad - 6}" fill="#64748b" font-size="11" font-family="JetBrains Mono">$${Math.round(minBal).toLocaleString()}</text>
    <!-- Заливка та лінія -->
    <path d="${areaD}" fill="url(#eqGrad)"/>
    <path d="${pathD}" fill="none" stroke="#00FF00" stroke-width="2.5" stroke-linecap="round"/>
  `;
  coords.forEach(c => {
    svgHtml += `
      <circle cx="${c.x}" cy="${c.y}" r="4" fill="#38bdf8" stroke="#0b0f19" stroke-width="2">
        <title>Угода #${c.t}: $${c.b.toLocaleString()}</title>
      </circle>
    `;
  });
  svg.innerHTML = svgHtml;
}
function applyFilters() {
  const filterSide = document.getElementById('filterSide').value;
  const filterResult = document.getElementById('filterResult').value;
  const tbody = document.getElementById('journalTableBody');
  tbody.innerHTML = '';
  let filtered = allHistory.filter(item => {
    const isWin = item.isWin !== undefined ? item.isWin : ((item.pnl || 0) >= 0);
    if (filterSide !== 'all' && item.side !== filterSide) return false;
    if (filterResult === 'win' && !isWin) return false;
    if (filterResult === 'loss' && isWin) return false;
    return true;
  });
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-state">Угод за обраними фільтрами не знайдено</td></tr>';
    return;
  }
  filtered.forEach(h => {
    const isWin = h.isWin !== undefined ? h.isWin : ((h.pnl || 0) >= 0);
    const sign = isWin ? '+' : '';
    const color = isWin ? 'var(--green)' : 'var(--red)';
    const entryP = Number(h.entryPrice ?? h.price ?? 0);
    const exitP = Number(h.exitPrice ?? h.closePrice ?? 0);
    const margin = Number(h.margin ?? 0);
    const leverage = h.leverage ?? 10;
    const pnl = Number(h.pnl ?? 0);
    const roi = Number(h.roi ?? 0);
    const timeStr = h.closedAt ?? h.time ?? '--';
    const tr = document.createElement('tr');
    tr.className = 'mono';
    tr.innerHTML = `
      <td style="color:#94a3b8;">${h.id}</td>
      <td><strong>${h.symbol}</strong></td>
      <td><span class="badge ${h.side === 'long' ? 'badge-green' : 'badge-red'}">${h.side.toUpperCase()}</span></td>
      <td>$${entryP.toLocaleString('en-US', { minimumFractionDigits: 1 })}</td>
      <td>$${exitP.toLocaleString('en-US', { minimumFractionDigits: 1 })}</td>
      <td>$${margin.toFixed(2)}</td>
      <td>${leverage}x</td>
      <td style="color:${color}; font-weight:700;">${sign}$${pnl.toFixed(2)}</td>
      <td style="color:${color}; font-weight:700;">${sign}${roi.toFixed(2)}%</td>
      <td style="font-size:11px; color:#94a3b8;">${timeStr}</td>
    `;
    tbody.appendChild(tr);
  });
}
window.addEventListener('DOMContentLoaded', () => {
  loadAnalytics();
});
