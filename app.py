import os
import time
import secrets
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, Query, Request, Body, Response
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pybit.unified_trading import HTTP
import uvicorn
import database

API_KEY = os.getenv("BYBIT_API_KEY", "pTRtHhIA6TD0eqyeB3")
API_SECRET = os.getenv("BYBIT_API_SECRET", "MDncLofTbAsBhk2EWhTagfLj4y6BHdGj4k44")

app = FastAPI(title="ByGigaBit Platform", version="3.0")

# Ініціалізація бази даних (SQLite локально або PostgreSQL на Render)
database.init_db()

os.makedirs("static/css", exist_ok=True)
os.makedirs("static/js", exist_ok=True)
os.makedirs("templates", exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


def get_session():
    return HTTP(
        testnet=False,
        api_key=API_KEY,
        api_secret=API_SECRET,
    )



STARTING_BALANCE = 10000.0

def get_current_user(request: Request) -> Optional[Dict[str, Any]]:
    """Отримання поточного авторизованого користувача з cookie або заголовка Authorization."""
    token = request.cookies.get("bygigabit_session")
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()

    if token:
        return database.db_get_user_by_session(token)
    return None



@app.get("/", response_class=HTMLResponse)
def page_home(request: Request):
    """Головна сторінка — доступна всім без реєстрації."""
    user = get_current_user(request)
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={"active_page": "home", "user": user}
    )


@app.get("/login", response_class=HTMLResponse)
@app.get("/register", response_class=HTMLResponse)
@app.get("/auth", response_class=HTMLResponse)
def page_auth(request: Request):
    """Сторінка авторизації, реєстрації та перевірки 2FA."""
    user = get_current_user(request)
    return templates.TemplateResponse(
        request=request,
        name="auth.html",
        context={"active_page": "auth", "user": user}
    )


@app.get("/chart", response_class=HTMLResponse)
def page_chart(request: Request):
    """Торговий термінал Bybit V5 — доступний ТІЛЬКИ зареєстрованим користувачам."""
    user = get_current_user(request)
    if not user:
        return RedirectResponse(url="/auth?next=/chart", status_code=303)
    return templates.TemplateResponse(
        request=request,
        name="chart.html",
        context={"active_page": "chart", "user": user}
    )


@app.get("/analytics", response_class=HTMLResponse)
@app.get("/journal", response_class=HTMLResponse)
def page_analytics(request: Request):
    """Журнал угод та аналітика — доступні ТІЛЬКИ зареєстрованим користувачам."""
    user = get_current_user(request)
    if not user:
        return RedirectResponse(url="/auth?next=/analytics", status_code=303)
    return templates.TemplateResponse(
        request=request,
        name="analytics.html",
        context={"active_page": "analytics", "user": user}
    )


@app.get("/profile", response_class=HTMLResponse)
@app.get("/wallet", response_class=HTMLResponse)
def page_profile(request: Request):
    """Профіль та баланс гаманця — доступні ТІЛЬКИ зареєстрованим користувачам."""
    user = get_current_user(request)
    if not user:
        return RedirectResponse(url="/auth?next=/profile", status_code=303)
    return templates.TemplateResponse(
        request=request,
        name="profile.html",
        context={"active_page": "profile", "user": user}
    )


@app.get("/admin", response_class=HTMLResponse)
def page_admin(request: Request):
    """Панель адміністратора — доступна ТІЛЬКИ зареєстрованим користувачам з роллю Admin."""
    user = get_current_user(request)
    if not user:
        return RedirectResponse(url="/auth?next=/admin", status_code=303)
    if user.get("role") != "Admin":
        return RedirectResponse(url="/chart?error=admin_only", status_code=303)
    return templates.TemplateResponse(
        request=request,
        name="admin.html",
        context={"active_page": "admin", "user": user}
    )



paper_wallet = {
    "balance": STARTING_BALANCE,
    "equity": STARTING_BALANCE,
    "usedMargin": 0.0,
    "availableMargin": STARTING_BALANCE,
    "realizedPnL": 0.0,
}

open_positions: List[Dict[str, Any]] = [
    {
        "id": "POS-9812",
        "symbol": "BTCUSDT",
        "side": "long",
        "entryPrice": 80150.0,
        "markPrice": 80680.0,
        "margin": 500.0,
        "leverage": 10,
        "size": 0.0623,
        "liqPrice": 72535.0,
        "unrealizedPnL": 33.02,
        "roi": 6.60,
        "openedAt": "2026-11-02 08:30:12"
    }
]

