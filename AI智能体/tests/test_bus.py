from __future__ import annotations

import asyncio
import threading
import unittest

from agent.bus import EVENT_TYPES, AgentBus


class AgentBusTests(unittest.IsolatedAsyncioTestCase):
    async def test_subscribe_and_publish(self) -> None:
        bus = AgentBus()
        received: list[dict] = []

        async def listener(event: dict) -> None:
            received.append(event)

        bus.subscribe("user_message", listener)
        await bus.apublish("user_message", {"user_key": "u1", "message": "你好"})
        self.assertEqual(len(received), 1)
        self.assertEqual(received[0]["type"], "user_message")
        self.assertEqual(received[0]["payload"]["message"], "你好")

    async def test_unsubscribe(self) -> None:
        bus = AgentBus()
        received: list[dict] = []

        async def listener(event: dict) -> None:
            received.append(event)

        bus.subscribe("content_ready", listener)
        bus.unsubscribe("content_ready", listener)
        await bus.apublish("content_ready", {"reply": "ok"})
        self.assertEqual(received, [])

    def test_unknown_event_type_rejected(self) -> None:
        bus = AgentBus()
        with self.assertRaises(ValueError):
            bus.publish("unknown", {})

    async def test_publish_from_worker_thread(self) -> None:
        bus = AgentBus()
        bus.attach_loop(asyncio.get_running_loop())
        received: list[dict] = []
        done = asyncio.Event()

        async def listener(event: dict) -> None:
            received.append(event)
            done.set()

        bus.subscribe("memory_updated", listener)

        def worker() -> None:
            bus.publish("memory_updated", {"action": "exchange"})

        thread = threading.Thread(target=worker)
        thread.start()
        await asyncio.wait_for(done.wait(), timeout=5)
        thread.join(timeout=5)
        self.assertEqual(received[0]["payload"]["action"], "exchange")

    def test_event_types(self) -> None:
        self.assertEqual(
            EVENT_TYPES,
            (
                "user_message",
                "emotion_changed",
                "memory_updated",
                "content_ready",
                "publish_requested",
                "publish_finished",
                "llm_call",
            ),
        )


if __name__ == "__main__":
    unittest.main()
