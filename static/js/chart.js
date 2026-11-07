let currentSymbol = localStorage.getItem('bygigabit_active_pair') || 'BTCUSDT';
let currentInterval = '15';
let currentPrice = 80000;
let chart = null;
let candleSeries = null;
let volumeSeries = null;
let tradeSide = 'long';
let orderType = 'market';
let allPairsList = [];
let currentPairTab = 'top';

function formatPrice(p) {
  if (p === undefined || p === null || isNaN(p)) return '---.--';
  if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return p.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}
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
    const res = await fetch(`/api/klines?symbol=${currentSymbol}&interval=${interval}&limit=150`);
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
    const res = await fetch(`/api/ticker?symbol=${currentSymbol}`);
    const data = await res.json();
    if (data.ok) {
      currentPrice = data.lastPrice;
      const base = currentSymbol.replace('USDT', '');
      const pEl = document.getElementById('tickerPrice');
      pEl.textContent = '$' + formatPrice(data.lastPrice);
      const chEl = document.getElementById('tickerChange');
      const isUp = data.change24h >= 0;
      chEl.textContent = (isUp ? '+' : '') + data.change24h + '%';
      chEl.className = 'price-change ' + (isUp ? 'up' : 'down');
      document.getElementById('statHigh').textContent = '$' + formatPrice(data.high24h);
      document.getElementById('statLow').textContent = '$' + formatPrice(data.low24h);
      const statVol = document.getElementById('statVol');
      if (statVol) {
        statVol.textContent = Math.round(data.volume24h).toLocaleString('en-US') + ' ' + base;
      }
      const statVolLabel = document.getElementById('statVolLabel');
      if (statVolLabel) {
        statVolLabel.textContent = `24h Об'єм (${base})`;
      }
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
    const res = await fetch(`/api/orderbook?symbol=${currentSymbol}&limit=6`);
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

    // Обробка сповіщень про автоліквідації
    if (data.liquidations && data.liquidations.length > 0) {
      data.liquidations.forEach(liq => {
        showToast(`УВАГА: Позицію ${liq.pos_id} (${liq.symbol} ${liq.side.toUpperCase()}) примусово ЛІКВІДОВАНО біржею за ціною $${Number(liq.exitPrice).toLocaleString('en-US')}! Втрачено маржу: $${liq.margin}.`, true);
      });
    }

    // Синхронізація Chaos Mode бекенду
    if (data.chaosActive !== undefined && !userManuallyToggledChaos) {
      syncChaosUI(data.chaosActive);
    }

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
  const base = currentSymbol.replace('USDT', '');
  if (side === 'long') {
    tabLong.className = 'trade-tab long active';
    tabShort.className = 'trade-tab short';
    btn.className = 'btn-submit-trade buy';
    btn.textContent = orderType === 'market' ? `Купити ${base} (Long)` : `Лімітний Long (${base})`;
  } else {
    tabLong.className = 'trade-tab long';
    tabShort.className = 'trade-tab short active';
    btn.className = 'btn-submit-trade sell';
    btn.textContent = orderType === 'market' ? `Продати ${base} (Short)` : `Лімітний Short (${base})`;
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
  const base = currentSymbol.replace('USDT', '');
  document.getElementById('calcBtcSize').textContent = btcSize.toFixed(4) + ' ' + base;
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

  const submitBtn = document.getElementById('btnSubmitTrade');
  const originalText = submitBtn ? submitBtn.textContent : '';

  if (chaosModeActive && submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'ОБРОБКА В МЕРЕЖІ (CHAOS)...';
    // Симуляція затримки мережі клієнта
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 400 + 350)));
  }

  try {
    const res = await fetch('/api/terminal/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: currentSymbol,
        side: tradeSide,
        orderType: orderType,
        margin: margin,
        leverage: leverage,
        currentPrice: currentPrice,
        limitPrice: limitPrice,
        chaosMode: chaosModeActive
      })
    });
    const data = await res.json();
    if (data.ok) {
      if (data.chaosInfo) {
        showToast(`Виконано в Chaos Mode: затримка ${data.chaosInfo.latencyMs}мс | Прослизання ціни ${data.chaosInfo.slippagePcnt}% (за $${Number(data.chaosInfo.executedPrice).toLocaleString('en-US')})`, false);
      } else {
        showToast(data.message);
      }
      loadTerminalState();
    } else {
      showToast(`Помилка: ${data.error || 'Не вдалося створити ордер'}`);
    }
  } catch (err) {
    showToast('Помилка мережі при відправці ордера');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
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
function showToast(msg, isAlert = false) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  if (isAlert) {
    t.style.background = '#ef4444';
    t.style.color = '#ffffff';
    t.style.borderColor = '#b91c1c';
  } else {
    t.style.background = '';
    t.style.color = '';
    t.style.borderColor = '';
  }
  setTimeout(() => { t.style.display = 'none'; }, 5000);
}