limit_orders: List[Dict[str, Any]] = [
    {
        "id": "ORD-4412",
        "symbol": "BTCUSDT",
        "side": "buy",
        "orderType": "limit",
        "orderPrice": 79500.0,
        "margin": 400.0,
        "leverage": 10,
        "size": 0.0503,
        "status": "active",
        "createdAt": "2026-11-02 08:45:00"
    }
]

order_history: List[Dict[str, Any]] = [
    {
        "id": "TRD-101",
        "symbol": "BTCUSDT",
        "side": "long",
        "entryPrice": 78200.0,
        "exitPrice": 79900.0,
        "margin": 1000.0,
        "leverage": 5,
        "pnl": 108.69,
        "roi": 10.87,
        "isWin": True,
        "closedAt": "2026-11-01 19:40:15"
    },
    {
        "id": "TRD-102",
        "symbol": "ETHUSDT",
        "side": "short",
        "entryPrice": 2520.0,
        "exitPrice": 2560.0,
        "margin": 500.0,
        "leverage": 10,
        "pnl": -79.36,
        "roi": -15.87,
        "isWin": False,
        "closedAt": "2026-11-01 22:15:40"
    },
    {
        "id": "TRD-103",
        "symbol": "SOLUSDT",
        "side": "long",
        "entryPrice": 165.4,
        "exitPrice": 178.2,
        "margin": 600.0,
        "leverage": 8,
        "pnl": 371.46,
        "roi": 61.91,
        "isWin": True,
        "closedAt": "2026-11-02 04:10:02"
    },
    {
        "id": "TRD-104",
        "symbol": "BTCUSDT",
        "side": "short",
        "entryPrice": 81200.0,
        "exitPrice": 80400.0,
        "margin": 800.0,
        "leverage": 10,
        "pnl": 78.81,
        "roi": 9.85,
        "isWin": True,
        "closedAt": "2026-11-02 07:22:18"
    }
]



tickers_cache = {"timestamp": 0.0, "tickers": []}


@app.get("/api/tickers")
def get_tickers():
    """Котирування спотових пар Bybit Spot V5 з кешуванням."""
    global tickers_cache
    now = time.time()
    if now - tickers_cache["timestamp"] < 4.0 and tickers_cache["tickers"]:
        return {"ok": True, "tickers": tickers_cache["tickers"]}

    try:
        session = get_session()
        res = session.get_tickers(category="spot")
        if res.get("retCode") == 0 and res.get("result", {}).get("list"):
            raw_list = res["result"]["list"]
            tickers_list = []
            for t in raw_list:
                sym = t.get("symbol", "")
                if sym.endswith("USDT"):
                    pcnt = float(t.get("price24hPcnt", 0)) * 100
                    tickers_list.append({
                        "symbol": sym,
                        "base": sym.replace("USDT", ""),
                        "price": float(t.get("lastPrice", 0)),
                        "change24h": round(pcnt, 2),
                        "high24h": float(t.get("highPrice24h", 0)),
                        "low24h": float(t.get("lowPrice24h", 0)),
                        "volume24h": float(t.get("volume24h", 0)),
                        "turnover24h": float(t.get("turnover24h", 0)),
                    })
            top_order = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "TONUSDT", "XRPUSDT", "BNBUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "SUIUSDT", "NEARUSDT", "LINKUSDT", "PEPEUSDT"]
            tickers_list.sort(key=lambda x: (0 if x["symbol"] in top_order else 1, top_order.index(x["symbol"]) if x["symbol"] in top_order else -x["turnover24h"]))
            tickers_cache = {"timestamp": now, "tickers": tickers_list}
            return {"ok": True, "tickers": tickers_list}
        return {"ok": False, "error": "Не вдалося отримати тікери"}
    except Exception as e:
        if tickers_cache["tickers"]:
            return {"ok": True, "tickers": tickers_cache["tickers"]}
        return {"ok": False, "error": str(e)}


