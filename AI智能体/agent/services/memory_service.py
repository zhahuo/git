from __future__ import annotations

import asyncio
import logging
import os
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from typing import Any

from ..bus import AgentBus
from ..config import AgentConfig
from ..memory import MemoryItem, MemoryStore
from ..module import Module

logger = logging.getLogger(__name__)

COMPACT_INTERVAL_SECONDS = 6 * 60 * 60
COMPACT_DEFAULT_DAYS = 30
COMPACT_SUMMARY_MAX_CHARS = 2000
RECALL_CACHE_SIZE = 256


class MemoryService(Module):
    """记忆服务：落库对话与情绪、刷新召回缓存并定时压缩记忆。"""

    name = "memory_service"

    def __init__(
        self,
        config: AgentConfig | None = None,
        bus: AgentBus | None = None,
        store: MemoryStore | None = None,
        compaction_interval: float = COMPACT_INTERVAL_SECONDS,
        compact_after_days: int | None = None,
        summary_max_chars: int = COMPACT_SUMMARY_MAX_CHARS,
        recall_cache_size: int = RECALL_CACHE_SIZE,
    ) -> None:
        super().__init__(config, bus)
        self.store = store
        self._owns_store = store is None
        self.compaction_interval = max(0.0, float(compaction_interval))
        if compact_after_days is None:
            raw_days = os.getenv("MEMORY_COMPACT_DAYS", str(COMPACT_DEFAULT_DAYS))
            compact_after_days = (
                int(raw_days) if str(raw_days).strip().isdigit() else COMPACT_DEFAULT_DAYS
            )
        self.compact_after_days = max(0, int(compact_after_days))
        self.summary_max_chars = max(1, int(summary_max_chars))
        self._recall_cache_size = max(1, int(recall_cache_size))
        self._compaction_task: asyncio.Task[None] | None = None
        self._recall_cache: OrderedDict[str, list[MemoryItem]] = OrderedDict()

    async def start(self) -> None:
        if self.running:
            return
        if self.bus is None:
            raise RuntimeError("MemoryService 需要绑定 AgentBus")
        self._ensure_store()
        self.bus.subscribe("user_message", self.handle)
        self.bus.subscribe("memory_updated", self.handle)
        await super().start()
        self._compaction_task = asyncio.create_task(
            self._compaction_loop(),
            name=f"{self.name}-compaction",
        )

    async def stop(self) -> None:
        self.running = False
        task = self._compaction_task
        self._compaction_task = None
        if task is not None:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        if self.bus is not None:
            self.bus.unsubscribe("user_message", self.handle)
            self.bus.unsubscribe("memory_updated", self.handle)
        if self._owns_store and self.store is not None:
            self.store.close()
            self.store = None
        self._recall_cache.clear()
        await super().stop()

    async def handle(self, event: dict[str, Any]) -> None:
        event_type = event.get("type")
        if event_type == "user_message":
            await self._on_user_message(event)
        elif event_type == "memory_updated":
            await self._on_memory_updated(event)

    def recall(self, user_key: str, query: str, limit: int = 8) -> list[MemoryItem]:
        """带缓存的召回接口，供其他模块调用。"""
        limit = max(1, int(limit))
        cache_key = f"{user_key}\0{query}\0{limit}"
        if cache_key in self._recall_cache:
            return list(self._recall_cache[cache_key])
        items = self._ensure_store().recall(user_key, query, limit=limit)
        self._recall_cache[cache_key] = items
        self._recall_cache.move_to_end(cache_key)
        while len(self._recall_cache) > self._recall_cache_size:
            self._recall_cache.popitem(last=False)
        return list(items)

    async def compact(
        self,
        before_days: int | None = None,
        max_chars: int | None = None,
    ) -> dict[str, int]:
        """按用户压缩旧对话：写入摘要事实、删除旧对话、清理重复事实。"""
        store = self._ensure_store()
        days = (
            self.compact_after_days
            if before_days is None
            else max(0, int(before_days))
        )
        chars = (
            self.summary_max_chars
            if max_chars is None
            else max(1, int(max_chars))
        )
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat(
            timespec="seconds"
        )
        result = {
            "users": 0,
            "summarized": 0,
            "deleted": 0,
            "duplicates_removed": 0,
        }
        for user_key in store.conversation_users():
            rows = store.conversations_before(user_key, cutoff)
            if not rows:
                continue
            summary = "\n".join(
                f"{row['role']}: {row['content']}" for row in rows
            )[:chars]
            if summary:
                store.remember_fact(
                    user_key,
                    f"对话摘要：{summary}",
                    category="对话摘要",
                    confidence=0.6,
                )
                result["summarized"] += 1
            result["deleted"] += store.delete_conversations_before(user_key, cutoff)
            result["users"] += 1
            self._invalidate_cache(user_key)
        result["duplicates_removed"] = store.dedupe_facts()
        return result

    async def _on_user_message(self, event: dict[str, Any]) -> None:
        store = self._ensure_store()
        payload = event.get("payload") or {}
        user_key = str(payload.get("user_key") or "_agent")
        message = str(payload.get("message") or "").strip()
        role = str(payload.get("role") or "user")
        if payload.get("persisted") is True:
            self._invalidate_cache(user_key)
            return
        if message:
            store.save_exchange(user_key, role, message)

        emotion = payload.get("emotion") or {}
        if not isinstance(emotion, dict):
            emotion = {}
        emotion_fields = (
            "valence",
            "arousal",
            "dominance",
            "mood",
            "event",
            "emotion_event",
        )
        has_emotion = any(
            key in payload or key in emotion for key in emotion_fields
        )
        if message or has_emotion:
            store.log_emotion(
                user_key,
                self._float_value(
                    payload.get("valence", emotion.get("valence")), 0.0
                ),
                self._float_value(
                    payload.get("arousal", emotion.get("arousal")), 0.0
                ),
                self._float_value(
                    payload.get("dominance", emotion.get("dominance")), 0.0
                ),
                str(payload.get("mood") or emotion.get("mood") or "平静"),
                str(
                    payload.get("event")
                    or emotion.get("event")
                    or payload.get("emotion_event")
                    or "user_message"
                ),
            )
        self._invalidate_cache(user_key)

    async def _on_memory_updated(self, event: dict[str, Any]) -> None:
        store = self._ensure_store()
        payload = event.get("payload") or {}
        user_key = str(payload.get("user_key") or "_agent")
        content = str(payload.get("content") or "").strip()
        if content:
            store.remember_fact(
                user_key,
                content,
                category=str(payload.get("category") or "general"),
                confidence=self._float_value(payload.get("confidence"), 0.8),
            )
        self._invalidate_cache(user_key)

    async def _compaction_loop(self) -> None:
        while self.running:
            try:
                await asyncio.sleep(self.compaction_interval)
            except asyncio.CancelledError:
                break
            if not self.running:
                break
            try:
                await self.compact()
            except Exception:
                logger.exception("记忆压缩任务执行失败")

    def _ensure_store(self) -> MemoryStore:
        if self.store is None:
            if self.config is None:
                raise RuntimeError("MemoryService 需要 config 或 store")
            self.store = MemoryStore(self.config.data_dir / "memory.db")
            self._owns_store = True
        return self.store

    def _invalidate_cache(self, user_key: str) -> None:
        prefix = f"{user_key}\0"
        stale = [key for key in self._recall_cache if key.startswith(prefix)]
        for key in stale:
            del self._recall_cache[key]

    @staticmethod
    def _float_value(value: Any, default: float) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return default
