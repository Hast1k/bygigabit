let currentInterval = '15';
let currentPrice = 80000;
let chart = null;
let candleSeries = null;
let volumeSeries = null;
let tradeSide = 'long';
let orderType = 'market';
function getChartThemeOptions(theme) {
  const isLight = theme === 'light';
  return {
    layout: {
      background: { type: 'solid', color: isLight ? '#ffffff' : '#111827' },
      textColor: isLight ? '#475569' : '#9ca3af',
      fontSize: 12,
    },
    grid: {
      vertLines: { color: isLight ? '#e2e8f0' : '#1f293d' },
      horzLines: { color: isLight ? '#e2e8f0' : '#1f293d' },
    },
    rightPriceScale: {
      borderColor: isLight ? '#cbd5e1' : '#1f293d',
      scaleMargins: {
        top: 0.1,
        bottom: 0.25,
      },
    },
    timeScale: {
      borderColor: isLight ? '#cbd5e1' : '#1f293d',
      timeVisible: true,
      secondsVisible: false,
    },
  };
}
function initChart() {
  const container = document.getElementById('chartContainer');
  if (!container || typeof LightweightCharts === 'undefined') return;
  container.innerHTML = '';
  const currentTheme = localStorage.getItem('bygigabit_theme') || 'dark';
  const themeOpts = getChartThemeOptions(currentTheme);
  chart = LightweightCharts.createChart(container, {
    width: container.clientWidth,
    height: container.clientHeight || 480,
    ...themeOpts,
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
    },
  });
  window.addEventListener('themechange', (e) => {
    if (chart) {
      chart.applyOptions(getChartThemeOptions(e.detail.theme));
    }
  });
  candleSeries = chart.addCandlestickSeries({
    upColor: '#00FF00',
    downColor: '#FF0000',
    borderVisible: false,
    wickUpColor: '#00FF00',
    wickDownColor: '#FF0000',
  });
  volumeSeries = chart.addHistogramSeries({
    priceFormat: { type: 'volume' },
    priceScaleId: '',
    scaleMargins: {
      top: 0.82,
      bottom: 0,
    },
  });
  chart.subscribeCrosshairMove(param => {
    if (!param.time || !param.seriesData.get(candleSeries)) {
      return;
    }
    const data = param.seriesData.get(candleSeries);
    const vData = param.seriesData.get(volumeSeries);
    if (data) {
      document.getElementById('legO').textContent = data.open ? '$' + data.open.toLocaleString('en-US') : '—';
      document.getElementById('legH').textContent = data.high ? '$' + data.high.toLocaleString('en-US') : '—';
      document.getElementById('legL').textContent = data.low ? '$' + data.low.toLocaleString('en-US') : '—';
      document.getElementById('legC').textContent = data.close ? '$' + data.close.toLocaleString('en-US') : '—';
    }
    if (vData) {
      document.getElementById('legV').textContent = vData.value ? vData.value.toFixed(2) : '—';
    }
  });
  window.addEventListener('resize', () => {
    if (chart && container) {
      chart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight || 480
      });
    }
  });
}
async function loadKlines(interval) {
  currentInterval = interval;
  try {
    const res = await fetch(`/api/klines?symbol=BTCUSDT&interval=${interval}&limit=150`);
    const data = await res.json();
    if (data.ok && data.candles && data.candles.length > 0 && candleSeries) {
      candleSeries.setData(data.candles);
      volumeSeries.setData(data.volumes);
      const lastCandle = data.candles[data.candles.length - 1];
      const lastVol = data.volumes[data.volumes.length - 1];
      document.getElementById('legO').textContent = '$' + lastCandle.open.toLocaleString('en-US');
      document.getElementById('legH').textContent = '$' + lastCandle.high.toLocaleString('en-US');
      document.getElementById('legL').textContent = '$' + lastCandle.low.toLocaleString('en-US');
      document.getElementById('legC').textContent = '$' + lastCandle.close.toLocaleString('en-US');
      if (lastVol) {
        document.getElementById('legV').textContent = lastVol.value.toFixed(2);
      }
    }
  } catch (err) {
    console.error("Помилка завантаження свічок:", err);
  }
}
async function updateTicker() {
  try {
    const res = await fetch('/api/ticker?symbol=BTCUSDT');
    const data = await res.json();
    if (data.ok) {
      currentPrice = data.lastPrice;
      const pEl = document.getElementById('tickerPrice');
      pEl.textContent = '$' + data.lastPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const chEl = document.getElementById('tickerChange');
      const isUp = data.change24h >= 0;
      chEl.textContent = (isUp ? '+' : '') + data.change24h + '%';
      chEl.className = 'price-change ' + (isUp ? 'up' : 'down');
      document.getElementById('statHigh').textContent = '$' + data.high24h.toLocaleString('en-US');
      document.getElementById('statLow').textContent = '$' + data.low24h.toLocaleString('en-US');
      document.getElementById('statVol').textContent = Math.round(data.volume24h).toLocaleString('en-US') + ' BTC';
      const turnoverM = (data.turnover24h / 1_000_000).toFixed(1);
      document.getElementById('statTurnover').textContent = '$' + turnoverM + ' M';
      updateCalc();
      loadTerminalState();
    }
  } catch (err) {
    console.error("Помилка оновлення тікера:", err);
  }
}
async function updateOrderbook() {
  try {
    const res = await fetch('/api/orderbook?symbol=BTCUSDT&limit=6');
    const data = await res.json();
    if (data.ok) {
      const asksContainer = document.getElementById('obAsks');
      const bidsContainer = document.getElementById('obBids');
      const spreadEl = document.getElementById('obSpread');
      const allSizes = [...data.asks.map(a => a[1]), ...data.bids.map(b => b[1])];
      const maxSize = Math.max(...allSizes, 0.001);
      asksContainer.innerHTML = '';
      data.asks.slice().reverse().forEach(([p, s]) => {
        const depthPct = Math.min(100, Math.round((s / maxSize) * 100));
        const row = document.createElement('div');
        row.className = 'ob-row ask mono';
        row.innerHTML = `
          <div class="ob-depth" style="width: ${depthPct}%;"></div>
          <span class="price">$${p.toLocaleString('en-US', { minimumFractionDigits: 1 })}</span>
          <span style="color:#94a3b8;">${s.toFixed(4)}</span>
        `;
        asksContainer.appendChild(row);
      });
      spreadEl.textContent = '$' + currentPrice.toLocaleString('en-US', { minimumFractionDigits: 1 });
      bidsContainer.innerHTML = '';
      data.bids.forEach(([p, s]) => {
        const depthPct = Math.min(100, Math.round((s / maxSize) * 100));
        const row = document.createElement('div');
        row.className = 'ob-row bid mono';
        row.innerHTML = `
          <div class="ob-depth" style="width: ${depthPct}%;"></div>
          <span class="price">$${p.toLocaleString('en-US', { minimumFractionDigits: 1 })}</span>
          <span style="color:#94a3b8;">${s.toFixed(4)}</span>
        `;
        bidsContainer.appendChild(row);
      });
    }
  } catch (err) {
    console.error("Помилка стакана:", err);
  }
}
function switchBottomTab(tabName) {
  document.querySelectorAll('.bottom-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  if (tabName === 'positions') {
    document.querySelectorAll('.bottom-tab')[0].classList.add('active');
    document.getElementById('tabContentPositions').classList.add('active');
  } else if (tabName === 'orders') {
    document.querySelectorAll('.bottom-tab')[1].classList.add('active');
    document.getElementById('tabContentOrders').classList.add('active');
  } else if (tabName === 'history') {
    document.querySelectorAll('.bottom-tab')[2].classList.add('active');
    document.getElementById('tabContentHistory').classList.add('active');
  } else if (tabName === 'wallet') {
    document.querySelectorAll('.bottom-tab')[3].classList.add('active');
    document.getElementById('tabContentWallet').classList.add('active');
    loadWallet();
  }
}
async function loadTerminalState() {
  try {
    const res = await fetch('/api/terminal/state');
    if (res.status === 401) {
      window.location.href = '/auth?next=/chart';
      return;
    }
    const data = await res.json();
    if (!data.ok) return;
    const posBody = document.getElementById('positionsTableBody');
    const posBadge = document.getElementById('posCountBadge');
    posBadge.textContent = data.positions.length;
    if (data.positions.length === 0) {
      posBody.innerHTML = '<tr><td colspan="11" class="empty-state">У вас немає відкритих позицій</td></tr>';
    } else {
      posBody.innerHTML = '';
      data.positions.forEach(p => {
        const isLong = p.side === 'long';
        const curPnL = isLong ? (currentPrice - p.entryPrice) * p.size : (p.entryPrice - currentPrice) * p.size;
        const curRoi = (curPnL / p.margin) * 100;
        const isWin = curPnL >= 0;
        const sign = isWin ? '+' : '';
        const color = isWin ? 'var(--green)' : 'var(--red)';
        const tr = document.createElement('tr');
        tr.className = 'mono';
        tr.innerHTML = `
          <td style="color:#94a3b8;">${p.id}</td>
          <td><strong>${p.symbol}</strong></td>
          <td><span class="badge ${isLong ? 'badge-green' : 'badge-red'}">${p.side.toUpperCase()}</span></td>
          <td>${p.leverage}x</td>
          <td>${p.size.toFixed(4)}</td>
          <td>$${p.entryPrice.toLocaleString('en-US', { minimumFractionDigits: 1 })}</td>
          <td>$${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 1 })}</td>
          <td>$${p.margin.toFixed(2)}</td>
          <td style="color:var(--red); font-weight:600;">$${p.liqPrice.toLocaleString('en-US', { minimumFractionDigits: 1 })}</td>
          <td style="color:${color}; font-weight:700;">${sign}$${curPnL.toFixed(2)} (${sign}${curRoi.toFixed(2)}%)</td>
          <td>
            <button class="btn btn-danger" style="padding:4px 8px; font-size:11px;" onclick="closePosition('${p.id}')">
              Закрити
            </button>
          </td>
        `;
        posBody.appendChild(tr);
      });
    }
    const ordBody = document.getElementById('ordersTableBody');
    const ordBadge = document.getElementById('ordCountBadge');
    ordBadge.textContent = data.limitOrders.length;
    if (data.limitOrders.length === 0) {
      ordBody.innerHTML = '<tr><td colspan="10" class="empty-state">Немає активних лімітних заявок</td></tr>';
    } else {
      ordBody.innerHTML = '';
      data.limitOrders.forEach(o => {
        const tr = document.createElement('tr');
        tr.className = 'mono';
        tr.innerHTML = `
          <td style="color:#94a3b8;">${o.id}</td>
          <td><strong>${o.symbol}</strong></td>
          <td><span class="badge ${o.side === 'buy' ? 'badge-green' : 'badge-red'}">${o.side.toUpperCase()}</span></td>
          <td>$${o.orderPrice.toLocaleString('en-US', { minimumFractionDigits: 1 })}</td>
          <td>$${o.margin.toFixed(2)}</td>
          <td>${o.leverage}x</td>
          <td>${o.size.toFixed(4)}</td>
          <td style="font-size:11px; color:#94a3b8;">${o.createdAt}</td>
          <td><span class="badge badge-orange">АКТИВНИЙ</span></td>
          <td>
            <button class="btn btn-outline" style="padding:4px 8px; font-size:11px;" onclick="cancelOrder('${o.id}')">
              Скасувати
            </button>
          </td>
        `;
        ordBody.appendChild(tr);
      });
    }
    const histBody = document.getElementById('historyTableBody');
    if (data.history.length === 0) {
      histBody.innerHTML = '<tr><td colspan="10" class="empty-state">Історія угод порожня</td></tr>';
    } else {
      histBody.innerHTML = '';
      data.history.slice().reverse().forEach(h => {
        const isWin = h.isWin;
        const sign = isWin ? '+' : '';
        const color = isWin ? 'var(--green)' : 'var(--red)';
        const tr = document.createElement('tr');
        tr.className = 'mono';
        tr.innerHTML = `
          <td style="color:#94a3b8;">${h.id}</td>
          <td><strong>${h.symbol}</strong></td>
          <td><span class="badge ${h.side === 'long' ? 'badge-green' : 'badge-red'}">${h.side.toUpperCase()}</span></td>
          <td>$${h.entryPrice.toLocaleString('en-US', { minimumFractionDigits: 1 })}</td>
          <td>$${h.exitPrice.toLocaleString('en-US', { minimumFractionDigits: 1 })}</td>
          <td>$${h.margin.toFixed(2)}</td>
          <td>${h.leverage}x</td>
          <td style="color:${color}; font-weight:700;">${sign}$${h.pnl.toFixed(2)}</td>
          <td style="color:${color}; font-weight:700;">${sign}${h.roi.toFixed(2)}%</td>
          <td style="font-size:11px; color:#94a3b8;">${h.closedAt}</td>
        `;
        histBody.appendChild(tr);
      });
    }
    loadWallet();
  } catch (err) {
    console.error("Помилка завантаження стану термінала:", err);
  }
}
async function loadWallet() {
  try {
    const res = await fetch('/api/wallet');
    if (res.status === 401) {
      window.location.href = '/auth?next=/chart';
      return;
    }
    const data = await res.json();
    if (data.ok) {
      const bStr = '$' + data.balance.toLocaleString('en-US', { minimumFractionDigits: 2 });
      const eqStr = '$' + data.equity.toLocaleString('en-US', { minimumFractionDigits: 2 });
      const uStr = '$' + data.usedMargin.toLocaleString('en-US', { minimumFractionDigits: 2 });
      const aStr = '$' + data.availableMargin.toLocaleString('en-US', { minimumFractionDigits: 2 });
      document.getElementById('navWalletBal').textContent = eqStr;
      document.getElementById('tradeBoxBalance').textContent = 'Баланс: ' + bStr;
      if (document.getElementById('wEquity')) {
        document.getElementById('wEquity').textContent = eqStr;
        document.getElementById('wBalance').textContent = bStr;
        document.getElementById('wUsedMargin').textContent = uStr;
        document.getElementById('wAvailMargin').textContent = aStr;
      }
    }
  } catch (err) {
    console.error("Помилка завантаження гаманця:", err);
  }
}
function setTradeSide(side) {
  tradeSide = side;
  const tabLong = document.getElementById('tabLong');
  const tabShort = document.getElementById('tabShort');
  const btn = document.getElementById('btnSubmitTrade');
  if (side === 'long') {
    tabLong.className = 'trade-tab long active';
    tabShort.className = 'trade-tab short';
    btn.className = 'btn-submit-trade buy';
    btn.textContent = orderType === 'market' ? 'Відкрити Long позицію' : 'Розмістити Limit Long';
  } else {
    tabLong.className = 'trade-tab long';
    tabShort.className = 'trade-tab short active';
    btn.className = 'btn-submit-trade sell';
    btn.textContent = orderType === 'market' ? 'Відкрити Short позицію' : 'Розмістити Limit Short';
  }
  updateCalc();
}
function setOrderType(type) {
  orderType = type;
  document.getElementById('typeMarketBtn').classList.toggle('active', type === 'market');
  document.getElementById('typeLimitBtn').classList.toggle('active', type === 'limit');
  document.getElementById('limitPriceGroup').style.display = type === 'limit' ? 'block' : 'none';
  if (type === 'limit' && (!document.getElementById('inputLimitPrice').value || document.getElementById('inputLimitPrice').value == '0')) {
    document.getElementById('inputLimitPrice').value = currentPrice.toFixed(1);
  }
  setTradeSide(tradeSide);
  updateCalc();
}
function onLeverageChange(val) {
  document.getElementById('leverageVal').textContent = val + 'x';
  updateCalc();
}
function updateCalc() {
  const marginInput = document.getElementById('inputAmount');
  const slider = document.getElementById('leverageSlider');
  if (!marginInput || !slider) return;
  const margin = parseFloat(marginInput.value) || 0;
  const lev = parseInt(slider.value) || 1;
  const posSize = margin * lev;
  let basePrice = currentPrice;
  if (orderType === 'limit') {
    const lp = parseFloat(document.getElementById('inputLimitPrice').value);
    if (lp > 0) basePrice = lp;
  }
  const btcSize = basePrice > 0 ? (posSize / basePrice) : 0;
  document.getElementById('calcPosSize').textContent = '$' + posSize.toLocaleString('en-US', { minimumFractionDigits: 2 });
  document.getElementById('calcBtcSize').textContent = btcSize.toFixed(4) + ' BTC';
  let liqPrice = 0;
  if (tradeSide === 'long') {
    liqPrice = basePrice * (1 - (0.95 / lev));
  } else {
    liqPrice = basePrice * (1 + (0.95 / lev));
  }
  document.getElementById('calcLiqPrice').textContent = '$' + Math.max(0, Math.round(liqPrice)).toLocaleString('en-US');
}
async function submitOrder() {
  const margin = parseFloat(document.getElementById('inputAmount').value) || 0;
  const leverage = parseInt(document.getElementById('leverageSlider').value) || 1;
  const limitPrice = parseFloat(document.getElementById('inputLimitPrice').value) || currentPrice;
  if (margin <= 0) {
    showToast('Вкажіть суму забезпечення (маржі)');
    return;
  }
  try {
    const res = await fetch('/api/terminal/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: 'BTCUSDT',
        side: tradeSide,
        orderType: orderType,
        margin: margin,
        leverage: leverage,
        currentPrice: currentPrice,
        limitPrice: limitPrice
      })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message);
      loadTerminalState();
    } else {
      showToast(`Помилка: ${data.error || 'Не вдалося створити ордер'}`);
    }
  } catch (err) {
    showToast('Помилка мережі при відправці ордера');
  }
}
async function closePosition(posId) {
  if (!confirm('Ви дійсно бажаєте закрити позицію за поточною ціною?')) return;
  try {
    const res = await fetch('/api/terminal/close-position', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: posId, markPrice: currentPrice })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message);
      loadTerminalState();
    } else {
      showToast(`Помилка: ${data.error}`);
    }
  } catch (err) {
    showToast('Помилка при закритті позиції');
  }
}
async function cancelOrder(ordId) {
  try {
    const res = await fetch('/api/terminal/cancel-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: ordId })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message);
      loadTerminalState();
    }
  } catch (err) {
    showToast('Помилка при скасуванні ордера');
  }
}
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 4000);
}
window.addEventListener('DOMContentLoaded', async () => {
  document.querySelectorAll('.tf-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadKlines(btn.dataset.interval);
    });
  });
  initChart();
  await updateTicker();
  await loadKlines('15');
  await updateOrderbook();
  await loadTerminalState();
  setInterval(updateTicker, 3000);
  setInterval(updateOrderbook, 3000);
  setInterval(() => loadKlines(currentInterval), 15000);
  setInterval(loadTerminalState, 5000);
});
