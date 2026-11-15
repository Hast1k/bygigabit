"""
Наскрізні (E2E) тести біржового термінала, ринкових котирувань,
відкриття/закриття ордерів та кешування Bybit V5.
"""

import time
import pytest
import app


class TestTerminalAndMarket:
    """Тести взаємодії з біржовим терміналом та торговим API."""

    def test_open_market_orders_long_and_short(self, client, trader_auth):
        """Відкриття market-ордерів (long/short), перевірка size, liqPrice та списання доступної маржі."""
        headers = trader_auth["headers"]

        # 1. Відкриваємо LONG позицію на 500 USDT з 10x при ціні 80 000
        long_payload = {
            "symbol": "BTCUSDT",
            "side": "long",
            "orderType": "market",
            "margin": 500.0,
            "leverage": 10,
            "currentPrice": 80000.0
        }
        res_long = client.post("/api/terminal/order", json=long_payload, headers=headers)
        assert res_long.status_code == 200
        data_long = res_long.json()

        assert data_long["ok"] is True
        pos_long = data_long["position"]
        # size = 500 * 10 / 80 000 = 0.0625 BTC
        assert pos_long["size"] == 0.0625
        # liqPrice = 80000 * (1 - 0.095) = 72400.0
        assert pos_long["liqPrice"] == 72400.0
        assert pos_long["side"] == "long"

        # 2. Перевіряємо списання маржі у /api/wallet
        wallet_after_long = client.get("/api/wallet", headers=headers).json()
        assert wallet_after_long["usedMargin"] == 500.0
        assert wallet_after_long["availableMargin"] == 9500.0

        # 3. Відкриваємо SHORT позицію на 300 USDT з 20x
        short_payload = {
            "symbol": "BTCUSDT",
            "side": "short",
            "orderType": "market",
            "margin": 300.0,
            "leverage": 20,
            "currentPrice": 80000.0
        }
        res_short = client.post("/api/terminal/order", json=short_payload, headers=headers)
        assert res_short.status_code == 200
        data_short = res_short.json()

        assert data_short["ok"] is True
        pos_short = data_short["position"]
        # liqPrice = 80000 * (1 + 0.95 / 20) = 83800.0
        assert pos_short["liqPrice"] == 83800.0

        # 4. Перевіряємо загальний usedMargin = 500 + 300 = 800 USDT
        wallet_after_both = client.get("/api/wallet", headers=headers).json()
        assert wallet_after_both["usedMargin"] == 800.0
        assert wallet_after_both["availableMargin"] == 9200.0

    def test_reject_order_with_invalid_margin_or_insufficient_balance(self, client, trader_auth):
        """Відхилення ордера при маржі <= 0 або при сумі, що перевищує баланс."""
        headers = trader_auth["headers"]

        # Нульова маржа
        zero_res = client.post("/api/terminal/order", json={
            "symbol": "BTCUSDT", "side": "long", "orderType": "market", "margin": 0
        }, headers=headers)
        assert zero_res.status_code == 200
        assert zero_res.json()["ok"] is False
        assert "більшою за 0" in zero_res.json()["error"]

        # Від'ємна маржа
        neg_res = client.post("/api/terminal/order", json={
            "symbol": "BTCUSDT", "side": "long", "orderType": "market", "margin": -50
        }, headers=headers)
        assert neg_res.status_code == 200
        assert neg_res.json()["ok"] is False

        # Недостатній баланс (спроба відкрити на 15 000 USDT при балансі 10 000)
        huge_res = client.post("/api/terminal/order", json={
            "symbol": "BTCUSDT", "side": "long", "orderType": "market", "margin": 15000.0
        }, headers=headers)
        assert huge_res.status_code == 200
        assert huge_res.json()["ok"] is False
        assert "Недостатньо" in huge_res.json()["error"]

    def test_limit_order_initial_price_and_cancel_refund(self, client, trader_auth):
        """Створення limit-ордера з фіксацією initialPrice та його скасування з поверненням маржі."""
        headers = trader_auth["headers"]

        # 1. Розміщуємо лімітний ордер нижче ринку
        limit_payload = {
            "symbol": "BTCUSDT",
            "side": "long",
            "orderType": "limit",
            "limitPrice": 78000.0,
            "margin": 400.0,
            "leverage": 10
        }
        res_limit = client.post("/api/terminal/order", json=limit_payload, headers=headers)
        assert res_limit.status_code == 200
        limit_data = res_limit.json()

        assert limit_data["ok"] is True
        order_obj = limit_data["order"]
        order_id = order_obj["id"]
        # Перевірка фіксації актуальної ринкової ціни на момент виставлення
        assert order_obj["initialPrice"] == 80000.0
        assert order_obj["orderPrice"] == 78000.0

        # Маржа зарезервована під лімітний ордер
        wallet_reserved = client.get("/api/wallet", headers=headers).json()
        assert wallet_reserved["usedMargin"] == 400.0
        assert wallet_reserved["availableMargin"] == 9600.0

        # 2. Скасовуємо лімітний ордер
        cancel_res = client.post("/api/terminal/cancel-order", json={"id": order_id}, headers=headers)
        assert cancel_res.status_code == 200
        assert cancel_res.json()["ok"] is True

        # 3. Перевіряємо, що маржа повернулася у доступний залишок
        wallet_freed = client.get("/api/wallet", headers=headers).json()
        assert wallet_freed["usedMargin"] == 0.0
        assert wallet_freed["availableMargin"] == 10000.0

    def test_close_active_position_updates_balance(self, client, trader_auth):
        """Закриття відкритої позиції з прибутком та оновлення балансу трейдера."""
        headers = trader_auth["headers"]

        # 1. Відкриваємо позицію Long на 1000 USDT при 80 000
        client.post("/api/terminal/order", json={
            "symbol": "BTCUSDT",
            "side": "long",
            "orderType": "market",
            "margin": 1000.0,
            "leverage": 10,
            "currentPrice": 80000.0
        }, headers=headers)

        state = client.get("/api/terminal/state", headers=headers).json()
        pos = state["positions"][0]
        pos_id = pos["id"]

        # 2. Закриваємо позицію по ціні 82 000 (+2.5% росту BTC)
        # size = 1000 * 10 / 80000 = 0.125 BTC
        # pnl = (82000 - 80000) * 0.125 = +250.0 USDT
        close_res = client.post("/api/terminal/close-position", json={
            "id": pos_id,
            "markPrice": 82000.0
        }, headers=headers)

        assert close_res.status_code == 200
        close_data = close_res.json()
        assert close_data["ok"] is True
        assert close_data["record"]["pnl"] == 250.0
        assert close_data["record"]["roi"] == 25.0

        # 3. Перевіряємо баланс після закриття: 10 000 + 250 = 10 250.0 USDT
        wallet = client.get("/api/wallet", headers=headers).json()
        assert wallet["balance"] == 10250.0
        assert wallet["usedMargin"] == 0.0

    def test_tickers_caching_and_network_fallback(self, client, setup_isolated_db):
        """Кешування GET /api/tickers на 4 секунди та fallback при збої Bybit."""
        # 1. Перший запит наповнює кеш
        res1 = client.get("/api/tickers")
        assert res1.status_code == 200
        data1 = res1.json()
        assert data1["ok"] is True
        assert len(data1["tickers"]) >= 3

        # 2. Другий запит повертає той самий збережений об'єкт із кешу
        first_ts = app.tickers_cache["timestamp"]
        assert first_ts > 0

        res2 = client.get("/api/tickers")
        assert res2.status_code == 200
        assert app.tickers_cache["timestamp"] == first_ts

        # 3. Симулюємо мережевий збій Bybit API після закінчення 4-секундного вікна
        app.tickers_cache["timestamp"] = time.time() - 10.0  # Кеш застарів
        mock_sess = setup_isolated_db["mock_session"]
        mock_sess.should_fail = True

        res_fallback = client.get("/api/tickers")
        assert res_fallback.status_code == 200
        data_fb = res_fallback.json()
        # Повинен спрацювати fallback на збережений кеш
        assert data_fb["ok"] is True
        assert len(data_fb["tickers"]) >= 3

    def test_scenarios_reveal_invalid_id_returns_404(self, client):
        """POST /api/scenarios/reveal із scenarioId=99 повертає HTTP 404 «Сценарій не знайдено»."""
        reveal_payload = {
            "scenarioId": 99,
            "action": "long"
        }
        res = client.post("/api/scenarios/reveal", json=reveal_payload)
        assert res.status_code == 404
        data = res.json()
        assert data["ok"] is False
        assert "Сценарій не знайдено" in data["error"]
