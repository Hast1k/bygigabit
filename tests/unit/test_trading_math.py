"""
Модульні тести фінансової та біржової математики ByGigaBit:
розрахунок розміру позиції, цін ліквідації, PnL, ROI та граничних умов.
"""

import pytest


def calculate_position_size(margin: float, leverage: int, price: float) -> float:
    """Формула обсягу позиції V / P."""
    if margin <= 0:
        raise ValueError("Маржа повинна бути більшою за нуль")
    if leverage <= 0:
        raise ValueError("Плече повинно бути більшим за нуль")
    if price <= 0:
        raise ValueError("Ціна повинна бути більшою за нуль")
    pos_value = margin * leverage
    return round(pos_value / price, 4)


def calculate_liquidation_price(entry_price: float, leverage: int, side: str) -> float:
    """Формула ціни ліквідації для Long та Short."""
    if leverage <= 0:
        raise ValueError("Плече повинно бути більшим за нуль")
    if entry_price <= 0:
        raise ValueError("Ціна входу повинна бути більшою за нуль")

    if side == "long":
        return round(entry_price * (1.0 - (0.95 / leverage)), 1)
    elif side == "short":
        return round(entry_price * (1.0 + (0.95 / leverage)), 1)
    else:
        raise ValueError(f"Невідомий напрямок позиції: {side}")


def calculate_trade_pnl(entry_price: float, exit_price: float, size: float, side: str, margin: float) -> tuple[float, float]:
    """Розрахунок PnL та ROI при закритті угоди."""
    if side == "long":
        pnl = (exit_price - entry_price) * size
    elif side == "short":
        pnl = (entry_price - exit_price) * size
    else:
        raise ValueError(f"Невідомий напрямок позиції: {side}")

    pnl = round(pnl, 2)
    roi = round((pnl / margin) * 100.0, 2) if margin > 0 else 0.0
    return pnl, roi


class TestTradingMath:
    """Тести математичних алгоритмів розрахунку деривативів."""

    def test_position_size_formula(self):
        """Перевірка коректності обчислення обсягу V / P."""
        # 1000 USDT з 10x при ціні BTC 80 000 = 10 000 / 80 000 = 0.125 BTC
        size = calculate_position_size(margin=1000.0, leverage=10, price=80000.0)
        assert size == 0.125

        # 500 USDT з 20x при ціні ETH 2 500 = 10 000 / 2 500 = 4.0 ETH
        size_eth = calculate_position_size(margin=500.0, leverage=20, price=2500.0)
        assert size_eth == 4.0

    def test_liquidation_price_long(self):
        """Ціна ліквідації для Long: P * (1 - 0.95 / L)."""
        entry_price = 80000.0
        # При 10x падіння на 9.5%: 80000 * (1 - 0.095) = 72400.0
        liq_10x = calculate_liquidation_price(entry_price, leverage=10, side="long")
        assert liq_10x == 72400.0

        # При 20x падіння на 4.75%: 80000 * (1 - 0.0475) = 76200.0
        liq_20x = calculate_liquidation_price(entry_price, leverage=20, side="long")
        assert liq_20x == 76200.0

    def test_liquidation_price_short(self):
        """Ціна ліквідації для Short: P * (1 + 0.95 / L)."""
        entry_price = 80000.0
        # При 10x зростання на 9.5%: 80000 * (1 + 0.095) = 87600.0
        liq_short_10x = calculate_liquidation_price(entry_price, leverage=10, side="short")
        assert liq_short_10x == 87600.0

        # При 5x зростання на 19%: 80000 * (1 + 0.19) = 95200.0
        liq_short_5x = calculate_liquidation_price(entry_price, leverage=5, side="short")
        assert liq_short_5x == 95200.0

    def test_pnl_and_roi_calculation(self):
        """Розрахунок PnL та відсоткового ROI для прибуткових та збиткових угод."""
        # Long: вхід 80 000, вихід 84 000 (+5%), розмір 0.1 BTC, маржа 800 USDT
        pnl, roi = calculate_trade_pnl(80000.0, 84000.0, size=0.1, side="long", margin=800.0)
        assert pnl == 400.0
        assert roi == 50.0  # 5% руху базового активу * 10x = +50% ROI

        # Short: вхід 80 000, вихід 82 000 (зростання проти шорта), маржа 800 USDT
        pnl_loss, roi_loss = calculate_trade_pnl(80000.0, 82000.0, size=0.1, side="short", margin=800.0)
        assert pnl_loss == -200.0
        assert roi_loss == -25.0

        # Беззбитковість (Breakeven)
        pnl_zero, roi_zero = calculate_trade_pnl(80000.0, 80000.0, size=0.1, side="long", margin=800.0)
        assert pnl_zero == 0.0
        assert roi_zero == 0.0

    def test_leverage_boundary_conditions(self):
        """Перевірка поведінки ліквідації при різних рівнях плеча (1x, 50x, 100x)."""
        entry = 80000.0

        # 1x плече для Long: ліквідація при падінні на 95% -> 80000 * 0.05 = 4000.0
        liq_1x = calculate_liquidation_price(entry, leverage=1, side="long")
        assert liq_1x == 4000.0
        assert liq_1x > 0

        # 50x плече: ліквідація дуже близько до входу (1.9%) -> 80000 * (1 - 0.019) = 78480.0
        liq_50x = calculate_liquidation_price(entry, leverage=50, side="long")
        assert liq_50x == 78480.0
        assert liq_50x > liq_1x

        # 100x плече: 80000 * (1 - 0.0095) = 79240.0
        liq_100x = calculate_liquidation_price(entry, leverage=100, side="long")
        assert liq_100x == 79240.0
        assert liq_100x > liq_50x

    def test_invalid_parameters_rejection(self):
        """Граничні випадки: маржа <= 0, нульове плече, нульова ціна."""
        with pytest.raises(ValueError):
            calculate_position_size(margin=0.0, leverage=10, price=80000.0)

        with pytest.raises(ValueError):
            calculate_position_size(margin=-100.0, leverage=10, price=80000.0)

        with pytest.raises(ValueError):
            calculate_position_size(margin=100.0, leverage=0, price=80000.0)

        with pytest.raises(ValueError):
            calculate_liquidation_price(entry_price=80000.0, leverage=0, side="long")

        with pytest.raises(ValueError):
            calculate_trade_pnl(80000.0, 82000.0, size=0.1, side="invalid_side", margin=100.0)
