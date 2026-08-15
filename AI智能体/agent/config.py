from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _env(key: str, default: str = "") -> str:
    return os.getenv(key, default)


@dataclass
class AgentConfig:
    name: str = "小忆"
    persona: str = "温柔、好奇、有一点幽默，尊重每个人。"
    model: str = "gpt-4o-mini"
    base_url: str = "https://api.openai.com/v1"
    api_key: str = ""
    telegram_token: str = ""
    search_provider: str = "dry_run"
    search_api_key: str = ""
    douyin_client_key: str = ""
    douyin_client_secret: str = ""
    tiktok_client_key: str = ""
    tiktok_client_secret: str = ""
    data_dir: Path = field(default_factory=lambda: BASE_DIR / "data")
    dry_run: bool = True
    enabled_modules: tuple[str, ...] = (
        "brain",
        "console",
        "memory_service",
        "emotion_service",
        "web_service",
        "chat_service",
        "content",
        "publish",
    )

    @classmethod
    def load(cls, path: Path | None = None) -> "AgentConfig":
        cls._load_dotenv(BASE_DIR / ".env")
        path = path or Path("config.json")
        cfg = cls(
            name=_env("AGENT_NAME", "小忆"),
            persona=_env("AGENT_PERSONA", "温柔、好奇、有一点幽默，尊重每个人。"),
            model=_env("AI_MODEL", "gpt-4o-mini"),
            base_url=_env("AI_BASE_URL", "https://api.openai.com/v1"),
            api_key=_env("AI_API_KEY", ""),
            telegram_token=_env("TELEGRAM_BOT_TOKEN", ""),
            search_provider=_env("SEARCH_PROVIDER", "dry_run"),
            search_api_key=_env("SEARCH_API_KEY", ""),
            douyin_client_key=_env("DOUYIN_CLIENT_KEY", ""),
            douyin_client_secret=_env("DOUYIN_CLIENT_SECRET", ""),
            tiktok_client_key=_env("TIKTOK_CLIENT_KEY", ""),
            tiktok_client_secret=_env("TIKTOK_CLIENT_SECRET", ""),
            data_dir=Path(_env("DATA_DIR", str(BASE_DIR / "data"))),
            dry_run=_env("DRY_RUN", "1") == "1",
            enabled_modules=(
                tuple(
                    name.strip()
                    for name in _env("AGENT_ENABLED_MODULES", "").split(",")
                    if name.strip()
                )
                or (
                    "brain",
                    "console",
                    "memory_service",
                    "emotion_service",
                    "web_service",
                    "chat_service",
                    "content",
                    "publish",
                )
            ),
        )
        if path.exists():
            with path.open("r", encoding="utf-8") as f:
                data = json.load(f)
            for key, value in data.items():
                if not hasattr(cfg, key) or key == "data_dir":
                    continue
                if key == "enabled_modules":
                    value = (
                        tuple(value)
                        if isinstance(value, (list, tuple))
                        else (str(value),)
                    )
                    setattr(cfg, key, value)
                else:
                    setattr(cfg, key, value)
        cfg.data_dir.mkdir(parents=True, exist_ok=True)
        return cfg

    @staticmethod
    def _load_dotenv(dotenv_path: Path) -> None:
        if not dotenv_path.exists():
            return
        for line in dotenv_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
