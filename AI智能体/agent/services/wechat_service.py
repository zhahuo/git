from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

from ..channels.humanize import message_delay, split_reply, thinking_delay
from ..module import Module

logger = logging.getLogger(__name__)

FRIENDLY_ERROR = "抱歉，我刚刚处理这条消息时出了点问题，请稍后再试。"


class WeChatService(Module):
    """基于 wxauto 的 Windows 微信客户端服务模块。"""

    name = "wechat"

    def __init__(
        self,
        config: Any = None,
        bus: Any = None,
        brain: Any = None,
        wx: Any = None,
    ) -> None:
        super().__init__(config, bus)
        self.brain = brain
        self.wx = wx
        self._poll_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        if self.running and self._poll_task is not None and not self._poll_task.done():
            return
        await super().start()
        if not self._is_enabled():
            logger.info("WECHAT_ENABLED 未开启，微信服务保持可运行但暂不轮询。")
            return
        if self._is_dry_run():
            logger.info("WECHAT_DRY_RUN=1，微信服务保持可运行但不连接微信。")
            return
        try:
            if self.wx is None:
                import wxauto

                self.wx = wxauto.WeChat()
        except Exception as exc:
            logger.warning("wxauto 不可用，微信服务进入演示模式：%s", exc)
            return
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
                logger.exception("停止微信轮询任务时出错")
        await super().stop()

    async def handle(self, event: dict[str, Any]) -> None:
        return None

    def parse_message(self, raw: Any) -> tuple[str, str] | None:
        """把 wxauto 原始消息解析为 (chat_id, text)。"""
        if isinstance(raw, dict):
            if "chat" in raw or "chat_id" in raw:
                chat_id = raw.get("chat") or raw.get("chat_id")
                text = raw.get("text")
                if chat_id is not None and text:
                    return str(chat_id), str(text)
                return None
            if len(raw) == 1:
                for key, value in raw.items():
                    if key and value:
                        return str(key), str(value)
            return None
        if isinstance(raw, (list, tuple)) and len(raw) == 2:
            chat_id, text = raw
            if chat_id is not None and text:
                return str(chat_id), str(text)
        return None

    async def handle_message(self, chat_id: str, text: str) -> str | None:
        chat_id = str(chat_id)
        if not self._is_allowed(chat_id):
            logger.info("忽略未授权的微信聊天：%s", chat_id)
            return None
        if self.brain is None:
            from ..brain import AgentBrain

            self.brain = AgentBrain(self.config)
        try:
            reply = await self.brain.handle_message(chat_id, text)
        except Exception:
            logger.exception("处理微信消息失败，chat_id=%s", chat_id)
            reply = FRIENDLY_ERROR
        await self._send_humanized(chat_id, reply)
        return reply

    async def _send_humanized(self, chat_id: str, reply: str) -> None:
        if self.config is None:
            self._send_text(chat_id, reply)
            return
        await asyncio.sleep(thinking_delay(self.config))
        if self.config.multi_reply_enabled:
            segments = split_reply(reply)
            for index, segment in enumerate(segments):
                self._send_text(chat_id, segment)
                if index < len(segments) - 1:
                    await asyncio.sleep(message_delay(self.config))
        else:
            self._send_text(chat_id, reply)

    def _send_text(self, chat_id: str, text: str) -> None:
        if self.wx is None:
            logger.info("演示模式：向 %s 发送：%s", chat_id, text)
            return
        if hasattr(self.wx, "SendMsg"):
            self.wx.SendMsg(text, who=chat_id)
        else:
            self.wx.send_message(chat_id, text)

    def _fetch_new_messages(self) -> list[tuple[str, str]]:
        if self.wx is None:
            return []
        fetch = getattr(self.wx, "GetNextNewMessage", None)
        if fetch is None:
            fetch = self.wx.get_next_message
        try:
            raw = fetch(timeout=1)
        except TypeError:
            raw = fetch()
        messages: list[tuple[str, str]] = []
        if isinstance(raw, dict):
            for chat_id, text in raw.items():
                parsed = self.parse_message({"chat_id": chat_id, "text": text})
                if parsed is not None:
                    messages.append(parsed)
        elif isinstance(raw, (list, tuple)):
            for item in raw:
                parsed = self.parse_message(item)
                if parsed is not None:
                    messages.append(parsed)
        else:
            parsed = self.parse_message(raw)
            if parsed is not None:
                messages.append(parsed)
        return messages

    async def _poll_loop(self) -> None:
        while self.running:
            messages: list[tuple[str, str]] = []
            try:
                messages = await asyncio.to_thread(self._fetch_new_messages)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("微信轮询出错：%s", exc)
            for chat_id, text in messages:
                await self.handle_message(chat_id, text)
            if not messages:
                await asyncio.sleep(3)

    def _is_enabled(self) -> bool:
        if self.config is not None and hasattr(self.config, "wechat_enabled"):
            return bool(self.config.wechat_enabled)
        return os.getenv("WECHAT_ENABLED", "").strip().lower() in (
            "1",
            "true",
            "yes",
            "on",
        )

    def _is_dry_run(self) -> bool:
        if self.config is not None and hasattr(self.config, "wechat_dry_run"):
            return bool(self.config.wechat_dry_run)
        return os.getenv("WECHAT_DRY_RUN", "1").strip().lower() not in (
            "0",
            "false",
            "no",
            "off",
        )

    def _is_allowed(self, chat_id: str) -> bool:
        allowed = self._allowed_chats()
        return not allowed or chat_id in allowed

    def _allowed_chats(self) -> set[str]:
        raw = ""
        if self.config is not None and hasattr(self.config, "wechat_allowed_chats"):
            raw = str(self.config.wechat_allowed_chats or "")
        else:
            raw = os.getenv("WECHAT_ALLOWED_CHATS", "")
        return {item.strip() for item in raw.split(",") if item.strip()}
