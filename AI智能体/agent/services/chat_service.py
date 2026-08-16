from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

from ..channels.telegram import TelegramChannel
from ..channels.humanize import message_delay, split_reply, thinking_delay
from ..module import Module

logger = logging.getLogger(__name__)

FRIENDLY_ERROR = "抱歉，我刚刚处理这条消息时出了点问题，请稍后再试。"


class AsyncTelegramChannel(TelegramChannel):
    """TelegramChannel 的异步包装，把阻塞网络调用放到执行器线程。"""

    async def fetch_updates(self, offset: int) -> dict[str, Any]:
        return await asyncio.to_thread(
            self._call, "getUpdates", {"offset": offset, "timeout": 20}
        )

    async def send_text(self, chat_id: int, text: str) -> None:
        await asyncio.to_thread(self.send_message, chat_id, text)


class ChatService(Module):
    name = "chat_service"

    def __init__(
        self,
        config: Any = None,
        bus: Any = None,
        brain: Any = None,
        channel: Any = None,
    ) -> None:
        super().__init__(config, bus)
        self.brain = brain
        self.channel = channel
        self._poll_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        if self.running and self._poll_task is not None and not self._poll_task.done():
            return
        await super().start()
        token = self._resolve_token()
        if not token:
            logger.info("未配置 TELEGRAM_BOT_TOKEN，聊天服务保持可运行但暂不轮询。")
            return
        if self.brain is None:
            from ..brain import AgentBrain

            self.brain = AgentBrain(self.config)
        if self.channel is None:
            self.channel = AsyncTelegramChannel(self.brain, token)
        self._poll_task = asyncio.create_task(self._poll_loop())

    async def stop(self) -> None:
        self.running = False
        task = self._poll_task
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            except Exception:
                logger.exception("停止 Telegram 轮询任务时出错")
        await super().stop()

    async def handle(self, event: dict[str, Any]) -> None:
        return None

    def parse_update(self, update: dict[str, Any]) -> tuple[int, str] | None:
        message = update.get("message") or {}
        chat_id = message.get("chat", {}).get("id")
        text = message.get("text")
        if not chat_id or not text:
            return None
        return chat_id, text

    async def handle_update(self, update: dict[str, Any]) -> None:
        parsed = self.parse_update(update)
        if parsed is None:
            return
        chat_id, text = parsed
        try:
            reply = await self.brain.handle_message(str(chat_id), text)
        except Exception:
            logger.exception("处理 Telegram 消息失败，chat_id=%s", chat_id)
            reply = FRIENDLY_ERROR
        try:
            await self._send_humanized(chat_id, reply)
        except Exception:
            logger.exception("发送 Telegram 回复失败，chat_id=%s", chat_id)

    async def _send_humanized(self, chat_id: int, reply: str) -> None:
        if self.config is None:
            await self.channel.send_text(chat_id, reply)
            return
        await asyncio.sleep(thinking_delay(self.config))
        if self.config.multi_reply_enabled:
            segments = split_reply(reply)
            for index, segment in enumerate(segments):
                await self.channel.send_text(chat_id, segment)
                if index < len(segments) - 1:
                    await asyncio.sleep(message_delay(self.config))
        else:
            await self.channel.send_text(chat_id, reply)

    async def _poll_loop(self) -> None:
        while self.running:
            try:
                data = await self.channel.fetch_updates(self.channel.offset)
                for update in data.get("result") or []:
                    self.channel.offset = int(update.get("update_id", 0)) + 1
                    await self.handle_update(update)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("Telegram 轮询出错：%s", exc)
                await asyncio.sleep(3)

    def _resolve_token(self) -> str:
        token = (
            getattr(self.config, "telegram_token", "")
            if self.config is not None
            else ""
        )
        return token or os.getenv("TELEGRAM_BOT_TOKEN", "")
