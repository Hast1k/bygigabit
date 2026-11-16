"""
Модуль двофакторної автентифікації (2FA) для ByGigaBit:
RFC 6238 TOTP алгоритм, генерація унікальних ключів,
векторних QR-кодів (SVG) та резервних кодів на пошту.
"""

import os
import time
import base64
import hmac
import hashlib
import struct
import random
import io
from typing import Optional, Dict
import qrcode
import qrcode.image.svg

_pending_2fa_secrets: Dict[int, str] = {}
_email_backup_codes: Dict[str, Dict[str, float]] = {}  # email -> {"code": str, "expires": float}


def generate_totp_secret() -> str:
    """Генерація нового унікального Base32-секрету (32 символи без паддингу)."""
    random_bytes = os.urandom(20)
    return base64.b32encode(random_bytes).decode("utf-8").rstrip("=")


def get_totp_uri(secret: str, email: str, issuer: str = "ByGigaBit") -> str:
    """Формування стандартизованого TOTP URI для Google Authenticator та інших додатків."""
    clean_secret = secret.strip().replace(" ", "").upper()
    return f"otpauth://totp/{issuer}:{email}?secret={clean_secret}&issuer={issuer}&algorithm=SHA1&digits=6&period=30"


def generate_qr_svg(uri: str) -> str:
    """Генерація чистого векторного SVG-зображення QR-коду."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=2,
        image_factory=qrcode.image.svg.SvgPathImage
    )
    qr.add_data(uri)
    qr.make(fit=True)
    img = qr.make_image()
    buf = io.BytesIO()
    img.save(buf)
    return buf.getvalue().decode("utf-8")


def get_totp_code(secret: str, time_step: int = 30, for_time: Optional[float] = None) -> str:
    """Обчислення 6-значного коду за алгоритмом RFC 6238 TOTP."""
    if for_time is None:
        for_time = time.time()
    clean_secret = secret.strip().replace(" ", "").upper()
    padding = len(clean_secret) % 8
    if padding != 0:
        clean_secret += "=" * (8 - padding)
    key = base64.b32decode(clean_secret, casefold=True)
    counter = int(for_time // time_step)
    msg = struct.pack(">Q", counter)
    h = hmac.new(key, msg, hashlib.sha1).digest()
    offset = h[-1] & 0x0F
    code_int = struct.unpack(">I", h[offset:offset + 4])[0] & 0x7FFFFFFF
    return f"{code_int % 1000000:06d}"


def verify_totp_code(secret: str, code: str, valid_window: int = 1) -> bool:
    """Перевірка 6-значного TOTP коду з вікном +-30 секунд."""
    if not secret or not code:
        return False
    clean_code = code.strip()
    if len(clean_code) != 6 or not clean_code.isdigit():
        return False
    now = time.time()
    for offset in range(-valid_window, valid_window + 1):
        if get_totp_code(secret, 30, now + (offset * 30)) == clean_code:
            return True
    return False


def store_pending_secret(user_id: int, secret: str):
    """Збереження згенерованого секрету до моменту підтвердження кодом."""
    _pending_2fa_secrets[user_id] = secret.strip().upper()


def get_pending_secret(user_id: int) -> Optional[str]:
    """Отримання очікуючого секрету для користувача."""
    return _pending_2fa_secrets.get(user_id)


def clear_pending_secret(user_id: int):
    """Очищення очікуючого секрету."""
    _pending_2fa_secrets.pop(user_id, None)


def send_email_backup_code(email: str) -> str:
    """Генерація та збереження резервного коду на пошту (термін дії 10 хв)."""
    email_clean = email.lower().strip()
    code = f"{random.randint(100000, 999999)}"
    _email_backup_codes[email_clean] = {
        "code": code,
        "expires": time.time() + 600.0
    }
    print(f"[ByGigaBit Email Service] Резервний код для {email_clean}: {code}")
    return code


def verify_email_backup_code(email: str, code: str) -> bool:
    """Перевірка резервного коду, надісланого на пошту."""
    email_clean = email.lower().strip()
    entry = _email_backup_codes.get(email_clean)
    if not entry:
        return False
    if time.time() > entry["expires"]:
        _email_backup_codes.pop(email_clean, None)
        return False
    if entry["code"] == code.strip():
        _email_backup_codes.pop(email_clean, None)
        return True
    return False
