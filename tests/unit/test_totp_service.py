import pytest
import totp_service


class TestTotpService:
    def test_generate_totp_secret(self):
        secret1 = totp_service.generate_totp_secret()
        secret2 = totp_service.generate_totp_secret()
        assert len(secret1) == 32
        assert len(secret2) == 32
        assert secret1 != secret2

    def test_get_totp_uri(self):
        secret = "JBSWY3DPEHPK3PXP"
        uri = totp_service.get_totp_uri(secret, "test@example.com")
        assert uri.startswith("otpauth://totp/ByGigaBit:test@example.com")
        assert f"secret={secret}" in uri
        assert "issuer=ByGigaBit" in uri

    def test_generate_qr_svg(self):
        secret = "JBSWY3DPEHPK3PXP"
        uri = totp_service.get_totp_uri(secret, "test@example.com")
        svg = totp_service.generate_qr_svg(uri)
        assert "<svg" in svg
        assert "</svg>" in svg
        assert "<path" in svg

    def test_totp_code_verification(self):
        secret = totp_service.generate_totp_secret()
        code = totp_service.get_totp_code(secret)
        assert len(code) == 6
        assert code.isdigit()
        assert totp_service.verify_totp_code(secret, code) is True
        assert totp_service.verify_totp_code(secret, "000000" if code != "000000" else "111111") is False

    def test_email_backup_code(self):
        email = "backup_user@bygigabit.com"
        code = totp_service.send_email_backup_code(email)
        assert len(code) == 6
        assert code.isdigit()
        assert totp_service.verify_email_backup_code(email, code) is True
        # Code is one-time use
        assert totp_service.verify_email_backup_code(email, code) is False