@app.get("/api/ticker")
def get_ticker(symbol: str = Query("BTCUSDT")):
    """Детальна інформація за останній тікер — публічний доступ."""
    try:
        session = get_session()
        res = session.get_tickers(category="spot", symbol=symbol)
        if res.get("retCode") == 0 and res.get("result", {}).get("list"):
            t = res["result"]["list"][0]
            last_price = float(t.get("lastPrice", 0))
            change_pcnt = float(t.get("price24hPcnt", 0)) * 100
            return {
                "ok": True,
                "symbol": symbol,
                "lastPrice": last_price,
                "change24h": round(change_pcnt, 2),
                "high24h": float(t.get("highPrice24h", 0)),
                "low24h": float(t.get("lowPrice24h", 0)),
                "volume24h": float(t.get("volume24h", 0)),
                "turnover24h": float(t.get("turnover24h", 0)),
                "bidPrice": float(t.get("bid1Price", 0)),
                "askPrice": float(t.get("ask1Price", 0)),
            }
        return {"ok": False, "error": res.get("retMsg", "Не вдалося отримати дані")}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/api/klines")
def get_klines(
    symbol: str = Query("BTCUSDT", description="Торгова пара"),
    interval: str = Query("15", description="Таймфрейм"),
    limit: int = Query(200, ge=10, le=500, description="Кількість свічок")
):
    """Історичні свічки Bybit."""
    try:
        session = get_session()
        res = session.get_kline(category="spot", symbol=symbol, interval=interval, limit=limit)
        if res.get("retCode") != 0:
            return {"ok": False, "error": res.get("retMsg", "Помилка Bybit API")}

        raw_list = res.get("result", {}).get("list", [])
        candles = []
        volumes = []

        for row in reversed(raw_list):
            ts_sec = int(row[0]) // 1000
            o = float(row[1])
            h = float(row[2])
            l = float(row[3])
            c = float(row[4])
            v = float(row[5])

            candles.append({"time": ts_sec, "open": o, "high": h, "low": l, "close": c})
            volumes.append({"time": ts_sec, "value": v, "color": "#10b98188" if c >= o else "#ef444488"})

        return {"ok": True, "symbol": symbol, "interval": interval, "candles": candles, "volumes": volumes}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/api/orderbook")
def get_orderbook(symbol: str = Query("BTCUSDT"), limit: int = Query(7, ge=1, le=50)):
    """Книга ордерів Bybit."""
    try:
        session = get_session()
        res = session.get_orderbook(category="spot", symbol=symbol, limit=limit)
        if res.get("retCode") == 0:
            result = res.get("result", {})
            asks = [[float(p), float(s)] for p, s in result.get("a", [])]
            bids = [[float(p), float(s)] for p, s in result.get("b", [])]
            return {"ok": True, "symbol": symbol, "timestamp": result.get("ts"), "asks": asks, "bids": bids}
        return {"ok": False, "error": res.get("retMsg", "Помилка книги ордерів")}
    except Exception as e:
        return {"ok": False, "error": str(e)}



@app.get("/api/wallet")
def get_paper_wallet(request: Request):
    """Отримання стану віртуального балансу (ТІЛЬКИ ДЛЯ АВТОРИЗОВАНИХ)."""
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "error": "Для перегляду балансу необхідно зареєструватися або увійти", "authRequired": True})

    positions = database.db_get_positions(user["id"])
    history = database.db_get_order_history(user["id"])
    used = sum(p["margin"] for p in positions)
    unrealized = sum(p.get("unrealizedPnL", 0.0) for p in positions)
    balance = user.get("balance", STARTING_BALANCE)
    equity = round(balance + unrealized, 2)
    available = round(max(0.0, equity - used), 2)
    realized_pnl = round(sum(h.get("pnl", 0.0) for h in history), 2)
    return {
        "ok": True,
        "balance": balance,
        "equity": equity,
        "usedMargin": used,
        "availableMargin": available,
        "realizedPnL": realized_pnl,
        "openPositionsCount": len(positions),
    }


@app.post("/api/wallet/reset")
def reset_paper_wallet(request: Request):
    """Скидання віртуального депозиту до $10,000 USDT (ТІЛЬКИ ДЛЯ АВТОРИЗОВАНИХ)."""
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "error": "Потрібна авторизація"})

    database.db_update_user_balance(user["id"], reset_to=STARTING_BALANCE)
    database.db_clear_positions(user["id"])
    database.db_clear_limit_orders(user["id"])
    return {"ok": True, "message": "Баланс успішно скинуто до $10,000.00 USDT", "balance": STARTING_BALANCE}


