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
  const scen = sessionHistory[currentIndex];
  if (!scen) return;

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
  document.getElementById('scenarioDiffTag').textContent = scen.difficulty;
  document.getElementById('scenarioCategoryTag').textContent = scen.category;
  document.getElementById('scenarioContextText').textContent = scen.context;
  document.getElementById('scenarioQuestionText').textContent = scen.question || 'Оцініть графік та виберіть дію:';

  // Індикатори
  const ind = scen.indicators || {};
  document.getElementById('scenRsiVal').textContent = ind.rsi !== undefined ? ind.rsi : '--.-';
  document.getElementById('scenRsiDesc').textContent = ind.rsiStatus || 'Аналіз RSI';
  document.getElementById('scenSmaDesc').textContent = ind.smaStatus || 'Стан SMA';
  document.getElementById('scenVolDesc').textContent = ind.volumeStatus || 'Динаміка об\'єму';

  // Якщо сценарій уже розв\'язаний раніше в цій сесії
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
    document.getElementById('scenarioPhaseBadge').textContent = 'ЕТАП 1: АНАЛІЗ (25 СВІЧОК)';
    document.getElementById('chartWatermark').textContent = 'ВІДРІЗОК: 25 СВІЧОК';
  }

  updateScoreBoard();
}

// Відображення початкових 25 свічок
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

// Відображення повного графіка (35 свічок)
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
  document.getElementById('chartWatermark').textContent = 'ПОВНИЙ РИНОК: 35 СВІЧОК';
  chart.timeScale().fitContent();
}

// Прийняття рішення (Long або Short)
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

    scen.result = data;

    // Плавна анімація домальовування наступних 10 свічок
    await animateFutureCandles(data.resolution.futureCandles || []);

    const statusBadge = document.getElementById('stepStatusBadge');
    if (statusBadge) {
      statusBadge.textContent = data.isCorrect ? 'ПРАВИЛЬНО' : 'ПОМИЛКА';
      statusBadge.className = 'step-status-badge ' + (data.isCorrect ? 'correct' : 'wrong');
    }

    showOutcome(data, true);
    updateScoreBoard();
  } catch (err) {
    showToast('Помилка зв\'язку із сервером');
    btnLong.disabled = false;
    btnShort.disabled = false;
  }
}

// Анімація додавання свічок майбутнього по черзі
function animateFutureCandles(candles) {
  return new Promise((resolve) => {
    let i = 0;
    document.getElementById('chartWatermark').textContent = 'ДОБУДОВА РИНКУ...';

    const interval = setInterval(() => {
      if (i >= candles.length) {
        clearInterval(interval);
        document.getElementById('chartWatermark').textContent = 'ПОВНИЙ РИНОК: 35 СВІЧОК';
        document.getElementById('scenarioPhaseBadge').textContent = 'ЕТАП 2: РОЗВ\'ЯЗКА';
        resolve();
        return;
      }

      const c = candles[i];
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

      i++;
    }, 110);
  });
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
  verdictTitle.textContent = isCorrect ? 'ВЕРДИКТ: ПРАВИЛЬНЕ РІШЕННЯ' : 'ВЕРДИКТ: ПОМИЛКОВЕ РІШЕННЯ';

  const roi = data.userRoi || 0;
  const sign = roi >= 0 ? '+' : '';
  roiBadge.textContent = `${sign}${roi.toFixed(1)}% ROI`;

  titleText.textContent = data.resolution.outcomeTitle || '';
  expText.textContent = data.resolution.analysisExplanation || '';
  takeawayText.textContent = data.resolution.keyTakeaway || '';

  if (isNew) {
    showToast(isCorrect ? 'Вірно! Відмінний аналіз ринку.' : 'Помилка. Ознайомтеся з аналізом нижче.');
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
