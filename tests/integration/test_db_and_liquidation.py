"""
Інтеграційні тести взаємодії з БД, транзакційної цілісності, каскадного видалення,
роботи рушія автоліквідацій та аналітичної агрегації метрик.
"""

import time
import pytest
import database
import app


class TestDbAndLiquidation:
    """Інтеграційні тести бази даних, ліквідаційного циклу та аналітики."""

    def test_atomic_db_liquidate_position(self, setup_isolated_db):
        """Атомарність db_liquidate_position(): видалення позиції, запис в історію, непохитність балансу."""
        user = database.db_get_user_by_email("trader@bygigabit.com")
        user_id = user["id"]

        # 1. Встановлюємо баланс 300 USDT (менше ніж маржа 500 USDT, для перевірки захисту від від'ємного балансу)
        database.db_update_user_balance(user_id, reset_to=300.0)

        # 2. Зберігаємо позицію для ліквідації
        pos_id = "POS-LIQ-ATOMIC"
        pos_data = {
            "id": pos_id,
            "symbol": "BTCUSDT",
            "side": "long",
            "entryPrice": 80000.0,
            "markPrice": 80000.0,
            "margin": 500.0,
            "leverage": 10,
            "size": 0.0625,
            "liqPrice": 72400.0,
            "unrealizedPnL": -450.0,
            "roi": -90.0,
            "openedAt": "2026-11-17 12:00:00"
        }
        database.db_save_position(user_id, pos_data)

        # Переконуємось, що позиція існує
        positions_before = database.db_get_positions(user_id)
        assert any(p["id"] == pos_id for p in positions_before)

        # 3. Виконуємо примусову ліквідацію
        liq_result = database.db_liquidate_position(user_id, pos_id, mark_price=72000.0)
        assert liq_result is not None
        assert liq_result["status"] == "liquidated"
        assert liq_result["pnl"] == -500.0
        assert liq_result["roi"] == -100.0

        # 4. Перевіряємо видалення з відкритого портфеля
        positions_after = database.db_get_positions(user_id)
        assert not any(p["id"] == pos_id for p in positions_after)

        # 5. Перевіряємо наявність запису в історії угод
        history = database.db_get_order_history(user_id)
        liq_record = next((h for h in history if h.get("status") == "liquidated"), None)
        assert liq_record is not None
        assert liq_record["margin"] == 500.0

        # 6. Баланс не пішов у мінус (max(0.0, 300 - 500) = 0.0)
        updated_user = database.db_get_user_by_id(user_id)
        assert updated_user["balance"] == 0.0
        assert updated_user["tradesCount"] >= 1

    def test_cascade_delete_user_removes_all_dependent_records(self, setup_isolated_db):
        """Каскадне видалення залежних сесій, позицій, ордерів та історії при видаленні користувача."""
        SessionLocal = setup_isolated_db["session_maker"]

        # 1. Створюємо тимчасового користувача
        test_user = database.db_create_user(
            email="cascade_target@bygigabit.com",
            password="TestPassword123!",
            role="Trader",
            balance=5000.0
        )
        u_id = test_user["id"]

        # 2. Додаємо всі типи зв'язаних сутностей
        token = "sess_cascade_token_123"
        database.db_save_session(token, u_id)

        database.db_save_position(u_id, {
            "id": "POS-CASCADE-1",
            "symbol": "ETHUSDT",
            "side": "long",
            "entryPrice": 2600.0,
            "margin": 200.0,
            "leverage": 10,
            "size": 0.769,
            "liqPrice": 2353.0
        })

        database.db_save_limit_order(u_id, {
            "id": "ORD-CASCADE-1",
            "symbol": "BTCUSDT",
            "side": "buy",
            "orderPrice": 75000.0,
            "margin": 300.0,
            "leverage": 10,
            "size": 0.04
        })

        database.db_save_order_history(u_id, {
            "id": "TRD-CASCADE-1",
            "symbol": "SOLUSDT",
            "side": "long",
            "price": 180.0,
            "closePrice": 190.0,
            "margin": 100.0,
            "leverage": 5,
            "pnl": 27.78,
            "roi": 27.78,
            "status": "closed"
        })

        # Перевіряємо наявність записів перед видаленням
        with SessionLocal() as db:
            assert db.query(database.SessionModel).filter(database.SessionModel.user_id == u_id).count() == 1
            assert db.query(database.PositionModel).filter(database.PositionModel.user_id == u_id).count() == 1
            assert db.query(database.LimitOrderModel).filter(database.LimitOrderModel.user_id == u_id).count() == 1
            assert db.query(database.OrderHistoryModel).filter(database.OrderHistoryModel.user_id == u_id).count() == 1

        # 3. Видаляємо користувача
        deleted = database.db_delete_user(u_id)
        assert deleted is True

        # 4. Перевіряємо, що всі залежні записи у всіх 4 таблицях видалено каскадно
        with SessionLocal() as db:
            assert db.query(database.UserModel).filter(database.UserModel.id == u_id).count() == 0
            assert db.query(database.SessionModel).filter(database.SessionModel.user_id == u_id).count() == 0
            assert db.query(database.PositionModel).filter(database.PositionModel.user_id == u_id).count() == 0
            assert db.query(database.LimitOrderModel).filter(database.LimitOrderModel.user_id == u_id).count() == 0
            assert db.query(database.OrderHistoryModel).filter(database.OrderHistoryModel.user_id == u_id).count() == 0

    def test_check_and_execute_liquidations_sync_triggers(self, monkeypatch, setup_isolated_db):
        """Робота check_and_execute_liquidations_sync() при падінні ціни до liqPrice."""
        user = database.db_get_user_by_email("trader@bygigabit.com")
        u_id = user["id"]

        # Зберігаємо Long позицію: вхід 80 000, ліквідація 72 400
        database.db_save_position(u_id, {
            "id": "POS-TRIGGER-LONG",
            "symbol": "BTCUSDT",
            "side": "long",
            "entryPrice": 80000.0,
            "margin": 400.0,
            "leverage": 10,
            "size": 0.05,
            "liqPrice": 72400.0
        })

        # Поки ціна 80 000 — ліквідація не спрацьовує
        monkeypatch.setattr(app, "get_symbol_mark_price", lambda s: 80000.0)
        app.check_and_execute_liquidations_sync()
        assert len(database.db_get_positions(u_id)) == 1

        # Ціна пробиває liqPrice вниз до 72 000
        monkeypatch.setattr(app, "get_symbol_mark_price", lambda s: 72000.0)
        app.check_and_execute_liquidations_sync()

        # Позиція ліквідована
        assert len(database.db_get_positions(u_id)) == 0
        assert u_id in app.liquidation_notifications
        assert len(app.liquidation_notifications[u_id]) >= 1
        notif = app.liquidation_notifications[u_id][0]
        assert notif["pos_id"] == "POS-TRIGGER-LONG"
        assert notif["exitPrice"] == 72000.0

    def test_check_and_execute_limit_orders_fill(self, monkeypatch, setup_isolated_db):
        """Спрацювання лімітного ордера при досягненні цільової ціни та створення позиції."""
        user = database.db_get_user_by_email("trader@bygigabit.com")
        u_id = user["id"]

        # Лімітна покупка на спаді: розміщено при 80 000, мета 78 000
        database.db_save_limit_order(u_id, {
            "id": "ORD-FILL-TEST",
            "symbol": "BTCUSDT",
            "side": "buy",
            "orderPrice": 78000.0,
            "initialPrice": 80000.0,
            "margin": 300.0,
            "leverage": 10,
            "size": 0.0384
        })

        # Ціна ще вища (79 000) — ордер не повинен виконуватися
        monkeypatch.setattr(app, "get_symbol_mark_price", lambda s: 79000.0)
        app.check_and_execute_liquidations_sync()
        assert len(database.db_get_limit_orders(u_id)) == 1
        assert len(database.db_get_positions(u_id)) == 0

        # Ціна падає до 77 900 — лімітний ордер повинен виконатися
        monkeypatch.setattr(app, "get_symbol_mark_price", lambda s: 77900.0)
        app.check_and_execute_liquidations_sync()

        # Ордер виконано: видалено з лімітів, створено відкриту позицію
        assert len(database.db_get_limit_orders(u_id)) == 0
        positions = database.db_get_positions(u_id)
        assert len(positions) == 1
        filled_pos = positions[0]
        assert filled_pos["symbol"] == "BTCUSDT"
        assert filled_pos["entryPrice"] == 78000.0
        assert filled_pos["margin"] == 300.0

    def test_profile_reset_clears_positions_and_restores_balance(self, client, trader_auth):
        """Скидання профілю (/api/profile/reset) очищає активні позиції/ордери і повертає баланс 10 000 USDT."""
        headers = trader_auth["headers"]
        user_id = trader_auth["user"]["id"]

        # Створюємо активну позицію та лімітний ордер
        database.db_save_position(user_id, {
            "id": "POS-RESET-ME", "symbol": "BTCUSDT", "side": "long",
            "entryPrice": 80000.0, "margin": 500.0, "leverage": 10, "size": 0.0625, "liqPrice": 72400.0
        })
        database.db_save_limit_order(user_id, {
            "id": "ORD-RESET-ME", "symbol": "BTCUSDT", "side": "buy",
            "orderPrice": 75000.0, "initialPrice": 80000.0, "margin": 300.0, "leverage": 10, "size": 0.04
        })
        database.db_update_user_balance(user_id, reset_to=7200.0)

        # Викликаємо скидання профілю
        reset_res = client.post("/api/profile/reset", headers=headers)
        assert reset_res.status_code == 200
        data = reset_res.json()
        assert data["ok"] is True
        assert data["balance"] == 10000.0

        # Переконуємось у повному очищенні через /api/terminal/state
        state = client.get("/api/terminal/state", headers=headers).json()
        assert len(state["positions"]) == 0
        assert len(state["limitOrders"]) == 0

        # Баланс повернено до 10 000 USDT
        wallet = client.get("/api/wallet", headers=headers).json()
        assert wallet["balance"] == 10000.0
        assert wallet["usedMargin"] == 0.0

    def test_analytics_metrics_aggregation(self, client, trader_auth, setup_isolated_db):
        """Агрегація метрик аналітики трейдера на основі реальних записів order_history у БД."""
        headers = trader_auth["headers"]
        user_id = trader_auth["user"]["id"]

        SessionLocal = setup_isolated_db["session_maker"]
        with SessionLocal() as db:
            db.query(database.OrderHistoryModel).filter(database.OrderHistoryModel.user_id == user_id).delete()
            db.commit()

        # Додаємо 3 прибуткові угоди та 1 збиткову
        trades = [
            {"id": "TRD-1", "symbol": "BTCUSDT", "side": "long", "price": 80000.0, "closePrice": 81000.0, "margin": 500.0, "leverage": 10, "pnl": 100.0, "roi": 20.0, "status": "closed", "time": "2026-11-17 10:00:00"},
            {"id": "TRD-2", "symbol": "ETHUSDT", "side": "long", "price": 2600.0, "closePrice": 2700.0, "margin": 400.0, "leverage": 10, "pnl": 200.0, "roi": 50.0, "status": "closed", "time": "2026-11-17 10:30:00"},
            {"id": "TRD-3", "symbol": "SOLUSDT", "side": "long", "price": 180.0, "closePrice": 210.0, "margin": 300.0, "leverage": 5, "pnl": 300.0, "roi": 100.0, "status": "closed", "time": "2026-11-17 11:00:00"},
            {"id": "TRD-4", "symbol": "BTCUSDT", "side": "short", "price": 80000.0, "closePrice": 81500.0, "margin": 500.0, "leverage": 10, "pnl": -150.0, "roi": -30.0, "status": "closed", "time": "2026-11-17 11:30:00"},
        ]
        for t in trades:
            database.db_save_order_history(user_id, t)

        res = client.get("/api/analytics/metrics", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["ok"] is True

        m = data["metrics"]
        assert m["totalTrades"] == 4
        assert m["winCount"] == 3
        assert m["lossCount"] == 1
        assert m["winRate"] == 75.0  # 3 з 4 = 75.0%

        # netProfit = 100 + 200 + 300 - 150 = 450.0
        assert m["netProfit"] == 450.0
        # profitFactor = totalProfit / totalLoss = 600 / 150 = 4.0
        assert m["profitFactor"] == 4.0
        assert m["bestTrade"] == 300.0
        assert m["worstTrade"] == -150.0

        # Крива капіталу: початкова точка (10000) + 4 угоди = 5 точок
        eq = data["equityCurve"]
        assert len(eq) == 5
        assert eq[0]["balance"] == 10000.0
        assert eq[-1]["balance"] == 10450.0
