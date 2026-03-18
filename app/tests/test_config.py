import importlib.util
from pathlib import Path

import dotenv


CONFIG_PATH = Path(__file__).resolve().parents[1] / "config.py"


def _load_config_module(module_name: str):
    spec = importlib.util.spec_from_file_location(module_name, CONFIG_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_uses_secret_key_from_environment(monkeypatch, tmp_path):
    monkeypatch.setattr(dotenv, "load_dotenv", lambda *args, **kwargs: False)
    monkeypatch.setenv("SECRET_KEY", "test-secret-key")
    monkeypatch.setenv("SECRET_KEY_FILE", str(tmp_path / "secret_key"))

    config_module = _load_config_module("config_test_with_env_secret")

    assert config_module.Config.SECRET_KEY == "test-secret-key"


def test_uses_existing_secret_key_file(monkeypatch, tmp_path):
    monkeypatch.setattr(dotenv, "load_dotenv", lambda *args, **kwargs: False)
    monkeypatch.delenv("SECRET_KEY", raising=False)
    secret_file = tmp_path / "secret_key"
    secret_file.write_text("persisted-secret-key\n", encoding="utf-8")
    monkeypatch.setenv("SECRET_KEY_FILE", str(secret_file))

    config_module = _load_config_module("config_test_with_secret_file")

    assert config_module.Config.SECRET_KEY == "persisted-secret-key"
    assert secret_file.read_text(encoding="utf-8") == "persisted-secret-key\n"


def test_generates_secret_key_file_when_missing(monkeypatch, tmp_path):
    monkeypatch.setattr(dotenv, "load_dotenv", lambda *args, **kwargs: False)
    monkeypatch.delenv("SECRET_KEY", raising=False)
    secret_file = tmp_path / "secret_key"
    monkeypatch.setenv("SECRET_KEY_FILE", str(secret_file))

    config_module = _load_config_module("config_test_generates_secret_file")

    generated_key = config_module.Config.SECRET_KEY
    assert generated_key
    assert secret_file.exists()
    assert secret_file.read_text(encoding="utf-8").strip() == generated_key
