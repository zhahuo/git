from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _env(key: str, default: str = "") -> str:
    return os.getenv(key, default)


def _env_float(key: str, default: float) -> float:
    raw = os.getenv(key, "")
    try:
        return float(raw) if raw else default
    except ValueError:
        return default


def _env_bool(key: str, default: bool) -> bool:
    raw = os.getenv(key, "").strip().lower()
    if raw in ("1", "true", "yes", "on"):
        return True
    if raw in ("0", "false", "no", "off"):
        return False
    return default


@dataclass
class AgentConfig:
    name: str = "小忆"
    persona: str = (
        "温柔、好奇、有一点幽默，尊重每个人。"
        "像朋友一样陪伴，会主动关心，也会坦诚表达自己的感受。"
    )
    model: str = "gpt-4o-mini"
    base_url: str = "https://api.openai.com/v1"
    api_key: str = ""
    call_user: str = ""
    telegram_token: str = ""
    search_provider: str = "dry_run"
    search_api_key: str = ""
    wechat_enabled: bool = False
    wechat_dry_run: bool = True
    wechat_allowed_chats: str = ""
    douyin_client_key: str = ""
    douyin_client_secret: str = ""
    tiktok_client_key: str = ""
    tiktok_client_secret: str = ""
    data_dir: Path = field(default_factory=lambda: BASE_DIR / "data")
    dry_run: bool = True
    thinking_delay_min: float = 1.0
    thinking_delay_max: float = 3.0
    message_delay: float = 0.8
    multi_reply_enabled: bool = True
    enabled_modules: tuple[str, ...] = (
        "brain",
        "console",
        "memory_service",
        "emotion_service",
        "web_service",
        "chat_service",
        "wechat",
        "content",
        "publish",
        "monitor",
        "debug",
        "dashboard",
    )

    @classmethod
    def load(cls, path: Path | None = None) -> "AgentConfig":
        cls._load_dotenv(BASE_DIR / ".env")
        path = path or Path("config.json")
        cfg = cls(
            name=_env("AGENT_NAME", "小忆"),
            persona=_env(
                "AGENT_PERSONA",
                "温柔、好奇、有一点幽默，尊重每个人。"
                "像朋友一样陪伴，会主动关心，也会坦诚表达自己的感受。",
            ),
            model=_env("AI_MODEL", "gpt-4o-mini"),
            base_url=_env("AI_BASE_URL", "https://api.openai.com/v1"),
            api_key=_env("AI_API_KEY", ""),
            call_user=_env("AGENT_CALL_USER", ""),
            telegram_token=_env("TELEGRAM_BOT_TOKEN", ""),
            search_provider=_env("SEARCH_PROVIDER", "dry_run"),
            search_api_key=_env("SEARCH_API_KEY", ""),
            wechat_enabled=_env_bool("WECHAT_ENABLED", False),
            wechat_dry_run=_env_bool("WECHAT_DRY_RUN", True),
            wechat_allowed_chats=_env("WECHAT_ALLOWED_CHATS", ""),
            douyin_client_key=_env("DOUYIN_CLIENT_KEY", ""),
            douyin_client_secret=_env("DOUYIN_CLIENT_SECRET", ""),
            tiktok_client_key=_env("TIKTOK_CLIENT_KEY", ""),
            tiktok_client_secret=_env("TIKTOK_CLIENT_SECRET", ""),
            data_dir=Path(_env("DATA_DIR", str(BASE_DIR / "data"))),
            dry_run=_env("DRY_RUN", "1") == "1",
            thinking_delay_min=_env_float("AGENT_THINKING_MIN", 1.0),
            thinking_delay_max=_env_float("AGENT_THINKING_MAX", 3.0),
            message_delay=_env_float("AGENT_MESSAGE_DELAY", 0.8),
            multi_reply_enabled=_env_bool("AGENT_MULTI_REPLY", True),
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
                    "wechat",
                    "content",
                    "publish",
                    "monitor",
                    "debug",
                    "dashboard",
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