// ---------------- CHAOS MODE КОНТРОЛЕР ----------------
let chaosModeActive = false;
let userManuallyToggledChaos = false;
let pingInterval = null;

function syncChaosUI(active) {
  chaosModeActive = active;
  const switchBtn = document.getElementById('chaosSwitchBtn');
  const controls = document.getElementById('chaosControlsStrip');
  const banner = document.getElementById('chaosAlertBanner');

  if (active) {
    if (switchBtn) switchBtn.classList.add('active');
    if (controls) controls.style.display = 'flex';
    if (banner) banner.style.display = 'flex';
    if (!pingInterval) {
      pingInterval = setInterval(() => {
        const pingEl = document.getElementById('chaosPingDisplay');
        if (pingEl) pingEl.textContent = `PING: ${Math.floor(Math.random() * 350 + 480)}ms`;
      }, 1500);
    }
  } else {
    if (switchBtn) switchBtn.classList.remove('active');
    if (controls) controls.style.display = 'none';
    if (banner) banner.style.display = 'none';
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
  }
}

async function toggleChaosMode() {
  userManuallyToggledChaos = true;
  chaosModeActive = !chaosModeActive;
  syncChaosUI(chaosModeActive);

  try {
    const res = await fetch('/api/chaos/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: chaosModeActive })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(chaosModeActive ? 'CHAOS MODE АКТИВОВАНО: стрес-тестування трейдера увімкнено' : 'CHAOS MODE ВИМКНЕНО: повернено нормальний ринок');
    }
  } catch (err) {
    console.error('Помилка перемикання Chaos Mode:', err);
  }
}

async function triggerFlashCrash(direction, percent) {
  try {
    const res = await fetch('/api/chaos/flash-crash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: currentSymbol,
        direction: direction,
        percent: percent,
        duration: 25
      })
    });
    const data = await res.json();
    if (data.ok) {
      const dirText = direction === 'dump' ? 'ОБВАЛ (-' : 'СКВИЗ (+';
      showToast(`УВАГА: СПРОВОКОВАНО FLASH ${dirText}${percent}%) НА ${currentSymbol}!`, true);
      const bannerMsg = document.getElementById('chaosAlertMsg');
      if (bannerMsg) {
        bannerMsg.textContent = `УВАГА: FLASH ${direction.toUpperCase()} (${direction === 'dump' ? '-' : '+'}${percent}%) НА ${currentSymbol}! Ризик миттєвої ліквідації.`;
      }
      updateTicker();
      loadKlines(currentInterval);
      updateOrderbook();
      loadTerminalState();
      updateAiPrediction();
    }
  } catch (err) {
    showToast('Помилка запуску Flash Crash');
  }
}

async function resetFlashCrash() {
  try {
    const res = await fetch('/api/chaos/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: currentSymbol })
    });
    const data = await res.json();
    if (data.ok) {
      showToast('Ринкову ціну відновлено до норми');
      updateTicker();
      loadKlines(currentInterval);
      updateOrderbook();
      loadTerminalState();
      updateAiPrediction();
    }
  } catch (err) {
    showToast('Помилка відновлення ціни');
  }
}

