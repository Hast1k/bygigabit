"""
Конфігурація та глобальні фікстури для багаторівневого набору тестів ByGigaBit.
Забезпечує ізоляцію тимчасової БД (SQLite) та повний мокінг викликів Bybit API.
"""

import os
import time
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

import database
import app
import scenarios_data


class MockBybitSession:
    """Мок-сесія клієнта Bybit V5 без мережевих запитів."""

    def __init__(self, *args, **kwargs):
        self.should_fail = False

    def get_tickers(self, category="spot", symbol=None):
        if self.should_fail:
            raise ConnectionError("Bybit API connection failed")

        tickers = [
            {
                "symbol": "BTCUSDT",
                "lastPrice": "80000.00",
                "price24hPcnt": "0.025",
                "highPrice24h": "81000.00",
                "lowPrice24h": "79000.00",
                "volume24h": "12500.5",
                "turnover24h": "1000000000.0",
            },
            {
                "symbol": "ETHUSDT",
                "lastPrice": "2600.00",
                "price24hPcnt": "-0.015",
                "highPrice24h": "2650.00",
                "lowPrice24h": "2550.00",
                "volume24h": "45000.0",
                "turnover24h": "117000000.0",
            },
            {
                "symbol": "SOLUSDT",
                "lastPrice": "180.00",
                "price24hPcnt": "0.05",
                "highPrice24h": "185.00",
                "lowPrice24h": "175.00",
                "volume24h": "98000.0",
                "turnover24h": "17640000.0",
            },
        ]
        if symbol:
            filtered = [t for t in tickers if t["symbol"] == symbol]
            return {"retCode": 0, "retMsg": "OK", "result": {"list": filtered}}
        return {"retCode": 0, "retMsg": "OK", "result": {"list": tickers}}

    def get_kline(self, category="spot", symbol="BTCUSDT", interval="15", limit=70, **kwargs):
        if self.should_fail:
            raise ConnectionError("Bybit API kline error")

        # 70 синтетичних свічок для розрахунків ML та тренажера
        now_sec = int(time.time())
        base_p = 80000.0
        candles = []
        for i in range(limit):
            t = (now_sec - (limit - i) * 900) * 1000
            o = base_p + (i * 20.0)
            c = o + 15.0
            h = c + 10.0
            l = o - 10.0
            v = 150.0 + (i * 2.0)
            candles.append([str(t), str(o), str(h), str(l), str(c), str(v)])

        return {"retCode": 0, "retMsg": "OK", "result": {"list": list(reversed(candles))}}

    def get_orderbook(self, category="spot", symbol="BTCUSDT", limit=25):
        return {
            "retCode": 0,
            "retMsg": "OK",
            "result": {
                "ts": int(time.time() * 1000),
                "a": [["80050.00", "1.5"], ["80060.00", "2.1"]],
                "b": [["79950.00", "1.8"], ["79940.00", "3.0"]]
            }
        }


@pytest.fixture(autouse=True)
def setup_isolated_db(tmp_path, monkeypatch):
    """
    Ізольована тимчасова SQLite БД для кожного тесту.
    Гарантує чисту схему без впливу на робочу базу даних.
    """
    test_db_file = tmp_path / "test_bygigabit.db"
    test_engine = create_engine(
        f"sqlite:///{test_db_file}",
        connect_args={"check_same_thread": False}
    )

    # Примусове увімкнення Foreign Keys у SQLite для каскадного видалення
    @event.listens_for(test_engine, "connect")
    def enable_sqlite_fk(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

    # Підміна глобального engine та SessionLocal у модулях
    monkeypatch.setattr(database, "engine", test_engine)
    monkeypatch.setattr(database, "SessionLocal", TestSessionLocal)
    monkeypatch.setattr(database, "raw_db_url", f"sqlite:///{test_db_file}")

    # Створення таблиць та ініціалізація базових користувачів
    database.Base.metadata.create_all(bind=test_engine)
    database.init_db()

    # Мокінг зовнішнього Bybit API
    mock_session = MockBybitSession()
    monkeypatch.setattr(app, "get_session", lambda: mock_session)
    monkeypatch.setattr(app, "get_symbol_mark_price", lambda s: 80000.0 if s == "BTCUSDT" else (2600.0 if s == "ETHUSDT" else 180.0))

    # Скидання внутрішнього біржового кешу
    monkeypatch.setattr(app, "tickers_cache", {"timestamp": 0.0, "tickers": []})
    monkeypatch.setattr(app, "liquidation_notifications", {})
    monkeypatch.setattr(app, "order_fill_notifications", {})

    # Скидання кешу сценаріїв
    scenarios_data._scenarios_cache.clear()

    yield {
        "engine": test_engine,
        "session_maker": TestSessionLocal,
        "mock_session": mock_session
    }

    test_engine.dispose()


@pytest.fixture
def client():
    """Клієнт тестування FastAPI TestClient."""
    return TestClient(app.app)


@pytest.fixture
def trader_auth(client):
    """Авторизація звичайного трейдера з отриманням токена та кукі."""
    user = database.db_get_user_by_email("trader@bygigabit.com")
    token = f"sess_test_trader_{user['id']}"
    database.db_save_session(token, user["id"])
    client.cookies.clear()
    headers = {"Authorization": f"Bearer {token}"}
    return {"token": token, "cookies": {"bygigabit_session": token}, "headers": headers, "user": user}


@pytest.fixture
def admin_auth(client):
    """Авторизація адміністратора платформи з отриманням токена та кукі."""
    user = database.db_get_user_by_email("admin@bygigabit.com")
    token = f"sess_test_admin_{user['id']}"
    database.db_save_session(token, user["id"])
    client.cookies.clear()
    headers = {"Authorization": f"Bearer {token}"}
    return {"token": token, "cookies": {"bygigabit_session": token}, "headers": headers, "user": user}
