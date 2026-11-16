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

    const m = data.metrics || {};
    allHistory = data.history || [];

    // 1. Win Rate
    const wr = Number(m.winRate || 0);
    document.getElementById('metricWinRate').textContent = wr.toFixed(1) + '%';
    document.getElementById('winBarFill').style.width = Math.min(100, Math.max(0, wr)) + '%';
    document.getElementById('metricWinLossCount').textContent = `Прибуткові: ${m.winCount || 0} | Збиткові: ${m.lossCount || 0}`;

    // 2. Net Profit
    const net = Number(m.netProfit || 0);
    const pnlEl = document.getElementById('metricNetProfit');
    const isProfitable = net >= 0;
    const sign = isProfitable ? '+' : '';
    pnlEl.textContent = `${sign}$${net.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    pnlEl.style.color = isProfitable ? 'var(--green)' : 'var(--red)';
    const roiVal = ((net / 10000) * 100).toFixed(2);
    document.getElementById('metricProfitSub').textContent = `ROI: ${roiVal >= 0 ? '+' : ''}${roiVal}% від старту ($10k)`;

    // 3. Profit Factor & R:R
    document.getElementById('metricPF').textContent = Number(m.profitFactor || 1).toFixed(2);
    document.getElementById('metricRR').innerHTML = `Середній Risk / Reward: <strong>1:${Number(m.avgRR || 1).toFixed(2)}</strong>`;

    // 4. Total Trades & Volume
    document.getElementById('metricTotalTrades').textContent = m.totalTrades || 0;
    const vol = Number(m.totalVolume || 0);
    document.getElementById('metricVolume').textContent = `Оборот: $${vol.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;

    // 5. Expectancy & Avg Trade
    const exp = Number(m.expectancy || 0);
    const expEl = document.getElementById('metricExpectancy');
    expEl.textContent = `${exp >= 0 ? '+' : ''}$${exp.toFixed(2)}`;
    expEl.style.color = exp >= 0 ? 'var(--green)' : 'var(--red)';
    const avgTr = Number(m.avgTrade || 0);
    document.getElementById('metricAvgTrade').textContent = `Сер. результат: ${avgTr >= 0 ? '+' : ''}$${avgTr.toFixed(2)}`;

    // 6. Avg Win / Loss & Extremes
    const avgW = Number(m.avgWin || 0);
    const avgL = Number(m.avgLoss || 0);
    document.getElementById('metricAvgWinLoss').textContent = `+$${avgW.toFixed(1)} / -$${avgL.toFixed(1)}`;
    document.getElementById('metricExtremes').textContent = `Найкраща: +$${Number(m.bestTrade || 0).toFixed(2)} | Найгірша: $${Number(m.worstTrade || 0).toFixed(2)}`;

    // 7. Max Drawdown
    const dd = Number(m.maxDrawdown || 0);
    const ddPct = Number(m.maxDrawdownPct || 0);
    const ddEl = document.getElementById('metricMaxDD');
    ddEl.textContent = `-$${dd.toFixed(2)} (-${ddPct.toFixed(1)}%)`;
    if (dd > 0) {
      ddEl.style.color = 'var(--red)';
    }

    // 8. Streaks
    document.getElementById('metricStreaks').textContent = `${m.maxWinStreak || 0}W / ${m.maxLossStreak || 0}L`;
    document.getElementById('metricStreakSub').textContent = `Підряд: ${m.maxWinStreak || 0} перемог | ${m.maxLossStreak || 0} збитків`;

    // Long vs Short Breakdown
    const ls = m.longStats || { count: 0, wins: 0, winRate: 0, pnl: 0 };
    const ss = m.shortStats || { count: 0, wins: 0, winRate: 0, pnl: 0 };
    const totalSides = (ls.count || 0) + (ss.count || 0);
    const longPct = totalSides > 0 ? ((ls.count / totalSides) * 100) : 50;
    const shortPct = totalSides > 0 ? (100 - longPct) : 50;

    const rLong = document.getElementById('ratioBarLong');
    const rShort = document.getElementById('ratioBarShort');
    if (rLong) rLong.style.width = `${longPct}%`;
    if (rShort) rShort.style.width = `${shortPct}%`;

    const longPnlEl = document.getElementById('longPnl');
    if (longPnlEl) {
      const lp = Number(ls.pnl || 0);
      longPnlEl.textContent = `${lp >= 0 ? '+' : ''}$${lp.toFixed(2)}`;
      longPnlEl.style.color = lp >= 0 ? 'var(--green)' : 'var(--red)';
    }
    const longSub = document.getElementById('longStatsSub');
    if (longSub) {
      longSub.textContent = `${ls.count} угод (${longPct.toFixed(0)}%) | Win: ${ls.winRate}%`;
    }

    const shortPnlEl = document.getElementById('shortPnl');
    if (shortPnlEl) {
      const sp = Number(ss.pnl || 0);
      shortPnlEl.textContent = `${sp >= 0 ? '+' : ''}$${sp.toFixed(2)}`;
      shortPnlEl.style.color = sp >= 0 ? 'var(--green)' : 'var(--red)';
    }
    const shortSub = document.getElementById('shortStatsSub');
    if (shortSub) {
      shortSub.textContent = `${ss.count} угод (${shortPct.toFixed(0)}%) | Win: ${ss.winRate}%`;
    }

    // Pairs Breakdown
    renderPairsTable(m.pairs || []);

    // Equity Curve
    const points = data.equityCurve || [];
    drawEquityCurve(points);

    // Filter Journal
    applyFilters();
  } catch (err) {
    console.error("Помилка завантаження аналітики:", err);
  }
}

