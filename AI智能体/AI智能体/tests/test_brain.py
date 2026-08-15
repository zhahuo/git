from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from agent.brain import AgentBrain
from agent.bus import AgentBus
from agent.config import AgentConfig


class AgentBrainTests(unittest.IsolatedAsyncioTestCase):
    async def test_handle_message_publishes_events(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config = AgentConfig(data_dir=Path(tmp))
            bus = AgentBus()
            events: list[dict] = []

            async def listener(event: dict) -> None:
                events.append(event)

            for event_type in ("emotion_changed", "memory_updated", "content_ready"):
                bus.subscribe(event_type, listener)

            brain = AgentBrain(config, bus=bus)
            reply = await brain.handle_message("u1", "今天很开心")

            try:
                self.assertIn("离线", reply)
                types = [event["type"] for event in events]
                self.assertIn("emotion_changed", types)
                self.assertIn("memory_updated", types)
                self.assertIn("content_ready", types)
                content_ready = next(
                    event for event in events if event["type"] == "content_ready"
                )
                self.assertEqual(content_ready["payload"]["reply"], reply)
            finally:
                brain.memory.close()


if __name__ == "__main__":
    unittest.main()