// ---------------- СЕЛЕКТОР ТОРГОВИХ ПАР (BINARIUM / BYBIT СТИЛЬ) ----------------
const TOP_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'TONUSDT', 'XRPUSDT',
  'BNBUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'SUIUSDT',
  'NEARUSDT', 'LINKUSDT', 'PEPEUSDT', 'SHIBUSDT'
];

async function loadPairsList() {
  try {
    const res = await fetch('/api/tickers');
    const data = await res.json();
    if (data.ok && data.tickers) {
      allPairsList = data.tickers;
      renderPairsList();
    }
  } catch (err) {
    console.error("Помилка завантаження списку пар:", err);
  }
}

function renderPairsList() {
  const container = document.getElementById('pairListScroll');
  if (!container) return;

  const searchInput = document.getElementById('pairSearchInput');
  const query = (searchInput ? searchInput.value : '').trim().toUpperCase();

  let list = [...allPairsList];

  // Якщо Bybit API ще не відповів, показуємо дефолтний топ
  if (list.length === 0) {
    list = TOP_SYMBOLS.map(s => ({
      symbol: s,
      base: s.replace('USDT', ''),
      price: s === 'BTCUSDT' ? 74000 : (s === 'ETHUSDT' ? 2100 : 85),
      change24h: 0.0
    }));
  }

  // Фільтрація за вкладкою
  if (currentPairTab === 'top') {
    list = list.filter(p => TOP_SYMBOLS.includes(p.symbol));
  } else if (currentPairTab === 'gainers') {
    list = list.filter(p => p.change24h > 0).sort((a, b) => b.change24h - a.change24h);
  } else if (currentPairTab === 'losers') {
    list = list.filter(p => p.change24h < 0).sort((a, b) => a.change24h - b.change24h);
  }

  // Фільтрація за пошуком
  if (query) {
    list = list.filter(p => p.symbol.includes(query) || p.base.includes(query));
  }

  if (list.length === 0) {
    container.innerHTML = '<div class="pair-empty">Пар за запитом не знайдено</div>';
    return;
  }

  container.innerHTML = list.map(item => {
    const isActive = item.symbol === currentSymbol;
    const isUp = item.change24h >= 0;
    const sign = isUp ? '+' : '';
    const badgeText = item.base.slice(0, 4);

    return `
      <div class="pair-list-item ${isActive ? 'active' : ''}" onclick="selectPair('${item.symbol}')">
        <div class="pair-item-left">
          <div class="pair-coin-badge">${badgeText}</div>
          <div class="pair-name-group">
            <span class="pair-symbol-text">${item.base} / USDT</span>
            <span class="pair-quote-text">SPOT V5</span>
          </div>
        </div>
        <div class="pair-item-right">
          <span class="pair-price-text">$${formatPrice(item.price)}</span>
          <span class="pair-change-badge ${isUp ? 'up' : 'down'}">${sign}${item.change24h.toFixed(2)}%</span>
        </div>
      </div>
    `;
  }).join('');
}

async function selectPair(symbol) {
  if (currentSymbol === symbol) {
    closePairDropdown();
    return;
  }

  currentSymbol = symbol;
  localStorage.setItem('bygigabit_active_pair', symbol);

  const base = symbol.replace('USDT', '');
  const labelEl = document.getElementById('currentSymbolLabel');
  if (labelEl) labelEl.textContent = `${base} / USDT`;

  const statVolLabel = document.getElementById('statVolLabel');
  if (statVolLabel) statVolLabel.textContent = `24h Об'єм (${base})`;

  const obBase = document.getElementById('obBaseAsset');
  if (obBase) obBase.textContent = base;

  closePairDropdown();
  setTradeSide(tradeSide);

  // Оновлюємо дані для нової пари
  await updateTicker();
  await loadKlines(currentInterval);
  await updateOrderbook();
  renderPairsList();
}

function togglePairDropdown() {
  const wrapper = document.getElementById('symbolDropdownWrapper');
  if (!wrapper) return;
  wrapper.classList.toggle('open');
  if (wrapper.classList.contains('open')) {
    const searchInput = document.getElementById('pairSearchInput');
    if (searchInput) {
      searchInput.value = '';
      setTimeout(() => searchInput.focus(), 50);
    }
    renderPairsList();
  }
}

