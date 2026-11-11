// ========================================================
// BYGIGABIT TRADING LAB — СЦЕНАРНИЙ ТРЕНАЖЕР СВІЧОК
// ========================================================

let scenariosList = [];
let currentScenarioId = 1;
let userResults = {}; // { 1: { isCorrect, userAction, roi }, ... }

let chart = null;
let candleSeries = null;
let volumeSeries = null;

// Ініціалізація графіка TradingView Lightweight Charts
function initTrainerChart() {
  const container = document.getElementById('trainerChartContainer');
  if (!container) return;

  if (typeof LightweightCharts === 'undefined') {
    console.warn("LightweightCharts ще завантажується, повторна спроба через 250мс...");
    setTimeout(initTrainerChart, 250);
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
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal
      },
      rightPriceScale: {
        borderColor: isLight ? '#e2e8f0' : '#26262e'
      },
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

    // Якщо сценарії вже завантажені, відмальовуємо свічки
    if (scenariosList.length > 0) {
      renderCurrentScenario();
    }
  } catch (err) {
    console.error("Помилка створення графіка тренажера:", err);
  }

  window.addEventListener('resize', () => {
    if (chart && container) {
      chart.applyOptions({ width: container.clientWidth });
    }
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

// Завантаження переліку сценаріїв
async function loadScenarios() {
  try {
    const res = await fetch('/api/scenarios/list');
    const data = await res.json();
    if (data.ok && data.scenarios) {
      scenariosList = data.scenarios;
      renderCurrentScenario();
    }
  } catch (err) {
    showToast('Помилка завантаження навчальних сценаріїв');
  }
}

// Відображення поточного сценарію
function renderCurrentScenario() {
  const scen = scenariosList.find(s => s.id === currentScenarioId);
  if (!scen) return;

  // Оновлення заголовків та мета-інформації
  document.getElementById('scenarioTitle').textContent = scen.title;
  document.getElementById('scenarioSymbolTag').textContent = scen.symbolLabel || scen.symbol;
  document.getElementById('scenarioTfTag').textContent = scen.timeframe;
  document.getElementById('scenarioDiffTag').textContent = scen.difficulty;
  document.getElementById('scenarioCategoryTag').textContent = scen.category;
  document.getElementById('scenarioContextText').textContent = scen.context;
  document.getElementById('scenarioQuestionText').textContent = scen.question || 'Оцініть графік та виберіть напрямок:';

  // Оновлення індикаторів
  const ind = scen.indicators || {};
  document.getElementById('scenRsiVal').textContent = ind.rsi !== undefined ? ind.rsi : '--.-';
  document.getElementById('scenRsiDesc').textContent = ind.rsiStatus || 'Аналіз RSI';
  document.getElementById('scenSmaDesc').textContent = ind.smaStatus || 'Стан SMA';
  document.getElementById('scenVolDesc').textContent = ind.volumeStatus || 'Динаміка об\'єму';

  // Оновлення вкладок
  document.querySelectorAll('.scenario-tab-btn').forEach((btn, idx) => {
    btn.classList.toggle('active', (idx + 1) === currentScenarioId);
  });

  // Завантаження початкових 25 свічок на графік
  const initCandles = scen.initialCandles || [];
  if (candleSeries && chart) {
    candleSeries.setData(initCandles.map(c => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close
    })));

    volumeSeries.setData(initCandles.map(c => ({
      time: c.time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(0, 255, 0, 0.45)' : 'rgba(255, 42, 85, 0.45)'
    })));

    chart.timeScale().fitContent();
  }

  // Стан панелей: показуємо вибір, приховуємо розв'язку
  document.getElementById('decisionPanel').style.display = 'block';
  document.getElementById('outcomePanel').style.display = 'none';
  document.getElementById('scenarioPhaseBadge').textContent = 'ЕТАП 1: АНАЛІЗ (25 СВІЧОК)';
  document.getElementById('chartWatermark').textContent = 'ВІДРІЗОК: 25 СВІЧОК';

  // Розблокування кнопок вибору
  document.getElementById('btnActionLong').disabled = false;
  document.getElementById('btnActionShort').disabled = false;

  // Якщо цей сценарій уже розв'язувався раніше — відновлюємо результат
  if (userResults[currentScenarioId]) {
    showExistingResult(userResults[currentScenarioId]);
  }
}

// Вибір напрямку (Long або Short)
async function chooseAction(action) {
  const btnLong = document.getElementById('btnActionLong');
  const btnShort = document.getElementById('btnActionShort');
  btnLong.disabled = true;
  btnShort.disabled = true;

  try {
    const res = await fetch('/api/scenarios/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId: currentScenarioId, action: action })
    });
    const data = await res.json();
    if (!data.ok) {
      showToast(data.error || 'Помилка перевірки сценарію');
      btnLong.disabled = false;
      btnShort.disabled = false;
      return;
    }

    userResults[currentScenarioId] = data;

    // Плавна анімація домальовки наступних 10 свічок
    await animateFutureCandles(data.resolution.futureCandles || []);

    // Показ картки розв'язки
    showOutcome(data);

    // Оновлення лічильника успішності
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
    let index = 0;
    document.getElementById('chartWatermark').textContent = 'ДОБУДОВА РИНКУ...';

    const interval = setInterval(() => {
      if (index >= candles.length) {
        clearInterval(interval);
        document.getElementById('chartWatermark').textContent = 'ПОВНИЙ РИНОК: 35 СВІЧОК';
        document.getElementById('scenarioPhaseBadge').textContent = 'ЕТАП 2: РОЗВ\'ЯЗКА';
        resolve();
        return;
      }

      const c = candles[index];
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

      index++;
    }, 120);
  });
}

// Показ розв'язки та аналізу
function showOutcome(data) {
  const isCorrect = data.isCorrect;
  const outcomeCard = document.getElementById('outcomePanel');
  const decisionCard = document.getElementById('decisionPanel');
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

  // Оновлення статусу вкладки
  const dot = document.getElementById(`dotScenario${currentScenarioId}`);
  if (dot) {
    dot.className = 'tab-status-dot ' + (isCorrect ? 'solved-correct' : 'solved-wrong');
  }

  showToast(isCorrect ? 'Вірно! Відмінний аналіз ринку.' : 'Помилка. Ознайомтеся з поясненням нижче.');
}

// Показ результату для вже пройденого сценарію
function showExistingResult(data) {
  // Миттєво домальовуємо всі майбутні свічки
  const future = data.resolution.futureCandles || [];
  future.forEach(c => {
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
  });

  showOutcome(data);
}

// Оновлення лічильника очок
function updateScoreBoard() {
  let correctCount = 0;
  Object.values(userResults).forEach(res => {
    if (res && res.isCorrect) correctCount++;
  });
  document.getElementById('scoreCorrect').textContent = correctCount;
}

// Перехід між сценаріями
function switchScenario(id) {
  if (currentScenarioId === id) return;
  currentScenarioId = id;
  renderCurrentScenario();
}

// Перехід до наступного сценарію
function goToNextScenario() {
  const nextId = currentScenarioId < 4 ? currentScenarioId + 1 : 1;
  switchScenario(nextId);
}

// Спробувати сценарій заново
function retryScenario() {
  delete userResults[currentScenarioId];
  const dot = document.getElementById(`dotScenario${currentScenarioId}`);
  if (dot) dot.className = 'tab-status-dot';
  updateScoreBoard();
  renderCurrentScenario();
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
  loadScenarios();
});
