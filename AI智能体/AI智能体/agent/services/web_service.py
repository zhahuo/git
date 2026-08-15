from __future__ import annotations

import asyncio
import os
from typing import Any

from ..module import Module
from ..tools import ToolRegistry


class WebService(Module):
    """包装搜索和网页读取能力，并定时把关注词摘要发布到事件总线。"""

    name = "web_service"

    def __init__(
        self,
        config: Any = None,
        bus: Any = None,
        registry: ToolRegistry | None = None,
        refresh_minutes: float | None = None,
        watch_queries: list[str] | None = None,
    ) -> None:
        super().__init__(config, bus)
        provider = "dry_run"
        api_key = ""
        if config is not None:
            provider = getattr(config, "search_provider", "dry_run") or "dry_run"
            api_key = getattr(config, "search_api_key", "") or ""
        self.registry = registry or ToolRegistry(
            search_provider=provider,
            search_api_key=api_key,
        )
        self.refresh_minutes = refresh_minutes
        self.watch_queries = watch_queries
        self._poll_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        await super().start()
        queries = self._resolve_queries()
        if queries and self.bus is not None:
            self._poll_task = asyncio.create_task(self._poll_loop(queries))

    async def stop(self) -> None:
        self.running = False
        task = self._poll_task
        self._poll_task = None
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        await super().stop()

    async def handle(self, event: dict[str, Any]) -> None:
        return None

    def search(self, query: str, max_results: int = 5) -> str:
        """搜索互联网；未配置搜索服务时返回演示结果，不访问网络。"""
        return self.registry.run(
            "web_search",
            {"query": query, "max_results": max_results},
        )

    def fetch(self, url: str, max_chars: int = 4000) -> str:
        """读取网页正文文字。"""
        return self.registry.run(
            "fetch_url",
            {"url": url, "max_chars": max_chars},
        )

    async def _poll_loop(self, queries: list[str]) -> None:
        while self.running:
            await self._refresh_once(queries)
            await asyncio.sleep(self._poll_interval())

    async def _refresh_once(self, queries: list[str]) -> None:
        bus = self.bus
        if bus is None:
            return
        for query in queries:
            try:
                summary = await asyncio.to_thread(self.search, query)
            except Exception as exc:
                summary = f"搜索失败：{exc}"
            await bus.apublish(
                "content_ready",
                {
                    "user_key": "_agent",
                    "source": self.name,
                    "query": query,
                    "summary": summary,
                },
            )

    def _poll_interval(self) -> float:
        if self.refresh_minutes is not None:
            return max(0.0, float(self.refresh_minutes)) * 60
        raw = os.getenv("WEB_REFRESH_MINUTES", "60")
        try:
            minutes = max(0.0, float(raw))
        except ValueError:
            minutes = 60.0
        return minutes * 60

    def _resolve_queries(self) -> list[str]:
        if self.watch_queries is not None:
            parts = self.watch_queries
        else:
            parts = os.getenv("WEB_WATCH_QUERIES", "").split(",")
        return [str(part).strip() for part in parts if str(part).strip()]
