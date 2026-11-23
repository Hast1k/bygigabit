// ========================================================
// BYGIGABIT TRADING LAB — СЦЕНАРНИЙ ТРЕНАЖЕР СВІЧОК
// РЕАЛЬНІ ДАНІ BYBIT + ЛІНІЙНА НАВІГАЦІЯ (ПОПЕРЕДНІЙ / НАСТУПНИЙ)
// ========================================================

let sessionHistory = [];
let currentIndex = 0;
let chart = null;
let candleSeries = null;
let volumeSeries = null;
let isFetching = false;

// Стан інтерактивного Replay-режиму
let replayTimer = null;
let replaySpeed = 1200; // 1x = 1200ms, 2x = 600ms, 3x = 300ms
let isReplayPaused = false;
let replayFutureCandles = [];
let replayCurrentStep = 0;
let replayAction = 'long';
let replayEntryPrice = 0;
let currentScenarioResult = null;
let currentLiveRoi = 0;
let replayClosedEarly = false;

// Ініціалізація графіка TradingView Lightweight Charts
function initTrainerChart() {
  const container = document.getElementById('trainerChartContainer');
  if (!container) return;

  if (typeof LightweightCharts === 'undefined') {
    setTimeout(initTrainerChart, 200);
    return;
  }

  container.innerHTML = '';
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const bgColor = isLight ? '#ffffff' : '#0d0d10';
  const textColor = isLight ? '#475569' : '#94a3b8';
  const gridColor = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.04)';

  try {
    chart = LightweightCharts.createChart(container, {
      width: container.clientWidth || 800,
      height: 420,
      layout: {
        background: { color: bgColor },
        textColor: textColor,
        fontFamily: "'Space Mono', 'JetBrains Mono', monospace",
        fontSize: 11
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor }
      },
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
      rightPriceScale: { borderColor: isLight ? '#e2e8f0' : '#26262e' },
      timeScale: {
        borderColor: isLight ? '#e2e8f0' : '#26262e',
        timeVisible: true,
        secondsVisible: false
      }
    });

    candleSeries = chart.addCandlestickSeries({
      upColor: '#00FF00',
      downColor: '#ff2a55',
      borderVisible: false,
      wickUpColor: '#00FF00',
      wickDownColor: '#ff2a55'
    });

    volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      scaleMargins: { top: 0.82, bottom: 0 }
    });

    if (sessionHistory.length > 0) {
      renderCurrentScenario();
    }
  } catch (err) {
    console.error('Помилка ініціалізації графіка:', err);
  }

  window.addEventListener('resize', () => {
    if (chart && container) chart.applyOptions({ width: container.clientWidth });
  });

  window.addEventListener('themechange', (e) => {
    const light = e.detail && e.detail.theme === 'light';
    if (chart) {
      chart.applyOptions({
        layout: {
          background: { color: light ? '#ffffff' : '#0d0d10' },
          textColor: light ? '#475569' : '#94a3b8'
        },
        grid: {
          vertLines: { color: light ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)' },
          horzLines: { color: light ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)' }
        }
      });
    }
  });
}

// Завантаження початкового або нового сценарію Bybit
async function fetchNextScenario() {
  const res = await fetch('/api/scenarios/next');
  const data = await res.json();
  if (data.ok && data.scenario) {
    return data.scenario;
  }
  throw new Error(data.error || 'Не вдалося завантажити сценарій Bybit');
}

// Початкове завантаження
async function loadInitialScenario() {
  try {
    const scen = await fetchNextScenario();
    sessionHistory.push(scen);
    currentIndex = 0;
    renderCurrentScenario();
  } catch (err) {
    showToast('Помилка завантаження даних Bybit');
  }
}

