"""Application configuration loaded from environment variables."""
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def _secret_key_file_path() -> Path:
    configured_path = os.getenv("SECRET_KEY_FILE")
    if configured_path:
        return Path(configured_path)
    return BASE_DIR / "data" / "secret_key"


def _read_secret_key_file(secret_file: Path) -> str | None:
    if not secret_file.exists():
        return None

    secret_key = secret_file.read_text(encoding="utf-8").strip()
    if not secret_key:
        raise RuntimeError(f"SECRET_KEY file is empty: {secret_file}")
    return secret_key


def _generate_secret_key_file(secret_file: Path) -> str:
    secret_file.parent.mkdir(parents=True, exist_ok=True)
    secret_key = secrets.token_hex(32)

    try:
        fd = os.open(secret_file, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        existing_key = _read_secret_key_file(secret_file)
        if existing_key:
            return existing_key
        raise

    with os.fdopen(fd, "w", encoding="utf-8") as secret_handle:
        secret_handle.write(secret_key)
        secret_handle.write("\n")

    return secret_key


def _load_secret_key() -> str:
    env_secret_key = os.getenv("SECRET_KEY", "").strip()
    if env_secret_key:
        return env_secret_key

    secret_file = _secret_key_file_path()
    stored_secret_key = _read_secret_key_file(secret_file)
    if stored_secret_key:
        return stored_secret_key

    return _generate_secret_key_file(secret_file)


class Config:
    SECRET_KEY_FILE = _secret_key_file_path()
    SECRET_KEY = _load_secret_key()
    DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'data' / 'plotmap.db'}")
    UPLOAD_DIR = os.getenv("UPLOAD_DIR", str(BASE_DIR / "uploads"))
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", 100 * 1024 * 1024))  # 100MB
    DEFAULT_USER_ID = 1  # Single-user mode for now

    @classmethod
    def validate_required_settings(cls):
        """Ensure required settings resolve to usable values."""
        if not cls.SECRET_KEY:
            raise RuntimeError("Unable to resolve a usable SECRET_KEY.")
