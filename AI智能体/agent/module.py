from __future__ import annotations

from typing import Any


class Module:
    """异步模块基类，所有智能体模块都从这里继承。"""

    name: str = "module"

    def __init__(self, config: Any = None, bus: Any = None) -> None:
        self.config = config
        self.bus = bus
        self.running = False

    async def start(self) -> None:
        self.running = True

    async def stop(self) -> None:
        self.running = False

    async def handle(self, event: dict[str, Any]) -> None:
        raise NotImplementedError(f"{type(self).__name__} 未实现 handle()")
