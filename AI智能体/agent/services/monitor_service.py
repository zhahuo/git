from __future__ import annotations

import asyncio
import logging
import sqlite3
from pathlib import Path
from typing import Any

from ..bus import AgentBus
from ..config import AgentConfig
from ..module import Module
from ..monitor import MonitorStore

logger = logging.getLogger(__name__)

DEFAULT_HEARTBEAT_INTERVAL = 60.0
DEFAULT_CLEANUP_DAYS = 30


class MonitorService(Module):
    """订阅运行事件并把监控数据写入 SQLite，同时周期刷新心跳与内存统计。"""

    name = "monitor"

    def __init__(
        self,
        config: AgentConfig | None = None,
        bus: AgentBus | None = None,
        store: MonitorStore | None = None,
        heartbeat_interval: float = DEFAULT_HEARTBEAT_INTERVAL,
        cleanup_days: int = DEFAULT_CLEANUP_DAYS,
    ) -> None:
        super().__init__(config, bus)
        self.store = store
        self._owns_store = store is None
        self.heartbeat_interval = max(0.0, float(heartbeat_interval))
        self.cleanup_days = max(0, int(cleanup_days))
        self._background_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        if self.running:
            return
        if self.bus is None:
            raise RuntimeError("MonitorService 需要绑定 AgentBus")
        self._ensure_store()
        self.bus.subscribe("user_message", self.handle)
        self.bus.subscribe("emotion_changed", self.handle)
        self.bus.subscribe("publish_finished", self.handle)
        self.bus.subscribe("llm_call", self.handle)
        await super().start()
        self._background_task = asyncio.create_task(
            self._background_loop(),
            name=f"{self.name}-background",
        )

    async def stop(self) -> None:
        if not self.running:
            return
        self.running = False
        task = self._background_task
        self._background_task = None
        if task is not None:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        if self.bus is not None:
            self.bus.unsubscribe("user_message", self.handle)
            self.bus.unsubscribe("emotion_changed", self.handle)
            self.bus.unsubscribe("publish_finished", self.handle)
            self.bus.unsubscribe("llm_call", self.handle)
        if self._owns_store and self.store is not None:
            self.store.close()
            self.store = None
        await super().stop()

    async def handle(self, event: dict[str, Any]) -> None:
        event_type = event.get("type")
        if event_type == "user_message":
            await self._on_user_message(event)
        elif event_type == "emotion_changed":
            await self._on_emotion_changed(event)
        elif event_type == "publish_finished":
            await self._on_publish_finished(event)
        elif event_type == "llm_call":
            await self._on_llm_call(event)

    async def cleanup(self) -> int:
        return self._ensure_store().cleanup(self.cleanup_days)

    async def _on_user_message(self, event: dict[str, Any]) -> None:
        payload = event.get("payload") or {}
        message = str(payload.get("message") or "").strip()
        if not message:
            return
        self._ensure_store().record_conversation(
            str(payload.get("user_key") or "_agent"),
            str(payload.get("role") or "user"),
            message,
        )

    async def _on_emotion_changed(self, event: dict[str, Any]) -> None:
        payload = event.get("payload") or {}
        self._ensure_store().record_emotion(
            str(payload.get("mood") or "平静"),
            self._float_value(payload.get("valence")),
            self._float_value(payload.get("arousal")),
            self._float_value(payload.get("dominance")),
        )

    async def _on_publish_finished(self, event: dict[str, Any]) -> None:
        payload = event.get("payload") or {}
        self._ensure_store().record_publish(
            str(payload.get("platform") or ""),
            str(payload.get("title") or ""),
            str(payload.get("status") or ""),
        )

    async def _on_llm_call(self, event: dict[str, Any]) -> None:
        payload = event.get("payload") or {}
        self._ensure_store().record_llm(
            str(payload.get("model") or ""),
            self._int_value(payload.get("prompt_tokens")),
            self._int_value(payload.get("completion_tokens")),
            self._int_value(payload.get("total_tokens")),
            self._int_value(payload.get("latency_ms")),
            ok=bool(payload.get("ok", True)),
        )

    async def _background_loop(self) -> None:
        while self.running:
            try:
                await asyncio.sleep(self.heartbeat_interval)
            except asyncio.CancelledError:
                break
            if not self.running:
                break
            try:
                store = self._ensure_store()
                store.heartbeat(self.name, "running")
                counts = self._memory_counts()
                store.snapshot_memory(
                    counts["facts"],
                    counts["episodes"],
                    counts["conversations"],
                )
                store.cleanup(self.cleanup_days)
            except Exception:
                logger.exception("监控后台任务执行失败")

    def _memory_counts(self) -> dict[str, int]:
        if self.config is None:
            return {"facts": 0, "episodes": 0, "conversations": 0}
        db_path = Path(self.config.data_dir) / "memory.db"
        conn: sqlite3.Connection | None = None
        try:
            conn = sqlite3.connect(str(db_path))
            return {
                "facts": self._count_rows(conn, "facts"),
                "episodes": self._count_rows(conn, "episodes"),
                "conversations": self._count_rows(conn, "conversations"),
            }
        except sqlite3.Error:
            logger.warning("读取记忆统计失败：%s", db_path, exc_info=True)
            return {"facts": 0, "episodes": 0, "conversations": 0}
        finally:
            if conn is not None:
                conn.close()

    def _ensure_store(self) -> MonitorStore:
        if self.store is None:
            if self.config is None:
                raise RuntimeError("MonitorService 需要 config 或 store")
            self.store = MonitorStore(self.config.data_dir / "monitor.db")
            self._owns_store = True
        return self.store

    @staticmethod
    def _count_rows(conn: sqlite3.Connection, table: str) -> int:
        try:
            return int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
        except sqlite3.Error:
            return 0

    @staticmethod
    def _int_value(value: Any) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return 0

    @staticmethod
    def _float_value(value: Any) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0