// Відображення поточного сценарію
function renderCurrentScenario() {
  if (replayTimer) {
    clearTimeout(replayTimer);
    replayTimer = null;
  }

  const scen = sessionHistory[currentIndex];
  if (!scen) return;

  // Приховуємо панель відтворення під час переходів
  const replayPanel = document.getElementById('replayPanel');
  if (replayPanel) replayPanel.style.display = 'none';

  // Оновлення кнопок та індикаторів степпера
  const btnPrev = document.getElementById('btnPrevScenario');
  if (btnPrev) btnPrev.disabled = (currentIndex === 0);

  const numEl = document.getElementById('currentScenarioNum');
  if (numEl) numEl.textContent = `#${currentIndex + 1}`;

  const statusBadge = document.getElementById('stepStatusBadge');

  // Метадані сценарію
  document.getElementById('scenarioTitle').textContent = scen.title;
  document.getElementById('scenarioSymbolTag').textContent = scen.symbolLabel || scen.symbol;
  document.getElementById('scenarioTfTag').textContent = scen.timeframe;
  const diffTag = document.getElementById('scenarioDiffTag');
  if (diffTag) diffTag.textContent = scen.difficulty;
  const catTag = document.getElementById('scenarioCategoryTag');
  if (catTag) catTag.textContent = scen.category;
  document.getElementById('scenarioContextText').textContent = scen.context;
  document.getElementById('scenarioQuestionText').textContent = scen.question || 'Оцініть графік та виберіть дію:';

  // Індикатори
  const ind = scen.indicators || {};
  document.getElementById('scenRsiVal').textContent = ind.rsi !== undefined ? ind.rsi : '--.-';
  document.getElementById('scenRsiDesc').textContent = ind.rsiStatus || 'Аналіз RSI';
  document.getElementById('scenSmaDesc').textContent = ind.smaStatus || 'Стан SMA';
  document.getElementById('scenVolDesc').textContent = ind.volumeStatus || 'Динаміка об\'єму';

  // Якщо сценарій уже розв'язаний раніше в цій сесії
  if (scen.result) {
    if (statusBadge) {
      statusBadge.textContent = scen.result.isCorrect ? 'ПРАВИЛЬНО' : 'ПОМИЛКА';
      statusBadge.className = 'step-status-badge ' + (scen.result.isCorrect ? 'correct' : 'wrong');
    }
    renderResolvedChart(scen);
    showOutcome(scen.result, false);
  } else {
    if (statusBadge) {
      statusBadge.textContent = 'ОЧІКУЄ РІШЕННЯ';
      statusBadge.className = 'step-status-badge waiting';
    }
    renderInitialChart(scen);
    document.getElementById('decisionPanel').style.display = 'block';
    document.getElementById('outcomePanel').style.display = 'none';
    document.getElementById('btnActionLong').disabled = false;
    document.getElementById('btnActionShort').disabled = false;
    document.getElementById('scenarioPhaseBadge').textContent = 'ЕТАП 1: АНАЛІЗ (30 СВІЧОК)';
    document.getElementById('chartWatermark').textContent = 'ВІДРІЗОК: 30 СВІЧОК';
  }

  updateScoreBoard();
}

// Відображення початкових 30 свічок
function renderInitialChart(scen) {
  if (!candleSeries || !chart) return;
  const candles = scen.initialCandles || [];
  candleSeries.setData(candles.map(c => ({
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close
  })));

  volumeSeries.setData(candles.map(c => ({
    time: c.time,
    value: c.volume,
    color: c.close >= c.open ? 'rgba(0, 255, 0, 0.45)' : 'rgba(255, 42, 85, 0.45)'
  })));

  chart.timeScale().fitContent();
}

// Відображення повного графіка (40 свічок)
function renderResolvedChart(scen) {
  if (!candleSeries || !chart) return;
  const init = scen.initialCandles || [];
  const future = (scen.result && scen.result.resolution && scen.result.resolution.futureCandles) || [];
  const full = init.concat(future);

  candleSeries.setData(full.map(c => ({
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close
  })));

  volumeSeries.setData(full.map(c => ({
    time: c.time,
    value: c.volume,
    color: c.close >= c.open ? 'rgba(0, 255, 0, 0.45)' : 'rgba(255, 42, 85, 0.45)'
  })));

  document.getElementById('scenarioPhaseBadge').textContent = 'ЕТАП 2: РОЗВ\'ЯЗКА';
  document.getElementById('chartWatermark').textContent = 'ПОВНИЙ РИНОК: 40 СВІЧОК';
  chart.timeScale().fitContent();
}

