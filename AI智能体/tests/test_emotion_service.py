from __future__ import annotations

import asyncio
import unittest

from agent.bus import AgentBus
from agent.config import AgentConfig
from agent.emotion import EmotionState
from agent.runner import ModuleRunner
from agent.services.emotion_service import EmotionService


class EmotionServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.bus = AgentBus()
        self.service = EmotionService(bus=self.bus, decay_interval=60.0)
        await self.service.start()

    async def asyncTearDown(self) -> None:
        await self.service.stop()

    async def test_user_message_updates_emotion_and_publishes_event(self) -> None:
        events: list[dict] = []

        async def listener(event: dict) -> None:
            events.append(event)

        self.bus.subscribe("emotion_changed", listener)
        await self.bus.apublish(
            "user_message", {"user_key": "u1", "message": "今天真的很开心"}
        )

        state = self.service.state_for("u1")
        self.assertGreater(state.valence, state.baseline_valence)
        self.assertEqual(len(events), 1)
        payload = events[0]["payload"]
        self.assertEqual(payload["user_key"], "u1")
        self.assertIn(payload["event"], {"positive", "joy"})
        self.assertEqual(payload["valence"], state.valence)
        self.assertEqual(payload["mood"], state.mood_label())

    async def test_decay_task_runs_periodically(self) -> None:
        service = EmotionService(bus=AgentBus(), decay_interval=0.02)
        await service.start()
        try:
            await service.bus.apublish(
                "user_message", {"user_key": "u1", "message": "我真的太开心了"}
            )
            state = service.state_for("u1")
            before = state.valence
            self.assertGreater(before, state.baseline_valence)

            await asyncio.sleep(0.1)

            self.assertLess(state.valence, before)
            self.assertGreater(state.valence, state.baseline_valence)
        finally:
            await service.stop()

    async def test_mood_report_returns_current_and_recent_history(self) -> None:
        await self.bus.apublish(
            "user_message", {"user_key": "u1", "message": "今天很开心"}
        )

        report = self.service.mood_report("u1")

        self.assertEqual(report["user_key"], "u1")
        self.assertEqual(
            report["current"]["mood"], self.service.state_for("u1").mood_label()
        )
        self.assertGreaterEqual(len(report["history"]), 1)
        entry = report["history"][-1]
        self.assertIn(entry["event"], {"positive", "joy"})
        self.assertIn("valence", entry)

        unknown = self.service.mood_report("u2")
        self.assertEqual(unknown["current"]["valence"], EmotionState().valence)
        self.assertEqual(unknown["history"], [])

    async def test_runner_dispatches_user_message_once(self) -> None:
        runner = ModuleRunner(AgentConfig(), modules=[])
        service = EmotionService(decay_interval=60.0)
        runner.add_module(service)
        await runner.start()
        try:
            events: list[dict] = []

            async def listener(event: dict) -> None:
                events.append(event)

            runner.bus.subscribe("emotion_changed", listener)
            await runner.bus.apublish(
                "user_message", {"user_key": "u1", "message": "今天很开心"}
            )

            self.assertEqual(len(events), 1)
        finally:
            await runner.stop()


if __name__ == "__main__":
    unittest.main()
