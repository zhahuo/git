from __future__ import annotations

import asyncio
import logging
import os
import threading
from typing import Any

from ..channels.humanize import message_delay, split_reply, thinking_delay
from ..module import Module

logger = logging.getLogger(__name__)

FRIENDLY_ERROR = "抱歉，我刚刚处理这条消息时出了点问题，请稍后再试。"


class QQService(Module):
    """基于 NapCat + OneBot11 的 QQ 对话服务模块。"""

    name = "qq"

    def __init__(
        self,
        config: Any = None,
        bus: Any = None,
        brain: Any = None,
        client: Any = None,
    ) -> None:
        super().__init__(config, bus)
        self.brain = brain
        self.client = client
        self.sent: list[tuple[str, str]] = []
        self._client_thread: threading.Thread | None = None
        self._handlers_registered = False

    async def start(self) -> None:
        if self.running and self._client_thread is not None and self._client_thread.is_alive():
            return
        await super().start()
        if not self._is_enabled():
            logger.info("QQ_ENABLED 未开启，QQ 服务保持可运行但暂不连接。")
            return
        if not self._bot_qq():
            logger.warning("未配置 QQ_BOT_QQ，QQ 服务保持可运行但不连接。")
            return
        if self._is_dry_run():
            logger.info("QQ_DRY_RUN=1，将连接 NapCat，但回复只记录不真正发送。")
        try:
            if self.client is None:
                self.client = self._new_bot_client()
            self._register_handlers()
        except Exception as exc:
            logger.warning("ncatbot 不可用，QQ 服务暂不连接：%s", exc)
            return
        self._client_thread = threading.Thread(
            target=self._run_client,
            name="qq-service",
            daemon=True,
        )
        self._client_thread.start()

    async def stop(self) -> None:
        self.running = False
        client = self.client
        self.client = None
        self._client_thread = None
        if client is not None and getattr(client, "_running", False):
            try:
                await asyncio.to_thread(client.bot_exit)
            except Exception:
                logger.exception("停止 QQ 客户端时出错")
        await super().stop()

    async def handle(self, event: dict[str, Any]) -> None:
        return None

    def parse_event(self, event: Any) -> tuple[str, str, bool, bool] | None:
        """把 QQ 事件解析为 (会话标识, 文本, 是否群聊, 是否@或引用)。"""
        text = self._event_text(event)
        if not text:
            return None
        group_id = getattr(event, "group_id", None)
        if group_id is not None:
            group_id = str(group_id)
            if group_id:
                return group_id, text, True, self._is_mention(event)
            return None
        user_id = getattr(event, "user_id", None)
        if user_id is None:
            return None
        user_id = str(user_id)
        if user_id:
            return user_id, text, False, False
        return None

    async def handle_qq_event(self, event: Any) -> bool:
        parsed = self.parse_event(event)
        if parsed is None:
            return False
        chat_key, text, is_group, is_mention = parsed
        if is_group:
            if not self._is_allowed_group(chat_key):
                logger.info("忽略未授权的 QQ 群消息：%s", chat_key)
                return False
            if not self._should_reply_group(is_mention):
                logger.info("忽略未 @ 或引用的 QQ 群消息：%s", chat_key)
                return False
        else:
            if not self._is_allowed_private(chat_key):
                logger.info("忽略未授权的 QQ 私聊：%s", chat_key)
                return False
        await self.handle_message(chat_key, text, event, is_group=is_group)
        return True

    async def handle_message(
        self,
        chat_key: str,
        text: str,
        event: Any,
        is_group: bool = False,
    ) -> str | None:
        if self.brain is None:
            from ..brain import AgentBrain

            self.brain = AgentBrain(self.config)
        try:
            reply = await self.brain.handle_message(chat_key, text)
        except Exception:
            logger.exception("处理 QQ 消息失败，chat_key=%s", chat_key)
            reply = FRIENDLY_ERROR
        await self._send_humanized(chat_key, event, reply, is_group)
        return reply

    async def _send_humanized(
        self,
        chat_key: str,
        event: Any,
        reply: str,
        is_group: bool,
    ) -> None:
        if self.config is None:
            await self._send_text(chat_key, event, reply, is_group)
            return
        if self._is_dry_run():
            segments = split_reply(reply) or [reply] if self.config.multi_reply_enabled else [reply]
            for segment in segments:
                await self._send_text(chat_key, event, segment, is_group)
            return
        await asyncio.sleep(thinking_delay(self.config))
        if self.config.multi_reply_enabled:
            segments = split_reply(reply) or [reply]
        else:
            segments = [reply]
        for index, segment in enumerate(segments):
            await self._send_text(chat_key, event, segment, is_group)
            if index < len(segments) - 1:
                await asyncio.sleep(message_delay(self.config))

    async def _send_text(
        self,
        chat_key: str,
        event: Any,
        text: str,
        is_group: bool,
    ) -> None:
        if self._is_dry_run():
            self.sent.append((chat_key, text))
            logger.info("演示模式：向 %s 发送：%s", chat_key, text)
            return
        reply = getattr(event, "reply", None)
        if reply is None:
            self.sent.append((chat_key, text))
            return
        if is_group:
            await reply(text=text, at=False)
        else:
            await reply(text=text)

    async def _on_private_message(self, event: Any) -> None:
        await self.handle_qq_event(event)

    async def _on_group_message(self, event: Any) -> None:
        await self.handle_qq_event(event)

    def _run_client(self) -> None:
        try:
            self.client.run_backend(
                bt_uin=self._bot_qq(),
                root=self._bot_qq(),
                ws_uri=self._ws_url(),
                ws_token="",
                ws_listen_ip="127.0.0.1",
                enable_webui=False,
                remote_mode=False,
                debug=False,
            )
        except Exception as exc:
            logger.error("QQ 客户端启动失败：%s", exc)

    def _register_handlers(self) -> None:
        if self._handlers_registered:
            return
        self.client.add_private_message_handler(self._on_private_message)
        self.client.add_group_message_handler(self._on_group_message)
        self._handlers_registered = True

    @staticmethod
    def _new_bot_client() -> Any:
        saved_log_format = os.environ.get("LOG_FORMAT")
        os.environ["LOG_FORMAT"] = "[%(asctime)s] %(levelname)s %(name)s: %(message)s"
        try:
            from ncatbot.core.client import BotClient

            return BotClient()
        finally:
            if saved_log_format is None:
                os.environ.pop("LOG_FORMAT", None)
            else:
                os.environ["LOG_FORMAT"] = saved_log_format

    @staticmethod
    def _event_text(event: Any) -> str:
        message = getattr(event, "message", None)
        if hasattr(message, "concatenate_text"):
            return (message.concatenate_text() or "").strip()
        if isinstance(message, str):
            return message.strip()
        if isinstance(message, dict):
            return str(message.get("raw_message") or message.get("text") or "").strip()
        return str(message or "").strip()

    def _is_mention(self, event: Any) -> bool:
        message = getattr(event, "message", None)
        if hasattr(message, "is_user_at") and message.is_user_at(self._bot_qq()):
            return True
        items: list[Any] = []
        if hasattr(message, "messages"):
            items = list(message.messages)
        elif isinstance(message, (list, tuple)):
            items = list(message)
        elif isinstance(message, dict):
            raw = message.get("message")
            if isinstance(raw, (list, tuple)):
                items = list(raw)
        for item in items:
            if type(item).__name__ == "Reply":
                return True
            if isinstance(item, dict) and str(item.get("type", "")).lower() == "reply":
                return True
        return False

    def _is_allowed_private(self, user_id: str) -> bool:
        if not self._bool_config("qq_reply_private", True, "QQ_REPLY_PRIVATE"):
            return False
        allowed = self._allowed_users()
        return bool(allowed) and user_id in allowed

    def _is_allowed_group(self, group_id: str) -> bool:
        allowed = self._allowed_groups()
        return bool(allowed) and group_id in allowed

    def _should_reply_group(self, is_mention: bool) -> bool:
        if self._bool_config("qq_reply_group_all", False, "QQ_REPLY_GROUP_ALL"):
            return True
        mention_enabled = self._bool_config(
            "qq_reply_group_mention", True, "QQ_REPLY_GROUP_MENTION"
        )
        return mention_enabled and is_mention

    def _is_enabled(self) -> bool:
        return self._bool_config("qq_enabled", False, "QQ_ENABLED")

    def _is_dry_run(self) -> bool:
        return self._bool_config("qq_dry_run", True, "QQ_DRY_RUN")

    def _bool_config(self, attr: str, default: bool, env_key: str) -> bool:
        if self.config is not None and hasattr(self.config, attr):
            return bool(getattr(self.config, attr))
        raw = os.getenv(env_key, "").strip().lower()
        if raw in ("1", "true", "yes", "on"):
            return True
        if raw in ("0", "false", "no", "off"):
            return False
        return default

    def _bot_qq(self) -> str:
        value = getattr(self.config, "qq_bot_qq", "") if self.config is not None else ""
        return str(value or os.getenv("QQ_BOT_QQ", "")).strip()

    def _ws_url(self) -> str:
        value = getattr(self.config, "qq_ws_url", "") if self.config is not None else ""
        return str(value or os.getenv("QQ_WS_URL", "ws://127.0.0.1:3001")).strip()

    def _allowed_users(self) -> set[str]:
        return self._split_config("qq_allowed_users", "QQ_ALLOWED_USERS")

    def _allowed_groups(self) -> set[str]:
        return self._split_config("qq_allowed_groups", "QQ_ALLOWED_GROUPS")

    def _split_config(self, attr: str, env_key: str) -> set[str]:
        raw = ""
        if self.config is not None and hasattr(self.config, attr):
            raw = str(getattr(self.config, attr) or "")
        else:
            raw = os.getenv(env_key, "")
        return {item.strip() for item in raw.split(",") if item.strip()}