// Прийняття рішення (Long або Short) та перехід у режим покрокового Replay
async function chooseAction(action) {
  const scen = sessionHistory[currentIndex];
  if (!scen || scen.result) return;

  const btnLong = document.getElementById('btnActionLong');
  const btnShort = document.getElementById('btnActionShort');
  btnLong.disabled = true;
  btnShort.disabled = true;

  try {
    const res = await fetch('/api/scenarios/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId: scen.id, action: action })
    });
    const data = await res.json();
    if (!data.ok) {
      showToast(data.error || 'Помилка перевірки сценарію');
      btnLong.disabled = false;
      btnShort.disabled = false;
      return;
    }

    currentScenarioResult = data;
    replayAction = action;
    replayFutureCandles = (data.resolution && data.resolution.futureCandles) || [];
    replayCurrentStep = 0;
    replayClosedEarly = false;
    isReplayPaused = false;

    // Ціна входу = закриття останньої початкової свічки (30-ї)
    const initCandles = scen.initialCandles || [];
    replayEntryPrice = (initCandles.length > 0)
      ? initCandles[initCandles.length - 1].close
      : (replayFutureCandles[0] ? replayFutureCandles[0].open : 1);
    currentLiveRoi = 0;

    // Перемикання інтерфейсу на інтерактивне відтворення
    document.getElementById('decisionPanel').style.display = 'none';
    const replayPanel = document.getElementById('replayPanel');
    if (replayPanel) replayPanel.style.display = 'block';

    const sideBadge = document.getElementById('replaySideBadge');
    if (sideBadge) {
      sideBadge.textContent = action === 'long' ? 'ВІДКРИТО LONG 10x' : 'ВІДКРИТО SHORT 10x';
      sideBadge.className = 'badge ' + (action === 'long' ? 'badge-green' : 'badge-red');
    }

    const fmtPrice = (p) => Number(p).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    document.getElementById('replayEntryPrice').textContent = '$' + fmtPrice(replayEntryPrice);
    document.getElementById('replayCurrentPrice').textContent = '$' + fmtPrice(replayEntryPrice);
    document.getElementById('replayStepCounter').textContent = `СВІЧКА 0 / ${replayFutureCandles.length}`;

    const pnlVal = document.getElementById('replayPnlVal');
    pnlVal.textContent = '+0.00% ROI';
    pnlVal.className = 'replay-pnl-val mono pos';

    const btnClose = document.getElementById('btnCloseReplayEarly');
    if (btnClose) btnClose.disabled = false;

    const btnPause = document.getElementById('btnReplayPause');
    if (btnPause) btnPause.textContent = 'Пауза';

    document.getElementById('scenarioPhaseBadge').textContent = 'ЕТАП 2: СИМУЛЯЦІЯ УГОДИ';
    document.getElementById('chartWatermark').textContent = `СИМУЛЯЦІЯ: 0 / ${replayFutureCandles.length} СВІЧОК`;

    // Запуск кроків відтворення
    if (replayTimer) clearTimeout(replayTimer);
    replayTimer = setTimeout(tickReplay, replaySpeed);

  } catch (err) {
    showToast('Помилка зв\'язку із сервером');
    btnLong.disabled = false;
    btnShort.disabled = false;
  }
}

// Крок відтворення наступної свічки
function tickReplay() {
  if (replayClosedEarly || !currentScenarioResult) return;

  if (replayCurrentStep >= replayFutureCandles.length) {
    // Всі свічки завершено за планом
    finishReplay(false);
    return;
  }

  const c = replayFutureCandles[replayCurrentStep];
  candleSeries.update({
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close
  });

  volumeSeries.update({
    time: c.time,
    value: c.volume,
    color: c.close >= c.open ? 'rgba(0, 255, 0, 0.45)' : 'rgba(255, 42, 85, 0.45)'
  });

  replayCurrentStep++;

  // Розрахунок поточного live ROI з плечем 10x
  const rawPct = (replayAction === 'long')
    ? ((c.close - replayEntryPrice) / replayEntryPrice)
    : ((replayEntryPrice - c.close) / replayEntryPrice);
  currentLiveRoi = rawPct * 100 * 10;

  // Оновлення блоків метрик
  const fmtPrice = (p) => Number(p).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  document.getElementById('replayCurrentPrice').textContent = '$' + fmtPrice(c.close);
  document.getElementById('replayStepCounter').textContent = `СВІЧКА ${replayCurrentStep} / ${replayFutureCandles.length}`;

  const pnlVal = document.getElementById('replayPnlVal');
  const sign = currentLiveRoi >= 0 ? '+' : '';
  pnlVal.textContent = `${sign}${currentLiveRoi.toFixed(2)}% ROI`;
  pnlVal.className = 'replay-pnl-val mono ' + (currentLiveRoi >= 0 ? 'pos' : 'neg');

  document.getElementById('chartWatermark').textContent = `СИМУЛЯЦІЯ: ${replayCurrentStep} / ${replayFutureCandles.length} СВІЧОК`;

  if (replayCurrentStep < replayFutureCandles.length) {
    if (!isReplayPaused) {
      replayTimer = setTimeout(tickReplay, replaySpeed);
    }
  } else {
    // Остання свічка
    finishReplay(false);
  }
}

