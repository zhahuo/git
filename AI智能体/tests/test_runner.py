from __future__ import annotations

import asyncio
import unittest

from agent.config import AgentConfig
from agent.module import Module
from agent.runner import ModuleRunner


class RecordingModule(Module):
    name = "recorder"

    def __init__(self, name: str | None = None) -> None:
        super().__init__()
        if name:
            self.name = name
        self.started = False
        self.stopped = False
        self.events: list[dict] = []

    async def start(self) -> None:
        await super().start()
        self.started = True

    async def stop(self) -> None:
        self.stopped = True
        await super().stop()

    async def handle(self, event: dict) -> None:
        self.events.append(event)


class SlowModule(Module):
    name = "slow"

    async def handle(self, event: dict) -> None:
        await asyncio.sleep(0.5)


class ModuleRunnerTests(unittest.IsolatedAsyncioTestCase):
    async def test_start_and_stop_modules(self) -> None:
        config = AgentConfig()
        module = RecordingModule()
        runner = ModuleRunner(config, modules=[module])
        await runner.start()
        self.assertTrue(module.started)
        self.assertIs(module.config, config)
        self.assertIs(module.bus, runner.bus)
        await runner.stop()
        self.assertTrue(module.stopped)

    async def test_duplicate_module_rejected(self) -> None:
        config = AgentConfig()
        runner = ModuleRunner(config)
        with self.assertRaises(ValueError):
            runner.add_module(RecordingModule())
            runner.add_module(RecordingModule())

    async def test_event_dispatched_to_modules(self) -> None:
        config = AgentConfig()
        first = RecordingModule("first")
        second = RecordingModule("second")
        runner = ModuleRunner(config, modules=[first, second])
        await runner.start()
        await runner.bus.apublish("content_ready", {"reply": "你好"})
        self.assertEqual(len(first.events), 1)
        self.assertEqual(len(second.events), 1)
        self.assertEqual(first.events[0]["payload"]["reply"], "你好")
        await runner.stop()

    async def test_unfinished_event_written_to_pending_queue(self) -> None:
        config = AgentConfig()
        slow = SlowModule()
        runner = ModuleRunner(config, modules=[slow], graceful_timeout=0.05)
        await runner.start()
        runner.bus.publish("memory_updated", {"action": "exchange"})
        await asyncio.sleep(0.02)
        await runner.stop()
        pending = await runner.drain_pending()
        self.assertTrue(
            any(event["payload"].get("action") == "exchange" for event in pending)
        )


if __name__ == "__main__":
    unittest.main()
