"""
Інтеграційні тести розширеного функціоналу панелі адміністратора:
- Регулювання балансу трейдерів
- Зміна ролей користувачів (RBAC)
- Скидання 2FA захисту
- Моніторинг активних позицій та лімітних ордерів
- Експорт та завантаження звітної статистики (CSV та JSON)
- Захист доступу (403 Forbidden для не-адміністраторів)
"""

import pytest
import database


class TestAdminManagement:
    """Тестування адміністративних операцій та центру експорту статистики."""

    @pytest.fixture(autouse=True)
    def setup_admin_and_user(self, client):
        """Створення адміністратора та звичайного трейдера для тестів."""
        # Реєстрація адміністратора
        admin_payload = {
            "email": "super_admin@bygigabit.com",
            "password": "AdminSecret123!",
            "experienceLevel": "pro"
        }
        res_adm = client.post("/api/auth/register", json=admin_payload)
        self.admin_token = res_adm.json()["token"]
        self.admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
        # Переконуємось, що роль встановлена як Admin
        adm_user = database.db_get_user_by_email("super_admin@bygigabit.com")
        database.db_update_user_role(adm_user["id"], "Admin")
        self.admin_id = adm_user["id"]

        # Реєстрація звичайного трейдера
        trader_payload = {
            "email": "regular_trader@bygigabit.com",
            "password": "TraderSecret123!",
            "experienceLevel": "beginner"
        }
        res_trader = client.post("/api/auth/register", json=trader_payload)
        self.trader_token = res_trader.json()["token"]
        self.trader_headers = {"Authorization": f"Bearer {self.trader_token}"}
        trader_user = database.db_get_user_by_email("regular_trader@bygigabit.com")
        self.trader_id = trader_user["id"]

    def test_admin_rbac_protection(self, client):
        """Звичайний трейдер не має доступу до адмінських ендпоінтів (403 Forbidden)."""
        res_users = client.get("/api/admin/users", headers=self.trader_headers)
        assert res_users.status_code == 403

        res_stats = client.get("/api/admin/stats", headers=self.trader_headers)
        assert res_stats.status_code == 403

        res_export = client.get("/api/admin/export/stats", headers=self.trader_headers)
        assert res_export.status_code == 403

    def test_admin_update_user_balance(self, client):
        """Адміністратор може коригувати та встановлювати баланс трейдера."""
        # Встановлення нового балансу 25 500 USDT
        payload = {"balance": 25500.0}
        res = client.post(f"/api/admin/users/{self.trader_id}/balance", json=payload, headers=self.admin_headers)
        assert res.status_code == 200
        data = res.json()
        assert data["ok"] is True
        assert data["user"]["balance"] == 25500.0

        # Перевірка з боку користувача через /api/wallet
        wallet_res = client.get("/api/wallet", headers=self.trader_headers)
        assert wallet_res.json()["balance"] == 25500.0

    def test_admin_change_user_role(self, client):
        """Адміністратор може змінювати роль користувача (Trader <-> Admin)."""
        payload = {"role": "Admin"}
        res = client.post(f"/api/admin/users/{self.trader_id}/role", json=payload, headers=self.admin_headers)
        assert res.status_code == 200
        assert res.json()["ok"] is True
        assert res.json()["user"]["role"] == "Admin"

    def test_admin_reset_user_2fa(self, client):
        """Адміністратор може скинути 2FA для користувача, що втратив ключ."""
        # Спочатку увімкнемо 2FA
        database.db_update_user_2fa(self.trader_id, enabled=True, secret="JBSWY3DPEHPK3PXP")

        res = client.post(f"/api/admin/users/{self.trader_id}/reset-2fa", headers=self.admin_headers)
        assert res.status_code == 200
        assert res.json()["ok"] is True
        assert res.json()["user"]["twoFactor"] is False

    def test_admin_export_stats_csv_and_json(self, client):
        """Завантаження зведеної статистики платформи у форматах CSV та JSON."""
        # CSV експорт
        res_csv = client.get("/api/admin/export/stats?format=csv", headers=self.admin_headers)
        assert res_csv.status_code == 200
        assert "text/csv" in res_csv.headers["content-type"]
        assert "bygigabit_platform_stats.csv" in res_csv.headers["content-disposition"]
        assert "Показник" in res_csv.text
        assert "Всього користувачів" in res_csv.text

        # JSON експорт
        res_json = client.get("/api/admin/export/stats?format=json", headers=self.admin_headers)
        assert res_json.status_code == 200
        data = res_json.json()
        assert data["ok"] is True
        assert "stats" in data
        assert "total_users" in data["stats"]
        assert data["stats"]["total_users"] >= 2

    def test_admin_export_users_registry(self, client):
        """Завантаження повного реєстру користувачів у CSV форматі."""
        res = client.get("/api/admin/export/users?format=csv", headers=self.admin_headers)
        assert res.status_code == 200
        assert "text/csv" in res.headers["content-type"]
        assert "super_admin@bygigabit.com" in res.text
        assert "regular_trader@bygigabit.com" in res.text

    def test_admin_export_trades_and_positions(self, client):
        """Завантаження журналів угод та реєстру відкритих позицій."""
        # Експорт угод
        res_tr = client.get("/api/admin/export/trades?format=csv", headers=self.admin_headers)
        assert res_tr.status_code == 200
        assert "text/csv" in res_tr.headers["content-type"]
        assert "ID угоди" in res_tr.text

        # Експорт позицій
        res_pos = client.get("/api/admin/export/positions?format=csv", headers=self.admin_headers)
        assert res_pos.status_code == 200
        assert "text/csv" in res_pos.headers["content-type"]
        assert "ID позиції" in res_pos.text