// Дострокове закриття угоди користувачем
function closeReplayPositionEarly() {
  if (replayClosedEarly || !currentScenarioResult) return;
  if (replayTimer) clearTimeout(replayTimer);
  replayClosedEarly = true;

  const btnClose = document.getElementById('btnCloseReplayEarly');
  if (btnClose) btnClose.disabled = true;

  // Домальовуємо всі залишкові свічки, щоб користувач бачив майбутній рух ринку
  for (let i = replayCurrentStep; i < replayFutureCandles.length; i++) {
    const rc = replayFutureCandles[i];
    candleSeries.update({
      time: rc.time,
      open: rc.open,
      high: rc.high,
      low: rc.low,
      close: rc.close
    });
    volumeSeries.update({
      time: rc.time,
      value: rc.volume,
      color: rc.close >= rc.open ? 'rgba(0, 255, 0, 0.45)' : 'rgba(255, 42, 85, 0.45)'
    });
  }

  finishReplay(true);
}

// Пауза / продовження
function toggleReplayPause() {
  if (replayClosedEarly) return;
  isReplayPaused = !isReplayPaused;
  const btn = document.getElementById('btnReplayPause');

  if (isReplayPaused) {
    if (replayTimer) clearTimeout(replayTimer);
    if (btn) btn.textContent = 'Продовжити';
  } else {
    if (btn) btn.textContent = 'Пауза';
    tickReplay();
  }
}

// Зміна швидкості відтворення (1x / 2x / 3x)
function cycleReplaySpeed() {
  const btn = document.getElementById('btnReplaySpeed');
  if (replaySpeed === 1200) {
    replaySpeed = 600;
    if (btn) btn.textContent = '2x (0.6с)';
  } else if (replaySpeed === 600) {
    replaySpeed = 300;
    if (btn) btn.textContent = '3x (0.3с)';
  } else {
    replaySpeed = 1200;
    if (btn) btn.textContent = '1x (1.2с)';
  }
}

// Ручний одиничний крок (свічка вперед)
function stepReplayOnce() {
  if (replayClosedEarly) return;
  if (!isReplayPaused) {
    isReplayPaused = true;
    if (replayTimer) clearTimeout(replayTimer);
    const btn = document.getElementById('btnReplayPause');
    if (btn) btn.textContent = 'Продовжити';
  }
  tickReplay();
}

// Завершення відтворення та фіксація результату
function finishReplay(closedEarly) {
  if (replayTimer) clearTimeout(replayTimer);
  const scen = sessionHistory[currentIndex];
  if (!scen) return;

  const replayPanel = document.getElementById('replayPanel');
  if (replayPanel) replayPanel.style.display = 'none';

  if (closedEarly) {
    const earlyResult = JSON.parse(JSON.stringify(currentScenarioResult));
    earlyResult.closedEarly = true;
    earlyResult.exitCandleIndex = Math.max(1, replayCurrentStep);
    earlyResult.userRoi = currentLiveRoi;
    // Дострокове закриття в плюс вважається успішною дією трейдера
    earlyResult.isCorrect = (currentLiveRoi > 0);
    scen.result = earlyResult;
  } else {
    scen.result = currentScenarioResult;
  }

  const statusBadge = document.getElementById('stepStatusBadge');
  if (statusBadge) {
    statusBadge.textContent = scen.result.isCorrect ? 'ПРАВИЛЬНО' : 'ПОМИЛКА';
    statusBadge.className = 'step-status-badge ' + (scen.result.isCorrect ? 'correct' : 'wrong');
  }

  document.getElementById('scenarioPhaseBadge').textContent = 'ЕТАП 2: РОЗВ\'ЯЗКА';
  document.getElementById('chartWatermark').textContent = 'ПОВНИЙ РИНОК: 40 СВІЧОК';

  showOutcome(scen.result, true);
  updateScoreBoard();
}

