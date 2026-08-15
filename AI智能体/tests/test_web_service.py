from __future__ import annotations

import asyncio
import unittest
from unittest.mock import patch

from agent.bus import AgentBus
from agent.services.web_service import WebService


class FakeRegistry:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []

    def run(self, name: str, arguments: dict) -> str:
        self.calls.append((name, arguments))
        if name == "web_search":
            return "fake search result"
        return "fake page text"


async def _record(event: dict, events: list[dict]) -> None:
    events.append(event)


class WebServiceTests(unittest.IsolatedAsyncioTestCase):
    def test_search_dry_run(self) -> None:
        service = WebService()
        result = service.search("今天天气")
        self.assertIn("演示", result)
        self.assertIn("今天天气", result)

    def test_search_and_fetch_delegate_to_registry(self) -> None:
        registry = FakeRegistry()
        service = WebService(registry=registry)
        self.assertEqual(service.search("天气", 3), "fake search result")
        self.assertEqual(
            service.fetch("https://example.com"),
            "fake page text",
        )
        self.assertEqual(
            registry.calls,
            [
                ("web_search", {"query": "天气", "max_results": 3}),
                ("fetch_url", {"url": "https://example.com", "max_chars": 4000}),
            ],
        )

    async def test_start_publishes_content_ready(self) -> None:
        bus = AgentBus()
        events: list[dict] = []
        done = asyncio.Event()

        async def listener(event: dict) -> None:
            events.append(event)
            if len(events) >= 2:
                done.set()

        bus.subscribe("content_ready", listener)
        service = WebService(
            bus=bus,
            watch_queries=["AI 新闻", "天气"],
            refresh_minutes=0.001,
        )
        await service.start()
        try:
            await asyncio.wait_for(done.wait(), timeout=5)
        finally:
            await service.stop()

        self.assertFalse(service.running)
        self.assertTrue(events)
        self.assertTrue(all(event["type"] == "content_ready" for event in events))
        payloads = [event["payload"] for event in events]
        self.assertTrue(any(payload["query"] == "AI 新闻" for payload in payloads))
        self.assertTrue(any(payload["query"] == "天气" for payload in payloads))
        self.assertIn("演示", payloads[0]["summary"])

    async def test_unconfigured_polling_does_not_touch_network(self) -> None:
        bus = AgentBus()
        events: list[dict] = []
        done = asyncio.Event()

        async def listener(event: dict) -> None:
            events.append(event)
            done.set()

        bus.subscribe("content_ready", listener)
        with patch(
            "urllib.request.urlopen",
            side_effect=RuntimeError("网络不可用"),
        ):
            service = WebService(
                bus=bus,
                watch_queries=["本地资讯"],
                refresh_minutes=0.001,
            )
            await service.start()
            try:
                await asyncio.wait_for(done.wait(), timeout=5)
            finally:
                await service.stop()

        self.assertEqual(events[0]["payload"]["query"], "本地资讯")
        self.assertEqual(events[0]["payload"]["source"], "web_service")
        self.assertIn("演示", events[0]["payload"]["summary"])

    async def test_stop_prevents_further_polls(self) -> None:
        bus = AgentBus()
        events: list[dict] = []
        bus.subscribe("content_ready", lambda event: _record(event, events))
        service = WebService(
            bus=bus,
            watch_queries=["新闻"],
            refresh_minutes=0.001,
        )
        await service.start()
        await asyncio.sleep(0.02)
        await service.stop()
        count = len(events)
        await asyncio.sleep(0.02)
        self.assertEqual(len(events), count)


if __name__ == "__main__":
    unittest.main()