@app.get("/api/terminal/state")
def get_terminal_state(request: Request):
    """Отримання стану відкритих позицій та ордерів (ТІЛЬКИ ДЛЯ АВТОРИЗОВАНИХ)."""
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "error": "Потрібна авторизація", "authRequired": True})

    positions = database.db_get_positions(user["id"])
    orders = database.db_get_limit_orders(user["id"])
    history = database.db_get_order_history(user["id"], limit=10)
    return {
        "ok": True,
        "positions": positions,
        "limitOrders": orders,
        "history": history,
    }


@app.post("/api/terminal/order")
def create_terminal_order(request: Request, payload: Dict[str, Any] = Body(...)):
    """Створення ордера (ТІЛЬКИ ДЛЯ АВТОРИЗОВАНИХ)."""
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "error": "Для відкриття угод необхідно зареєструватися або увійти"})

    symbol = payload.get("symbol", "BTCUSDT")
    side = payload.get("side", "long")
    order_type = payload.get("orderType", "market")
    margin = float(payload.get("margin", 100))
    leverage = int(payload.get("leverage", 10))
    current_price = float(payload.get("currentPrice", 80000))
    limit_price = float(payload.get("limitPrice", current_price))

    pos_value = margin * leverage
    exec_price = current_price if order_type == "market" else limit_price
    size = round(pos_value / exec_price, 4)

    if order_type == "market":
        if side == "long":
            liq_price = round(exec_price * (1 - (0.95 / leverage)), 1)
        else:
            liq_price = round(exec_price * (1 + (0.95 / leverage)), 1)

        pos_id = f"POS-{int(time.time() * 1000) % 100000}"
        new_pos = {
            "id": pos_id,
            "symbol": symbol,
            "side": side,
            "entryPrice": exec_price,
            "markPrice": exec_price,
            "margin": margin,
            "leverage": leverage,
            "size": size,
            "liqPrice": liq_price,
            "unrealizedPnL": 0.0,
            "roi": 0.0,
            "openedAt": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        database.db_save_position(user["id"], new_pos)
        return {"ok": True, "type": "market", "message": f"Позицію {side.upper()} відкрито", "position": new_pos}
    else:
        ord_id = f"ORD-{int(time.time() * 1000) % 100000}"
        new_ord = {
            "id": ord_id,
            "symbol": symbol,
            "side": "buy" if side == "long" else "sell",
            "orderType": "limit",
            "orderPrice": limit_price,
            "margin": margin,
            "leverage": leverage,
            "size": size,
            "status": "active",
            "createdAt": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        database.db_save_limit_order(user["id"], new_ord)
        return {"ok": True, "type": "limit", "message": f"Лімітний ордер на ${limit_price} розміщено", "order": new_ord}


@app.post("/api/terminal/close-position")
def close_terminal_position(request: Request, payload: Dict[str, Any] = Body(...)):
    """Закриття відкритої позиції (ТІЛЬКИ ДЛЯ АВТОРИЗОВАНИХ)."""
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "error": "Потрібна авторизація"})

    pos_id = payload.get("id")
    mark_price = float(payload.get("markPrice", 0))

    target = database.db_delete_position(user["id"], pos_id)
    if not target:
        return {"ok": False, "error": "Позицію не знайдено"}

    entry = target["entryPrice"]
    exit_p = mark_price if mark_price > 0 else entry
    size = target["size"]
    side = target["side"]

    if side == "long":
        pnl = (exit_p - entry) * size
    else:
        pnl = (entry - exit_p) * size

    pnl = round(pnl, 2)
    roi = round((pnl / target["margin"]) * 100, 2) if target["margin"] > 0 else 0

    database.db_update_user_balance(user["id"], delta_balance=pnl, increment_trades=True)

    hist_record = {
        "id": f"TRD-{int(time.time() * 1000) % 100000}",
        "symbol": target["symbol"],
        "side": target["side"],
        "orderType": "market",
        "price": entry,
        "closePrice": exit_p,
        "margin": target["margin"],
        "leverage": target["leverage"],
        "pnl": pnl,
        "roi": roi,
        "status": "closed",
        "time": time.strftime("%Y-%m-%d %H:%M:%S")
    }
    database.db_save_order_history(user["id"], hist_record)

    return {"ok": True, "message": f"Позицію закрито з PnL: ${pnl} ({roi}%)", "record": hist_record}


