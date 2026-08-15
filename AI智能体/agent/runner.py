from __future__ import annotations

import asyncio
from typing import Any

from .bus import EVENT_TYPES, AgentBus
from .config import AgentConfig
from .module import Module


class ModuleRunner:
    """asyncio 多模块运行器，负责启动/停止模块并跟踪未完成任务。"""

    def __init__(
        self,
        config: AgentConfig,
        modules: list[Module] | None = None,
        graceful_timeout: float = 5.0,
    ) -> None:
        self.config = config
        self.bus = AgentBus()
        self.modules: list[Module] = []
        self.graceful_timeout = graceful_timeout
        self._pending: asyncio.Queue[dict[str, Any]] | None = None
        self._running = False
        if modules is None:
            from .modules import build_default_modules

            modules = build_default_modules(config)
        for module in modules:
            self.add_module(module)

    def add_module(self, module: Module) -> None:
        if module.name in (existing.name for existing in self.modules):
            raise ValueError(f"重复模块：{module.name}")
        module.config = self.config
        module.bus = self.bus
        self.modules.append(module)

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._pending = asyncio.Queue()
        self.bus.attach_loop(asyncio.get_running_loop())
        for module in self.modules:
            for event_type in EVENT_TYPES:
                self.bus.subscribe(event_type, module.handle)
        for module in self.modules:
            await module.start()

    async def stop(self) -> None:
        if not self._running:
            return
        for module in reversed(self.modules):
            await module.stop()
        inflight = self.bus.inflight()
        if inflight:
            tasks = [task for task, _ in inflight]
            _, pending = await asyncio.wait(tasks, timeout=self.graceful_timeout)
            events_by_task = dict(inflight)
            for task in pending:
                task.cancel()
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass
                event = events_by_task.get(task)
                if event is not None and self._pending is not None:
                    await self._pending.put(event)
        for module in self.modules:
            for event_type in EVENT_TYPES:
                self.bus.unsubscribe(event_type, module.handle)
        self.bus.clear_loop()
        self._running = False

    async def wait_idle(self, timeout: float | None = None) -> None:
        tasks = [task for task, _ in self.bus.inflight()]
        if tasks:
            await asyncio.wait(tasks, timeout=timeout)

    async def drain_pending(self) -> list[dict[str, Any]]:
        queue = self._pending
        if queue is None:
            return []
        events: list[dict[str, Any]] = []
        while True:
            try:
                events.append(queue.get_nowait())
            except asyncio.QueueEmpty:
                break
        return events

    @property
    def pending_size(self) -> int:
        queue = self._pending
        return queue.qsize() if queue is not None else 0

    async def __aenter__(self) -> "ModuleRunner":
        await self.start()
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.stop()