function closePairDropdown() {
  const wrapper = document.getElementById('symbolDropdownWrapper');
  if (wrapper) wrapper.classList.remove('open');
}

function initPairSelector() {
  const btn = document.getElementById('symbolDropdownBtn');
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePairDropdown();
    });
  }

  const dropdown = document.getElementById('pairDropdownMenu');
  if (dropdown) {
    dropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  document.addEventListener('click', () => {
    closePairDropdown();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePairDropdown();
  });

  const searchInput = document.getElementById('pairSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderPairsList();
    });
  }

  document.querySelectorAll('.pair-tab-btn').forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
      document.querySelectorAll('.pair-tab-btn').forEach(b => b.classList.remove('active'));
      tabBtn.classList.add('active');
      currentPairTab = tabBtn.dataset.tab;
      renderPairsList();
    });
  });

  // Встановлюємо збережену пару при завантаженні
  const base = currentSymbol.replace('USDT', '');
  const labelEl = document.getElementById('currentSymbolLabel');
  if (labelEl) labelEl.textContent = `${base} / USDT`;
  const statVolLabel = document.getElementById('statVolLabel');
  if (statVolLabel) statVolLabel.textContent = `24h Об'єм (${base})`;
  const obBase = document.getElementById('obBaseAsset');
  if (obBase) obBase.textContent = base;
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
  initPairSelector();
  loadPairsList();
  await updateTicker();
  await loadKlines(currentInterval);
  await updateOrderbook();
  await loadTerminalState();
  setInterval(loadPairsList, 10000);
  setInterval(updateTicker, 3000);
  setInterval(updateOrderbook, 3000);
  setInterval(() => loadKlines(currentInterval), 15000);
  setInterval(loadTerminalState, 5000);
});


async function updateAiPrediction() {
  try {
    const sym = window.currentSymbol || 'BTCUSDT';
    const interval = currentInterval || '15';
    const res = await fetch(`/api/predict?symbol=${sym}&interval=${interval}`);
    const data = await res.json();
    if (!data || !data.ok) return;

    const ind = data.indicators || {};
    const ml = data.ml || {};

    const sigEl = document.getElementById('aiSignalVal');
    const modelBadge = document.getElementById('aiModelBadge');
    const upBar = document.getElementById('aiProbUpBar');
    const downBar = document.getElementById('aiProbDownBar');
    const upVal = document.getElementById('aiProbUpVal');
    const downVal = document.getElementById('aiProbDownVal');
    const trendEl = document.getElementById('aiTrendVal');
    const rsiEl = document.getElementById('aiRsiVal');
    const reasonEl = document.getElementById('aiReasonVal');

    if (sigEl) {
      sigEl.textContent = ml.signal;
      sigEl.style.color = ml.signalColor || 'var(--green)';
    }
    if (modelBadge) modelBadge.textContent = ml.model || 'RandomForest';
    if (upBar) upBar.style.width = (ml.probUp || 50) + '%';
    if (downBar) downBar.style.width = (ml.probDown || 50) + '%';
    if (upVal) upVal.textContent = (ml.probUp || 50) + '%';
    if (downVal) downVal.textContent = (ml.probDown || 50) + '%';

    if (trendEl) {
      trendEl.textContent = ind.trend ? ind.trend.split(' ')[0] : 'NEUTRAL';
      trendEl.style.color = ind.trendColor || '#fff';
    }
    if (rsiEl) {
      rsiEl.textContent = ind.rsi !== undefined ? ind.rsi : '--.-';
      if (ind.rsi > 70) rsiEl.style.color = 'var(--red)';
      else if (ind.rsi < 30) rsiEl.style.color = 'var(--green)';
      else rsiEl.style.color = 'var(--cyan)';
    }
    if (reasonEl) {
      reasonEl.textContent = data.reason || 'Аналіз завершено';
    }
  } catch (err) {
    console.warn('AI update error:', err);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  updateAiPrediction();
  setInterval(updateAiPrediction, 10000);
});