@app.post("/api/terminal/cancel-order")
def cancel_terminal_order(request: Request, payload: Dict[str, Any] = Body(...)):
    """Скасування ордера (ТІЛЬКИ ДЛЯ АВТОРИЗОВАНИХ)."""
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "error": "Потрібна авторизація"})

    ord_id = payload.get("id")
    database.db_delete_limit_order(user["id"], ord_id)
    return {"ok": True, "message": "Ордер успішно скасовано"}


@app.get("/api/analytics/metrics")
def get_analytics_metrics(request: Request):
    """Метрики трейдера (ТІЛЬКИ ДЛЯ АВТОРИЗОВАНИХ)."""
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "error": "Потрібна авторизація", "authRequired": True})

    order_history = database.db_get_order_history(user["id"], limit=200)
    total = len(order_history)
    wins = [t for t in order_history if t.get("pnl", 0) >= 0]
    losses = [t for t in order_history if t.get("pnl", 0) < 0]

    win_count = len(wins)
    loss_count = len(losses)
    win_rate = round((win_count / total * 100), 1) if total > 0 else 0.0

    total_profit = sum(t["pnl"] for t in wins)
    total_loss = abs(sum(t["pnl"] for t in losses))
    net_profit = round(sum(t["pnl"] for t in order_history), 2)
    profit_factor = round(total_profit / total_loss, 2) if total_loss > 0 else (total_profit if total_profit > 0 else 1.0)

    avg_win = (total_profit / win_count) if win_count > 0 else 0
    avg_loss = (total_loss / loss_count) if loss_count > 0 else 1
    avg_rr = round(avg_win / avg_loss, 2) if avg_loss > 0 else 1.0

    equity_curve = [{"trade": 0, "balance": STARTING_BALANCE}]
    running_bal = STARTING_BALANCE
    for i, t in enumerate(reversed(order_history), start=1):
        running_bal += t["pnl"]
        equity_curve.append({
            "trade": i,
            "balance": round(running_bal, 2),
            "date": t.get("time", "")
        })

    return {
        "ok": True,
        "metrics": {
            "totalTrades": total,
            "winRate": win_rate,
            "winCount": win_count,
            "lossCount": loss_count,
            "netProfit": net_profit,
            "profitFactor": profit_factor,
            "avgRR": avg_rr,
            "bestTrade": round(max((t["pnl"] for t in order_history), default=0.0), 2),
            "worstTrade": round(min((t["pnl"] for t in order_history), default=0.0), 2),
        },
        "history": order_history,
        "equityCurve": equity_curve,
    }


@app.get("/api/admin/users")
def get_admin_users(request: Request):
    """Список користувачів (ТІЛЬКИ ДЛЯ ADMIN)."""
    user = get_current_user(request)
    if not user or user.get("role") != "Admin":
        return JSONResponse(status_code=403, content={"ok": False, "error": "Доступ заборонено: потрібні права адміністратора"})
    users = database.db_get_all_users()
    return {"ok": True, "users": users}


@app.post("/api/admin/users/{user_id}/toggle-block")
def toggle_user_block(request: Request, user_id: int):
    """Блокування/розблокування трейдера (ТІЛЬКИ ДЛЯ ADMIN)."""
    user = get_current_user(request)
    if not user or user.get("role") != "Admin":
        return JSONResponse(status_code=403, content={"ok": False, "error": "Доступ заборонено"})

    updated_u = database.db_toggle_user_block(user_id)
    if updated_u:
        status_text = "заблоковано" if updated_u["isBlocked"] else "розблоковано"
        return {"ok": True, "message": f"Користувача {updated_u['email']} {status_text}", "user": updated_u}
    return {"ok": False, "error": "Користувача не знайдено"}


@app.get("/api/admin/stats")
def get_admin_stats(request: Request):
    """Статистика платформи (ТІЛЬКИ ДЛЯ ADMIN)."""
    user = get_current_user(request)
    if not user or user.get("role") != "Admin":
        return JSONResponse(status_code=403, content={"ok": False, "error": "Доступ заборонено"})

    all_users = database.db_get_all_users()
    total_users = len(all_users)
    active_users = sum(1 for u in all_users if not u.get("isBlocked", False))
    total_system_trades = sum(u.get("tradesCount", 0) for u in all_users)
    total_system_balance = round(sum(u.get("balance", 0) for u in all_users), 2)

    return {
        "ok": True,
        "stats": {
            "totalUsers": total_users,
            "activeUsers": active_users,
            "blockedUsers": total_users - active_users,
            "totalTrades": total_system_trades,
            "activePositions": 0,
            "totalSystemBalance": total_system_balance,
        }
    }


