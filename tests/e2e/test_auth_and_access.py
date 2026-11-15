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

    def test_admin_and_test_trader_login_without_2fa(self, client):
        """Для адміна та тестового трейдера вхід відбувається миттєво без потреби введення 2FA."""
        client.cookies.clear()

        # Вхід тестового трейдера без коду 2FA
        res_trader = client.post("/api/auth/login", json={
            "email": "trader@bygigabit.com",
            "password": "SecurePass123!"
        })
        assert res_trader.status_code == 200
        trader_data = res_trader.json()
        assert trader_data["ok"] is True
        assert "token" in trader_data
        assert trader_data.get("requires2FA") is not True

        client.cookies.clear()

        # Вхід адміністратора без коду 2FA
        res_admin = client.post("/api/auth/login", json={
            "email": "admin@bygigabit.com",
            "password": "SecurePass123!"
        })
        assert res_admin.status_code == 200
        admin_data = res_admin.json()
        assert admin_data["ok"] is True
        assert "token" in admin_data
        assert admin_data.get("requires2FA") is not True

    def test_real_email_requires_2fa_verification(self, client):
        """Для реальних користувачів обов'язково вимагається проходження 2FA коду."""
        client.cookies.clear()
        real_email = "real_trader@ukr.net"

        # 1. Створюємо реального користувача через реєстрацію
        reg_res = client.post("/api/auth/register", json={
            "email": real_email,
            "password": "StrongPassword999!",
            "nickname": "RealTraderUA"
        })
        assert reg_res.status_code == 200
        client.cookies.clear()

        # 2. Спроба входу без 2FA коду
        login_step1 = client.post("/api/auth/login", json={
            "email": real_email,
            "password": "StrongPassword999!"
        })
        assert login_step1.status_code == 200
        step1_data = login_step1.json()
        assert step1_data["ok"] is True
        assert step1_data.get("requires2FA") is True
        assert "code" in step1_data
        otp_code = step1_data["code"]

        # 3. Спроба входу з невірним кодом 2FA
        wrong_code_res = client.post("/api/auth/login", json={
            "email": real_email,
            "password": "StrongPassword999!",
            "code2fa": "111222"
        })
        assert wrong_code_res.status_code == 200
        assert wrong_code_res.json()["ok"] is False
        assert "Невірний 2FA код" in wrong_code_res.json()["error"]

        # 4. Успішний вхід із правильним одноразовим кодом 2FA
        success_code_res = client.post("/api/auth/login", json={
            "email": real_email,
            "password": "StrongPassword999!",
            "code2fa": otp_code
        })
        assert success_code_res.status_code == 200
        success_data = success_code_res.json()
        assert success_data["ok"] is True
        assert "token" in success_data

    def test_google_auth_registration_and_login(self, client):
        """Реєстрація та вхід через обліковий запис Google."""
        client.cookies.clear()
        google_payload = {
            "email": "investor.google@gmail.com",
            "name": "Alex Google",
            "experienceLevel": "pro"
        }
        res = client.post("/api/auth/google", json=google_payload)
        assert res.status_code == 200
        data = res.json()

        assert data["ok"] is True
        assert "token" in data
        assert data["user"]["email"] == "investor.google@gmail.com"
        assert data["user"]["twoFactor"] is False

        # Перевірка нарахування балансу 10 000 USDT
        wallet_res = client.get("/api/wallet", headers={"Authorization": f"Bearer {data['token']}"})
        assert wallet_res.status_code == 200
        assert wallet_res.json()["balance"] == 10000.0

    def test_login_preserves_user_role_and_experience_from_db(self, client):
        """При вході роль та рівень кваліфікації завантажуються з БД без перевизначення."""
        client.cookies.clear()
        pro_email = "pro_trader@bygigabit.com"
        reg_res = client.post("/api/auth/register", json={
            "email": pro_email,
            "password": "PasswordPro123!",
            "nickname": "ProTrader",
            "experienceLevel": "pro"
        })
        assert reg_res.status_code == 200
        assert reg_res.json()["user"]["experienceLevel"] == "pro"
        client.cookies.clear()

        # Тепер входимо тільки з email і password (без вибору ролі чи досвіду)
        login_res = client.post("/api/auth/login", json={
            "email": pro_email,
            "password": "PasswordPro123!"
        })
        assert login_res.status_code == 200
        data = login_res.json()
        assert data["ok"] is True
        assert data.get("requires2FA") is True
        otp_code = data["code"]

        # Завершуємо вхід через 2FA
        finish_login = client.post("/api/auth/login", json={
            "email": pro_email,
            "password": "PasswordPro123!",
            "code2fa": otp_code
        })
        assert finish_login.status_code == 200
        user_info = finish_login.json()["user"]
        assert user_info["role"] == "Trader"
        assert user_info["experienceLevel"] == "pro"

    def test_google_oauth_endpoints(self, client):
        """Перевірка відкритих точок Google OAuth конфігурації та редиректу."""
        client.cookies.clear()
        config_res = client.get("/api/auth/google/config")
        assert config_res.status_code == 200
        assert config_res.json()["ok"] is True
        assert "configured" in config_res.json()

        # Редирект без налаштованого CLIENT_ID повертає помилку у query параметрі
        login_redir = client.get("/api/auth/google/login", follow_redirects=False)
        assert login_redir.status_code in [302, 303, 307]
