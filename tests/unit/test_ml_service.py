"""
Модульні тести модуля штучного інтелекту та аналітики ml_service.py.
Перевірка індикаторів, граничних умов кількості свічок та роботи моделі RandomForest.
"""

import pytest
import pandas as pd
import numpy as np

import ml_service


def generate_synthetic_candles(count: int, trend: str = "up") -> list[dict]:
    """Генерація синтетичного масиву свічок для тестування ML-моделі."""
    candles = []
    base_price = 80000.0
    base_time = 1700000000

    for i in range(count):
        # Реалістичні коливання зі змішаними бичачими та ведмежими свічками
        noise = float(np.sin(i / 2.5) * 20.0)
        bias = 5.0 if trend == "up" else (-5.0 if trend == "down" else 0.0)
        step = noise + bias

        o = base_price + (i * 10.0)
        c = o + step
        h = max(o, c) + abs(noise * 0.5) + 5.0
        l = min(o, c) - abs(noise * 0.5) - 5.0
        v = 100.0 + (i * 1.5)

        candles.append({
            "time": base_time + (i * 900),
            "open": round(o, 2),
            "high": round(h, 2),
            "low": round(l, 2),
            "close": round(c, 2),
            "volume": round(v, 2)
        })

    return candles


class TestMLService:
    """Тести для compute_indicators та analyze_and_predict."""

    def test_insufficient_candles_returns_error(self):
        """analyze_and_predict() на < 60 свічках повертає ok: false."""
        # Тест на 20 свічках
        short_candles = generate_synthetic_candles(20)
        res = ml_service.analyze_and_predict(short_candles)

        assert res["ok"] is False
        assert "мінімум 60" in res["error"]

        # Тест на порожньому списку свічок
        empty_res = ml_service.analyze_and_predict([])
        assert empty_res["ok"] is False
        assert "мінімум 60" in empty_res["error"]

        # Тест на 59 свічках (граничне значення)
        border_res = ml_service.analyze_and_predict(generate_synthetic_candles(59))
        assert border_res["ok"] is False

    def test_compute_indicators_columns_presence(self):
        """compute_indicators() коректно розраховує та додає всі необхідні фічі."""
        raw_candles = generate_synthetic_candles(70)
        df = pd.DataFrame(raw_candles)

        result_df = ml_service.compute_indicators(df)

        expected_features = [
            "sma14", "sma50", "sma14_dist", "sma50_dist",
            "rsi14", "vol_change", "ret1", "ret3", "target"
        ]

        for col in expected_features:
            assert col in result_df.columns, f"Ознака {col} відсутня у датафреймі"

        # Перевірка коректності діапазону RSI (0 .. 100)
        valid_rsi = result_df["rsi14"].dropna()
        assert (valid_rsi >= 0.0).all()
        assert (valid_rsi <= 100.0).all()

        # Перевірка бінарного таргету (0 або 1)
        valid_target = result_df["target"].iloc[:-1]  # Останній рядок має target на shift(-1)
        assert set(valid_target.unique()).issubset({0, 1})

    def test_analyze_and_predict_valid_signal(self):
        """analyze_and_predict() на >= 60 свічках повертає ok: true та валідний сигнал."""
        candles = generate_synthetic_candles(80, trend="up")
        res = ml_service.analyze_and_predict(candles)

        assert res["ok"] is True
        assert "indicators" in res
        assert "ml" in res
        assert "reason" in res

        # Перевірка індикаторів
        ind = res["indicators"]
        assert isinstance(ind["rsi"], float)
        assert isinstance(ind["sma14"], float)
        assert isinstance(ind["sma50"], float)
        assert ind["trend"] in ["BULLISH (UPTREND)", "BEARISH (DOWNTREND)", "CONSOLIDATION / NEUTRAL"]

        # Перевірка ML прогнозу
        ml = res["ml"]
        valid_signals = ["BUY / LONG", "SELL / SHORT", "NEUTRAL / WAIT", "HOLD"]
        assert ml["signal"] in valid_signals
        assert 0.0 <= ml["confidence"] <= 100.0
        assert 0.0 <= ml["probUp"] <= 100.0
        assert 0.0 <= ml["probDown"] <= 100.0
        assert "RandomForest" in ml["model"] or "Heuristic" in ml["model"]