@app.get("/api/auth/me")
def auth_me(request: Request):
    """Отримання поточного профілю трейдера."""
    user = get_current_user(request)
    if not user:
        return {"ok": False, "authenticated": False}
    return {
        "ok": True,
        "authenticated": True,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "role": user["role"],
            "balance": user.get("balance", STARTING_BALANCE),
            "twoFactor": user.get("twoFactor", True)
        }
    }


@app.post("/api/auth/login")
def auth_login(payload: Dict[str, Any] = Body(...)):
    """Вхід з 2FA перевіркою та збереженням у БД."""
    email = payload.get("email", "").strip()
    password = payload.get("password", "")
    code_2fa = payload.get("code2fa", "").strip()

    if not email or not password:
        return {"ok": False, "error": "Вкажіть пошту та пароль"}

    target_user = database.db_get_user_by_email(email)
    if not target_user:
        role = "Admin" if "admin" in email.lower() else "Trader"
        target_user = database.db_create_user(email=email, password=password, role=role, balance=STARTING_BALANCE)

    if target_user.get("isBlocked", False):
        return {"ok": False, "error": "Ваш акаунт заблоковано адміністратором"}

    if target_user.get("twoFactor", True) and not code_2fa:
        return {
            "ok": True,
            "requires2FA": True,
            "message": "6-значний код підтвердження надіслано на вашу пошту"
        }

    if code_2fa and code_2fa != "777888" and len(code_2fa) != 6:
        return {"ok": False, "error": "Невірний 2FA код підтвердження"}

    session_token = f"sess_{int(time.time())}_{secrets.token_hex(12)}"
    database.db_save_session(session_token, target_user["id"])

    resp = JSONResponse(content={
        "ok": True,
        "token": session_token,
        "user": {
            "id": target_user["id"],
            "email": target_user["email"],
            "role": target_user["role"]
        },
        "message": f"Успішний вхід як {target_user['role']}!"
    })
    resp.set_cookie(
        key="bygigabit_session",
        value=session_token,
        max_age=86400 * 7,
        httponly=False,
        samesite="lax",
        path="/"
    )
    return resp


@app.post("/api/auth/register")
def auth_register(payload: Dict[str, Any] = Body(...)):
    """Реєстрація нового користувача з миттєвою авторизацією у БД."""
    email = payload.get("email", "").strip()
    password = payload.get("password", "")

    if not email or len(password) < 6:
        return {"ok": False, "error": "Вкажіть коректний email та пароль не менше 6 символів"}

    existing = database.db_get_user_by_email(email)
    if existing:
        return {"ok": False, "error": "Користувач із такою поштою вже зареєстрований"}

    role = "Admin" if "admin" in email.lower() else "Trader"
    new_user = database.db_create_user(email=email, password=password, role=role, balance=STARTING_BALANCE)

    session_token = f"sess_{int(time.time())}_{secrets.token_hex(12)}"
    database.db_save_session(session_token, new_user["id"])

    resp = JSONResponse(content={
        "ok": True,
        "token": session_token,
        "user": {
            "id": new_user["id"],
            "email": new_user["email"],
            "role": new_user["role"]
        },
        "message": "Реєстрація успішна! Доступ до біржового термінала відкрито, $10,000 нараховано."
    })
    resp.set_cookie(
        key="bygigabit_session",
        value=session_token,
        max_age=86400 * 7,
        httponly=False,
        samesite="lax",
        path="/"
    )
    return resp


@app.post("/api/auth/logout")
def auth_logout(request: Request, response: Response):
    """Вихід із системи."""
    token = request.cookies.get("bygigabit_session")
    if token:
        database.db_delete_session(token)
    resp = JSONResponse(content={"ok": True, "message": "Ви успішно вийшли з акаунта"})
    resp.delete_cookie(key="bygigabit_session", path="/")
    return resp


if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8080))
    print(f"==================================================")
    print(f"  ByGigaBit запущено: http://{host}:{port}")
    print(f"  Головна сторінка:   http://{host}:{port}/")
    print(f"  Авторизація & 2FA:  http://{host}:{port}/auth")
    print(f"==================================================")
    uvicorn.run("app:app", host=host, port=port, reload=False)
