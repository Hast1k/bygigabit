import pytest
from fastapi.testclient import TestClient
import totp_service


class TestProfileAndTotp:
    def test_update_nickname(self, client: TestClient, trader_auth: dict):
        resp = client.post(
            "/api/user/nickname",
            json={"nickname": "CyberTrader777"},
            headers=trader_auth["headers"]
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["nickname"] == "CyberTrader777"

        # Check in me
        me_resp = client.get("/api/auth/me", headers=trader_auth["headers"])
        assert me_resp.json()["user"]["nickname"] == "CyberTrader777"

    def test_change_password(self, client: TestClient, trader_auth: dict):
        # 1. Invalid current password
        resp = client.post(
            "/api/user/change-password",
            json={"currentPassword": "wrongPassword", "newPassword": "BrandNewSecurePass123!", "repeatPassword": "BrandNewSecurePass123!"},
            headers=trader_auth["headers"]
        )
        assert resp.json()["ok"] is False

        # 2. Short password (< 8 chars)
        resp = client.post(
            "/api/user/change-password",
            json={"currentPassword": "SecurePass123!", "newPassword": "short", "repeatPassword": "short"},
            headers=trader_auth["headers"]
        )
        assert resp.json()["ok"] is False

        # 3. Mismatch
        resp = client.post(
            "/api/user/change-password",
            json={"currentPassword": "SecurePass123!", "newPassword": "BrandNewSecurePass123!", "repeatPassword": "DifferentPass123!"},
            headers=trader_auth["headers"]
        )
        assert resp.json()["ok"] is False

        # 4. Success
        resp = client.post(
            "/api/user/change-password",
            json={"currentPassword": "SecurePass123!", "newPassword": "BrandNewSecurePass123!", "repeatPassword": "BrandNewSecurePass123!"},
            headers=trader_auth["headers"]
        )
        assert resp.json()["ok"] is True

    def test_totp_generate_and_enable_flow(self, client: TestClient, trader_auth: dict):
        # 1. Generate secret
        gen_resp = client.post("/api/user/2fa/generate-secret", headers=trader_auth["headers"])
        assert gen_resp.status_code == 200
        gen_data = gen_resp.json()
        assert gen_data["ok"] is True
        assert len(gen_data["secret"]) == 32
        assert "<svg" in gen_data["qr_svg"]

        # 2. Confirm enable with real TOTP code
        code = totp_service.get_totp_code(gen_data["secret"])
        enable_resp = client.post(
            "/api/user/2fa/confirm-enable",
            json={"code": code},
            headers=trader_auth["headers"]
        )
        assert enable_resp.status_code == 200
        assert enable_resp.json()["ok"] is True
        assert enable_resp.json()["twoFactor"] is True

        # Check me
        me_resp = client.get("/api/auth/me", headers=trader_auth["headers"])
        assert me_resp.json()["user"]["twoFactorEnabled"] is True

        # 3. Confirm disable
        disable_resp = client.post(
            "/api/user/2fa/confirm-disable",
            json={"code": "777888"},
            headers=trader_auth["headers"]
        )
        assert disable_resp.status_code == 200
        assert disable_resp.json()["ok"] is True
        assert disable_resp.json()["twoFactor"] is False

    def test_email_backup_code_flow(self, client: TestClient, trader_auth: dict):
        resp = client.post("/api/auth/2fa/send-email-code", json={}, headers=trader_auth["headers"])
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_google_auth_flow(self, client: TestClient):
        # 1. First time Google login without password asks for password
        resp = client.post("/api/auth/google", json={"email": "new.google.trader@gmail.com"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data.get("needsPassword") is True

        # 2. Provide password -> returns requires2FA since 2FA is active
        resp2 = client.post(
            "/api/auth/google",
            json={"email": "new.google.trader@gmail.com", "password": "GoogleUserSecurePass123!"}
        )
        assert resp2.status_code == 200
        data2 = resp2.json()
        assert data2["ok"] is True
        assert data2.get("requires2FA") is True

        # 3. Provide 2FA code (or master demo code 777888) -> login completed
        resp3 = client.post(
            "/api/auth/google",
            json={
                "email": "new.google.trader@gmail.com",
                "password": "GoogleUserSecurePass123!",
                "code2fa": "777888"
            }
        )
        assert resp3.status_code == 200
        data3 = resp3.json()
        assert data3["ok"] is True
        assert "token" in data3
        assert data3["user"]["email"] == "new.google.trader@gmail.com"
