from __future__ import annotations

import asyncio
import threading
from typing import Any, Awaitable, Callable

EVENT_TYPES = (
    "user_message",
    "emotion_changed",
    "memory_updated",
    "content_ready",
    "publish_requested",
    "publish_finished",
    "llm_call",
)

Subscriber = Callable[[dict[str, Any]], Awaitable[None]]


class AgentBus:
    """线程安全的事件总线，事件结构为 {"type": str, "payload": dict}。"""

    def __init__(self) -> None:
        self._subscribers: dict[str, list[Subscriber]] = {}
        self._lock = threading.RLock()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._inflight: dict[Any, dict[str, Any]] = {}

    @property
    def loop(self) -> asyncio.AbstractEventLoop | None:
        with self._lock:
            return self._loop

    def attach_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        with self._lock:
            self._loop = loop

    def clear_loop(self) -> None:
        with self._lock:
            self._loop = None

    def subscribe(self, event_type: str, callback: Subscriber) -> None:
        self._validate_type(event_type)
        with self._lock:
            callbacks = self._subscribers.setdefault(event_type, [])
            if callback not in callbacks:
                callbacks.append(callback)

    def unsubscribe(self, event_type: str, callback: Subscriber) -> None:
        self._validate_type(event_type)
        with self._lock:
            callbacks = self._subscribers.get(event_type)
            if callbacks and callback in callbacks:
                callbacks.remove(callback)

    def publish(self, event_type: str, payload: dict[str, Any] | None = None) -> None:
        """线程安全地发布事件，调度订阅者异步执行。"""
        event = {"type": event_type, "payload": dict(payload or {})}
        self._validate_type(event_type)
        with self._lock:
            callbacks = list(self._subscribers.get(event_type, ()))
        if not callbacks:
            return
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        loop = running or self.loop
        if loop is None or loop.is_closed():
            raise RuntimeError("AgentBus 尚未绑定可运行的事件循环")
        for callback in callbacks:
            if running is not None and running is loop:
                task = loop.create_task(callback(event))
            else:
                future = asyncio.run_coroutine_threadsafe(callback(event), loop)
                task = asyncio.wrap_future(future, loop=loop)
            with self._lock:
                self._inflight[task] = event
            task.add_done_callback(self._forget)

    async def apublish(self, event_type: str, payload: dict[str, Any] | None = None) -> None:
        """在当前协程内等待所有订阅者处理完毕。"""
        event = {"type": event_type, "payload": dict(payload or {})}
        self._validate_type(event_type)
        with self._lock:
            callbacks = list(self._subscribers.get(event_type, ()))
        for callback in callbacks:
            await callback(event)

    def inflight(self) -> list[tuple[Any, dict[str, Any]]]:
        with self._lock:
            return list(self._inflight.items())

    def _forget(self, task: Any) -> None:
        with self._lock:
            self._inflight.pop(task, None)

    def _validate_type(self, event_type: str) -> None:
        if event_type not in EVENT_TYPES:
            raise ValueError(f"未知事件类型：{event_type}")
