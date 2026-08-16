from __future__ import annotations

import asyncio
import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

from agent.brain import AgentBrain
from agent.bus import AgentBus
from agent.config import AgentConfig
from agent.memory import MemoryStore
from agent.monitor import MonitorStore
from agent.runner import ModuleRunner
from agent.services.monitor_service import MonitorService


class MonitorServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_events_write_monitor_records(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            service = MonitorService(
                config=AgentConfig(data_dir=Path(tmp)),
                bus=AgentBus(),
                heartbeat_interval=3600,
            )
            await service.start()
            try:
                await service.bus.apublish(
                    "user_message",
                    {"user_key": "u1", "message": "你好", "role": "user"},
                )
                await service.bus.apublish(
                    "emotion_changed",
                    {
                        "mood": "开心",
                        "valence": 0.8,
                        "arousal": 0.6,
                        "dominance": 0.7,
                    },
                )
                await service.bus.apublish(
                    "publish_finished",
                    {
                        "platform": "douyin",
                        "title": "演示标题",
                        "status": "succeeded",
                    },
                )
                await service.bus.apublish(
                    "llm_call",
                    {
                        "model": "gpt-4o-mini",
                        "prompt_tokens": 10,
                        "completion_tokens": 20,
                        "total_tokens": 30,
                        "latency_ms": 5,
                        "ok": True,
                    },
                )
                summary = service.store.summary(hours=24)
                self.assertEqual(summary["conversations"], 1)
                self.assertEqual(summary["emotions"], 1)
                self.assertEqual(summary["publish_tasks"], 1)
                self.assertEqual(summary["llm_calls"], 1)
                self.assertEqual(summary["llm_ok"], 1)
            finally:
                await service.stop()

    async def test_background_writes_heartbeat_and_memory_stats(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config = AgentConfig(data_dir=Path(tmp))
            memory = MemoryStore(config.data_dir / "memory.db")
            memory.save_exchange("u1", "user", "你好")
            memory.remember_fact("u1", "用户喜欢咖啡", "偏好")
            memory.save_episode("u1", "重要事件")
            memory.close()

            service = MonitorService(
                config=config,
                bus=AgentBus(),
                heartbeat_interval=0.02,
                cleanup_days=30,
            )
            await service.start()
            try:
                await asyncio.sleep(0.12)
                summary = service.store.summary(hours=24)
                self.assertGreater(summary["module_heartbeats"], 0)
                self.assertGreater(summary["memory_stats"], 0)
                conn = sqlite3.connect(str(service.store.db_path))
                try:
                    row = conn.execute(
                        "SELECT facts, episodes, conversations "
                        "FROM memory_stats ORDER BY id DESC LIMIT 1"
                    ).fetchone()
                finally:
                    conn.close()
                self.assertEqual(row, (1, 1, 1))
            finally:
                await service.stop()

    async def test_background_cleanup_removes_old_records(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config = AgentConfig(data_dir=Path(tmp))
            store = MonitorStore(Path(tmp) / "monitor.db")
            old = (datetime.now(timezone.utc) - timedelta(days=31)).isoformat(
                timespec="seconds"
            )
            store.record_conversation(
                "u1", "user", "旧消息", created_at=old
            )
            store.record_conversation("u1", "user", "新消息")
            store.close()

            service = MonitorService(
                config=config,
                bus=AgentBus(),
                heartbeat_interval=0.02,
                cleanup_days=30,
            )
            await service.start()
            try:
                await asyncio.sleep(0.12)
                summary = service.store.summary(hours=0)
                self.assertEqual(summary["conversations"], 1)
            finally:
                await service.stop()

    async def test_brain_publishes_llm_call_event(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config = AgentConfig(data_dir=Path(tmp))
            bus = AgentBus()
            events: list[dict] = []

            async def listener(event: dict) -> None:
                events.append(event)

            bus.subscribe("llm_call", listener)
            brain = AgentBrain(config, bus=bus)
            brain.llm.chat = lambda messages, **kwargs: {
                "role": "assistant",
                "content": "好的",
            }
            brain.tools = SimpleNamespace(schemas=lambda: [])
            try:
                reply = await brain._run_tool_loop(
                    [{"role": "user", "content": "你好世界"}],
                    "u1",
                )
                self.assertEqual(reply, "好的")
                self.assertEqual(len(events), 1)
                payload = events[0]["payload"]
                self.assertEqual(payload["model"], config.model)
                self.assertEqual(payload["user_key"], "u1")
                self.assertEqual(payload["prompt_tokens"], 1)
                self.assertEqual(payload["completion_tokens"], 0)
                self.assertEqual(payload["total_tokens"], 1)
                self.assertIs(payload["ok"], True)
                self.assertGreaterEqual(payload["latency_ms"], 0)
            finally:
                brain.memory.close()

    async def test_works_inside_module_runner(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config = AgentConfig(data_dir=Path(tmp))
            service = MonitorService(
                config=config,
                heartbeat_interval=3600,
            )
            runner = ModuleRunner(config, modules=[service])
            await runner.start()
            try:
                await runner.bus.apublish(
                    "user_message",
                    {"user_key": "u1", "message": "你好"},
                )
                summary = service.store.summary(hours=24)
                self.assertEqual(summary["conversations"], 1)
            finally:
                await runner.stop()


if __name__ == "__main__":
    unittest.main()
