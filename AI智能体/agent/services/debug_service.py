from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any

from ..bus import EVENT_TYPES, AgentBus
from ..config import AgentConfig
from ..module import Module
from ..monitor import MonitorStore

logger = logging.getLogger(__name__)

DEFAULT_STATUS_INTERVAL = 15.0


class StoreLogHandler(logging.Handler):
    """把 Python logging 记录写入 MonitorStore。"""

    def __init__(self, store: MonitorStore) -> None:
        super().__init__(level=logging.DEBUG)
        self.store = store

    def emit(self, record: logging.LogRecord) -> None:
        try:
            self.store.record_log(
                record.levelname,
                record.name,
                record.getMessage(),
            )
        except Exception:
            pass


class DebugService(Module):
    """调试服务：记录日志、总线事件和模块运行状态。"""

    name = "debug"

    def __init__(
        self,
        config: AgentConfig | None = None,
        bus: AgentBus | None = None,
        store: MonitorStore | None = None,
        modules: list[Module] | None = None,
        status_interval: float = DEFAULT_STATUS_INTERVAL,
    ) -> None:
        super().__init__(config, bus)
        self.modules = list(modules or [])
        self.store = store
        self._owns_store = store is None
        self.status_interval = max(0.0, float(status_interval))
        self._handler: StoreLogHandler | None = None
        self._background_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        if self.running:
            return
        store = self._ensure_store()
        self._handler = StoreLogHandler(store)
        logging.getLogger().addHandler(self._handler)
        if self.bus is not None:
            for event_type in EVENT_TYPES:
                self.bus.subscribe(event_type, self.handle)
        await super().start()
        store.upsert_module_status(self.name, "running", type(self).__name__)
        for module in self._all_modules():
            status = "running" if getattr(module, "running", False) else "stopped"
            store.upsert_module_status(
                module.name,
                status,
                type(module).__name__,
            )
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
        handler = self._handler
        self._handler = None
        if handler is not None:
            logging.getLogger().removeHandler(handler)
        if self.bus is not None:
            for event_type in EVENT_TYPES:
                self.bus.unsubscribe(event_type, self.handle)
        store = self.store
        if store is not None:
            for module in self._all_modules():
                store.upsert_module_status(
                    module.name,
                    "stopped",
                    type(module).__name__,
                )
        if self._owns_store and store is not None:
            store.close()
            self.store = None
        await super().stop()

    async def handle(self, event: dict[str, Any]) -> None:
        event_type = event.get("type")
        if not event_type:
            return
        self._ensure_store().record_event(
            str(event_type),
            event.get("payload") or {},
        )

    async def _background_loop(self) -> None:
        while self.running:
            try:
                await asyncio.sleep(self.status_interval)
            except asyncio.CancelledError:
                break
            if not self.running:
                break
            try:
                store = self._ensure_store()
                for module in self._all_modules():
                    status = (
                        "running" if getattr(module, "running", False) else "stopped"
                    )
                    store.upsert_module_status(
                        module.name,
                        status,
                        type(module).__name__,
                    )
            except Exception:
                logger.exception("调试服务状态刷新失败")

    def _all_modules(self) -> list[Module]:
        modules = [module for module in self.modules if module is not self]
        return modules + [self]

    def _ensure_store(self) -> MonitorStore:
        if self.store is None:
            if self.config is None:
                raise RuntimeError("DebugService 需要 config 或 store")
            self.store = MonitorStore(Path(self.config.data_dir) / "monitor.db")
            self._owns_store = True
        return self.store
