from __future__ import annotations

import asyncio
import threading
from typing import Any

from .brain import AgentBrain
from .bus import AgentBus
from .channels.console import ConsoleChannel
from .channels.telegram import TelegramChannel
from .config import AgentConfig
from .dashboard import DashboardModule
from .module import Module
from .services.chat_service import ChatService
from .services.content_service import ContentService
from .services.emotion_service import EmotionService
from .services.memory_service import MemoryService
from .services.monitor_service import MonitorService
from .services.publish_service import PublishService
from .services.web_service import WebService
from .services.wechat_service import WeChatService


class BrainModule(Module):
    name = "brain"

    def __init__(
        self,
        config: AgentConfig,
        brain: AgentBrain | None = None,
        bus: AgentBus | None = None,
    ) -> None:
        super().__init__(config, bus)
        self.brain = brain or AgentBrain(config)

    async def start(self) -> None:
        self.brain.bus = self.bus
        await super().start()

    async def handle(self, event: dict[str, Any]) -> None:
        if event.get("type") != "user_message":
            return
        payload = event.get("payload") or {}
        if payload.get("source") == "brain":
            return
        message = (payload.get("message") or "").strip()
        if message:
            await self.brain.handle_message(payload.get("user_key") or "_agent", message)


class _ChannelModule(Module):
    def __init__(
        self,
        config: AgentConfig,
        brain: AgentBrain | None = None,
        bus: AgentBus | None = None,
    ) -> None:
        super().__init__(config, bus)
        self.brain = brain or AgentBrain(config)
        self._thread: threading.Thread | None = None
        self._done: asyncio.Event | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    async def start(self) -> None:
        self.brain.bus = self.bus
        self._loop = asyncio.get_running_loop()
        self._done = asyncio.Event()
        self._thread = threading.Thread(
            target=self._run,
            name=f"{self.name}-channel",
            daemon=True,
        )
        self._thread.start()
        await super().start()

    async def handle(self, event: dict[str, Any]) -> None:
        return None

    async def wait_finished(self) -> None:
        done = self._done
        if done is not None:
            await done.wait()

    def _run(self) -> None:
        try:
            self._run_channel()
        except Exception as exc:
            print(f"[{self.name}] 渠道运行出错：{exc}")
        finally:
            if self._loop is not None and self._done is not None:
                self._loop.call_soon_threadsafe(self._done.set)

    def _run_channel(self) -> None:
        raise NotImplementedError


class ConsoleModule(_ChannelModule):
    name = "console"

    def _run_channel(self) -> None:
        ConsoleChannel(self.brain).run()


class TelegramModule(_ChannelModule):
    name = "telegram"

    async def start(self) -> None:
        if not self.config.telegram_token:
            raise RuntimeError("缺少 TELEGRAM_BOT_TOKEN，无法启动 Telegram 模块。")
        await super().start()

    def _run_channel(self) -> None:
        TelegramChannel(self.brain, self.config.telegram_token).run()


def build_default_modules(
    config: AgentConfig,
    enabled: tuple[str, ...] | None = None,
) -> list[Module]:
    enabled = tuple(enabled) if enabled is not None else tuple(config.enabled_modules)
    brain = AgentBrain(config)
    modules: list[Module] = []
    if "brain" in enabled:
        modules.append(BrainModule(config, brain=brain))
    if "console" in enabled:
        modules.append(ConsoleModule(config, brain=brain))
    if "telegram" in enabled:
        modules.append(TelegramModule(config, brain=brain))
    if "memory_service" in enabled:
        modules.append(MemoryService(config))
    if "emotion_service" in enabled:
        modules.append(EmotionService(config))
    if "web_service" in enabled:
        modules.append(WebService(config))
    if "chat_service" in enabled:
        modules.append(ChatService(config, brain=brain))
    if "wechat" in enabled:
        modules.append(WeChatService(config, brain=brain))
    if "content" in enabled:
        modules.append(ContentService(config))
    if "publish" in enabled:
        modules.append(PublishService(config))
    if "monitor" in enabled:
        modules.append(MonitorService(config))
    if "dashboard" in enabled:
        modules.append(DashboardModule(config))
    return modules
