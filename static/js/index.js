async function updateMarketPrices() {
  try {
    const res = await fetch('/api/tickers');
    const data = await res.json();
    if (data && data.ok && Array.isArray(data.tickers)) {
      data.tickers.forEach(t => {
        const sym = t.symbol.toUpperCase();
        const priceFmt = Number(t.price).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
        const changeVal = t.change24h;
        const sign = changeVal >= 0 ? '+' : '';
        if (sym === 'BTCUSDT') {
          const heroP = document.getElementById('heroBtcPrice');
          const heroC = document.getElementById('heroBtcChange');
          const featP = document.getElementById('featuredPriceDisplay');
          const btcP = document.getElementById('btcPriceVal');
          if (heroP) heroP.textContent = '$' + priceFmt;
          if (heroC) {
            heroC.textContent = `${sign}${changeVal}% (24H SPOT VOLATILITY)`;
            heroC.style.color = changeVal >= 0 ? 'var(--green)' : 'var(--red)';
          }
          if (featP) featP.textContent = `${priceFmt} USDT`;
          if (btcP) btcP.textContent = priceFmt;
        } else if (sym === 'ETHUSDT') {
          const ethP = document.getElementById('ethPriceVal');
          if (ethP) ethP.textContent = priceFmt;
        } else if (sym === 'SOLUSDT') {
          const solP = document.getElementById('solPriceVal');
          if (solP) solP.textContent = priceFmt;
        }
      });
    }
  } catch (err) {
    console.error('Ticker update error:', err);
  }
}
document.addEventListener('DOMContentLoaded', () => {
  updateMarketPrices();
  setInterval(updateMarketPrices, 5000);
});
