"""
Наскрізні (E2E) тести автентифікації, реєстрації та розмежування прав доступу (RBAC).
"""

import pytest


class TestAuthAndAccess:
    """Тести маршрутів реєстрації, входу та захисту приватних ендпоінтів."""

    def test_register_new_user_success(self, client):
        """Успішна реєстрація нового трейдера з балансом 10 000 USDT."""
        reg_payload = {
            "email": "newbie_trader@bygigabit.com",
            "nickname": "ProTraderUA",
            "password": "SecurePassword123!",
            "experienceLevel": "beginner"
        }
        res = client.post("/api/auth/register", json=reg_payload)
        assert res.status_code == 200
        data = res.json()

        assert data["ok"] is True
        assert "token" in data
        assert data["user"]["email"] == "newbie_trader@bygigabit.com"
        assert data["user"]["role"] == "Trader"

        # Перевірка нарахування стартового балансу 10 000 USDT через /api/wallet
        wallet_res = client.get("/api/wallet", headers={"Authorization": f"Bearer {data['token']}"})
        assert wallet_res.status_code == 200
        wallet_data = wallet_res.json()
        assert wallet_data["ok"] is True
        assert wallet_data["balance"] == 10000.0

    def test_register_negative_scenarios(self, client):
        """Негативні сценарії реєстрації: дублікат email, короткий пароль, некоректні дані."""
        # Реєструємо першого користувача
        valid_payload = {
            "email": "first_user@bygigabit.com",
            "password": "ValidPassword999!",
            "experienceLevel": "beginner"
        }
        client.post("/api/auth/register", json=valid_payload)

        # Спроба реєстрації дубліката пошти
        dup_res = client.post("/api/auth/register", json=valid_payload)
        assert dup_res.status_code == 200
        dup_data = dup_res.json()
        assert dup_data["ok"] is False
        assert "вже зареєстрований" in dup_data["error"]

        # Пароль менше 6 символів
        short_pass_res = client.post("/api/auth/register", json={
            "email": "short_pass@bygigabit.com",
            "password": "123",
            "experienceLevel": "beginner"
        })
        assert short_pass_res.status_code == 200
        short_data = short_pass_res.json()
        assert short_data["ok"] is False
        assert "не менше 6 символів" in short_data["error"]

        # Порожній email
        empty_email_res = client.post("/api/auth/register", json={
            "email": "   ",
            "password": "ValidPassword999!",
            "experienceLevel": "beginner"
        })
        assert empty_email_res.status_code == 200
        empty_data = empty_email_res.json()
        assert empty_data["ok"] is False

    def test_protected_routes_unauthorized_access(self, client):
        """Захист приватних маршрутів без токена повертає HTTP 401."""
        # 1. Стан гаманця
        wallet_res = client.get("/api/wallet")
        assert wallet_res.status_code == 401
        assert wallet_res.json()["authRequired"] is True

        # 2. Створення торгового ордера
        order_res = client.post("/api/terminal/order", json={
            "symbol": "BTCUSDT",
            "side": "long",
            "orderType": "market",
            "margin": 100
        })
        assert order_res.status_code == 401

        # 3. Аналітичні метрики трейдера
        metrics_res = client.get("/api/analytics/metrics")
        assert metrics_res.status_code == 401

        # 4. Скидання депозиту
        reset_res = client.post("/api/wallet/reset")
        assert reset_res.status_code == 401

    def test_admin_routes_role_based_access_control(self, client, trader_auth, admin_auth):
        """Захист адмін-панелі: HTTP 403 для Trader і HTTP 200 для Admin."""
        # Трейдер намагається отримати список користувачів адмінки
        trader_res = client.get("/api/admin/users", headers=trader_auth["headers"])
        assert trader_res.status_code == 403
        assert trader_res.json()["ok"] is False

        # Трейдер намагається отримати глобальну статистику
        trader_stats = client.get("/api/admin/stats", headers=trader_auth["headers"])
        assert trader_stats.status_code == 403

        # Адміністратор отримує список користувачів
        admin_res = client.get("/api/admin/users", headers=admin_auth["headers"])
        assert admin_res.status_code == 200
        admin_data = admin_res.json()
        assert admin_data["ok"] is True
        assert len(admin_data["users"]) >= 2

        # Адміністратор отримує статистику
        admin_stats = client.get("/api/admin/stats", headers=admin_auth["headers"])
        assert admin_stats.status_code == 200
        assert admin_stats.json()["ok"] is True
        assert "totalUsers" in admin_stats.json()["stats"]

    def test_admin_blocks_user_and_subsequent_login_rejected(self, client, admin_auth):
        """Блокування користувача адміністратором та відхилення подальшого входу."""
        # 1. Створюємо нового активного користувача
        reg_res = client.post("/api/auth/register", json={
            "email": "victim_user@bygigabit.com",
            "password": "Password123!",
            "experienceLevel": "beginner"
        })
        user_id = reg_res.json()["user"]["id"]
        client.cookies.clear()

        # 2. Адмін блокує користувача через toggle-block
        block_res = client.post(f"/api/admin/users/{user_id}/toggle-block", headers=admin_auth["headers"])
        assert block_res.status_code == 200
        block_data = block_res.json()
        assert block_data["ok"] is True
        assert block_data["user"]["isBlocked"] is True

        # 3. Заблокований користувач намагається увійти в систему
        login_res = client.post("/api/auth/login", json={
            "email": "victim_user@bygigabit.com",
            "password": "Password123!",
            "code2fa": "777888"
        })
        assert login_res.status_code == 200
        login_data = login_res.json()
        assert login_data["ok"] is False
        assert "заблоковано адміністратором" in login_data["error"]