function renderPairsTable(pairs) {
  const tbody = document.getElementById('pairsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!pairs || pairs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state" style="padding:14px !important;">Немає завершених угод</td></tr>';
    return;
  }

  pairs.forEach(p => {
    const tr = document.createElement('tr');
    const pnlVal = Number(p.pnl || 0);
    const color = pnlVal >= 0 ? 'var(--green)' : 'var(--red)';
    const sign = pnlVal >= 0 ? '+' : '';
    tr.innerHTML = `
      <td><strong style="color:var(--cyan);">${p.symbol}</strong></td>
      <td class="mono" style="color:#fff;">${p.trades}</td>
      <td class="mono">${p.winRate}%</td>
      <td style="text-align:right; color:${color}; font-weight:700;" class="mono">${sign}$${pnlVal.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function drawEquityCurve(points) {
  const svg = document.getElementById('equitySvg');
  if (!svg) return;

  const w = 800;
  const h = 220;
  const padX = 40;
  const padY = 32;

  // Оновлюємо бейдж поточного балансу
  const lastBal = points.length > 0 ? points[points.length - 1].balance : 10000;
  const curBalEl = document.getElementById('equityCurrentBal');
  if (curBalEl) {
    curBalEl.textContent = `Баланс: $${Number(lastBal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // Якщо менше 2 точок, малюємо гарну пряму лінію початкового депозиту
  let effectivePoints = points;
  if (!points || points.length === 0) {
    effectivePoints = [
      { trade: 0, balance: 10000, date: 'Старт' },
      { trade: 1, balance: 10000, date: 'Зараз' }
    ];
  } else if (points.length === 1) {
    effectivePoints = [
      points[0],
      { trade: 1, balance: points[0].balance, date: 'Поточний' }
    ];
  }

  const balances = effectivePoints.map(p => p.balance);
  let minBal = Math.min(...balances);
  let maxBal = Math.max(...balances);

  if (minBal === maxBal) {
    minBal = minBal * 0.98;
    maxBal = maxBal * 1.02;
  } else {
    const diff = maxBal - minBal;
    minBal -= diff * 0.1;
    maxBal += diff * 0.1;
  }

  const range = maxBal - minBal || 1;

  const coords = effectivePoints.map((p, idx) => {
    const x = padX + (idx / Math.max(1, effectivePoints.length - 1)) * (w - padX * 2);
    const y = h - padY - ((p.balance - minBal) / range) * (h - padY * 2);
    return { x, y, b: p.balance, t: p.trade, d: p.date };
  });

  let pathD = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 1; i < coords.length; i++) {
    pathD += ` L ${coords[i].x} ${coords[i].y}`;
  }
  const areaD = `${pathD} L ${coords[coords.length - 1].x} ${h - padY} L ${coords[0].x} ${h - padY} Z`;

  const isUp = (effectivePoints[effectivePoints.length - 1].balance >= effectivePoints[0].balance);
  const strokeColor = isUp ? '#00FF00' : '#FF0055';
  const gradColor = isUp ? '#00FF00' : '#FF0055';

  let svgHtml = `
    <defs>
      <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${gradColor}" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="${gradColor}" stop-opacity="0.0"/>
      </linearGradient>
    </defs>
    <!-- Горизонтальні сітки та підписи -->
    <line x1="${padX}" y1="${padY}" x2="${w - padX}" y2="${padY}" stroke="#1f293d" stroke-dasharray="3 3"/>
    <line x1="${padX}" y1="${h / 2}" x2="${w - padX}" y2="${h / 2}" stroke="#1f293d" stroke-dasharray="3 3"/>
    <line x1="${padX}" y1="${h - padY}" x2="${w - padX}" y2="${h - padY}" stroke="#1f293d" stroke-dasharray="3 3"/>

    <text x="${padX}" y="${padY - 8}" fill="#64748b" font-size="11" font-family="JetBrains Mono" font-weight="600">$${Math.round(maxBal).toLocaleString()}</text>
    <text x="${padX}" y="${h / 2 - 6}" fill="#475569" font-size="10" font-family="JetBrains Mono">$${Math.round((maxBal + minBal) / 2).toLocaleString()}</text>
    <text x="${padX}" y="${h - padY + 16}" fill="#64748b" font-size="11" font-family="JetBrains Mono" font-weight="600">$${Math.round(minBal).toLocaleString()}</text>

    <!-- Заливка та лінія тренду -->
    <path d="${areaD}" fill="url(#eqGrad)"/>
    <path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  `;

  coords.forEach(c => {
    svgHtml += `
      <circle cx="${c.x}" cy="${c.y}" r="4" fill="#38bdf8" stroke="#070709" stroke-width="2">
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
  if (!tbody) return;
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
      <td><strong style="color:var(--cyan);">${h.symbol}</strong></td>
      <td><span class="badge ${h.side === 'long' ? 'badge-green' : 'badge-red'}">${(h.side || '').toUpperCase()}</span></td>
      <td>$${entryP.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}</td>
      <td>$${exitP.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}</td>
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