// Показ розв'язки
function showOutcome(data, isNew) {
  const isCorrect = data.isCorrect;
  const outcomeCard = document.getElementById('outcomePanel');
  const headerBox = document.getElementById('outcomeHeaderBox');
  const verdictTitle = document.getElementById('outcomeVerdictTitle');
  const roiBadge = document.getElementById('outcomeRoiBadge');
  const titleText = document.getElementById('outcomeTitleText');
  const expText = document.getElementById('outcomeExplanationText');
  const takeawayText = document.getElementById('outcomeTakeawayText');

  outcomeCard.style.display = 'block';
  headerBox.className = 'outcome-header ' + (isCorrect ? 'win' : 'loss');

  const roi = data.userRoi || 0;
  const sign = roi >= 0 ? '+' : '';
  roiBadge.textContent = `${sign}${roi.toFixed(1)}% ROI`;

  if (data.closedEarly) {
    verdictTitle.textContent = isCorrect
      ? `ДОСТРОКОВО ЗАКРИТО (СВІЧКА #${data.exitCandleIndex}): ПРИБУТОК`
      : `ДОСТРОКОВО ЗАКРИТО (СВІЧКА #${data.exitCandleIndex}): ЗБИТОК`;
    titleText.textContent = isCorrect
      ? `Позицію зафіксовано на свічці #${data.exitCandleIndex}`
      : `Достроковий вихід на свічці #${data.exitCandleIndex}`;
    expText.textContent = (isCorrect
      ? `Ви вчасно зрізали ризик та зафіксували прибуток на ${data.exitCandleIndex}-й свічці до повного відпрацювання сценарію! `
      : `Позицію закрито з мінусом на ${data.exitCandleIndex}-й свічці. `) + (data.resolution.analysisExplanation || '');
  } else {
    verdictTitle.textContent = isCorrect ? 'ВЕРДИКТ: ПРАВИЛЬНЕ РІШЕННЯ' : 'ВЕРДИКТ: ПОМИЛКОВЕ РІШЕННЯ';
    titleText.textContent = data.resolution.outcomeTitle || '';
    expText.textContent = data.resolution.analysisExplanation || '';
  }

  takeawayText.textContent = data.resolution.keyTakeaway || '';

  if (isNew) {
    if (data.closedEarly) {
      showToast(isCorrect ? 'Угоду закрито з прибутком!' : 'Угоду закрито зі збитком.');
    } else {
      showToast(isCorrect ? 'Вірно! Відмінний аналіз ринку.' : 'Помилка. Ознайомтеся з аналізом нижче.');
    }
  }
}

// Навігація назад до попереднього сценарію
function goToPrevScenario() {
  if (currentIndex > 0) {
    currentIndex--;
    renderCurrentScenario();
  }
}

// Навігація вперед до наступного сценарію
async function goToNextScenario() {
  if (isFetching) return;

  if (currentIndex < sessionHistory.length - 1) {
    currentIndex++;
    renderCurrentScenario();
    return;
  }

  isFetching = true;
  const nextBtn = document.getElementById('btnNextScenario');
  const outcomeNextBtn = document.getElementById('btnOutcomeNext');
  if (nextBtn) nextBtn.disabled = true;
  if (outcomeNextBtn) outcomeNextBtn.disabled = true;

  try {
    const scen = await fetchNextScenario();
    sessionHistory.push(scen);
    currentIndex = sessionHistory.length - 1;
    renderCurrentScenario();
  } catch (err) {
    showToast('Не вдалося отримати наступний сценарій Bybit');
  } finally {
    isFetching = false;
    if (nextBtn) nextBtn.disabled = false;
    if (outcomeNextBtn) outcomeNextBtn.disabled = false;
  }
}

// Спробувати сценарій заново
function retryScenario() {
  const scen = sessionHistory[currentIndex];
  if (!scen) return;
  delete scen.result;
  renderCurrentScenario();
}

// Оновлення загального лічильника результатів
function updateScoreBoard() {
  let answered = 0;
  let correct = 0;

  sessionHistory.forEach(s => {
    if (s.result) {
      answered++;
      if (s.result.isCorrect) correct++;
    }
  });

  const correctEl = document.getElementById('scoreCorrect');
  const totalEl = document.getElementById('scoreTotal');
  if (correctEl) correctEl.textContent = correct;
  if (totalEl) totalEl.textContent = answered;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 4000);
}

// Ініціалізація сторінки
window.addEventListener('DOMContentLoaded', () => {
  initTrainerChart();
  loadInitialScenario();
});
