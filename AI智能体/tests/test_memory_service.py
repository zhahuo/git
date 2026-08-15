from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path

from agent.bus import AgentBus
from agent.config import AgentConfig
from agent.runner import ModuleRunner
from agent.services.memory_service import MemoryService


class MemoryServiceTests(unittest.IsolatedAsyncioTestCase):
    def _service(self, tmp: str, **kwargs: object) -> MemoryService:
        config = AgentConfig(data_dir=Path(tmp))
        return MemoryService(config=config, bus=AgentBus(), **kwargs)

    async def test_user_message_event_writes_exchange_and_emotion(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            service = self._service(tmp)
            await service.start()
            try:
                await service.bus.apublish(
                    "user_message",
                    {
                        "user_key": "u1",
                        "message": "我今天很开心",
                        "emotion": {
                            "valence": 0.8,
                            "arousal": 0.6,
                            "dominance": 0.7,
                            "mood": "开心",
                            "event": "joy",
                        },
                    },
                )
                items = service.recall("u1", "开心")
                self.assertTrue(any("我今天很开心" in item.content for item in items))
                history = service.store.mood_history("u1", limit=5)
                self.assertEqual(len(history), 1)
                self.assertEqual(history[0]["mood"], "开心")
                self.assertEqual(history[0]["valence"], 0.8)
            finally:
                await service.stop()

    async def test_memory_updated_writes_fact_and_refreshes_cache(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            service = self._service(tmp)
            service._ensure_store().remember_fact("u1", "用户喜欢咖啡", "偏好")
            first = service.recall("u1", "咖啡")
            self.assertTrue(any("咖啡" in item.content for item in first))

            service._ensure_store().remember_fact("u1", "用户喜欢拿铁", "偏好")
            cached = service.recall("u1", "咖啡")
            self.assertFalse(any("拿铁" in item.content for item in cached))

            await service.start()
            try:
                await service.bus.apublish(
                    "memory_updated",
                    {
                        "user_key": "u1",
                        "action": "remembered",
                        "content": "用户喜欢奶茶",
                        "category": "偏好",
                        "confidence": 0.9,
                    },
                )
                refreshed = service.recall("u1", "咖啡")
                self.assertTrue(any("拿铁" in item.content for item in refreshed))
                self.assertTrue(any("奶茶" in item.content for item in refreshed))
            finally:
                await service.stop()

    async def test_compact_summarizes_old_conversations_and_dedupes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            service = self._service(tmp)
            store = service._ensure_store()
            store.save_exchange(
                "u1",
                "user",
                "我喜欢火锅",
                created_at="2020-01-01T00:00:00+00:00",
            )
            store.save_exchange(
                "u1",
                "assistant",
                "好，我记住了",
                created_at="2020-01-01T00:00:01+00:00",
            )
            store.remember_fact("u1", "用户喜欢火锅", "偏好")
            store.remember_fact("u1", "用户喜欢火锅", "偏好")

            try:
                result = await service.compact()
                self.assertEqual(result["summarized"], 1)
                self.assertEqual(result["deleted"], 2)
                self.assertEqual(result["duplicates_removed"], 1)
                self.assertEqual(len(store.profile("u1").get("偏好", [])), 1)
                items = service.recall("u1", "火锅")
                self.assertTrue(any("对话摘要" in item.content for item in items))
            finally:
                await service.stop()

    async def test_compaction_background_task_does_not_crash(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            service = self._service(
                tmp,
                compaction_interval=0.05,
                compact_after_days=0,
            )
            await service.start()
            try:
                store = service._ensure_store()
                store.save_exchange(
                    "u1",
                    "user",
                    "很旧的一段对话",
                    created_at="2020-01-01T00:00:00+00:00",
                )
                store.remember_fact("u1", "重复偏好", "偏好")
                store.remember_fact("u1", "重复偏好", "偏好")
                await asyncio.sleep(0.25)
                self.assertEqual(len(store.profile("u1").get("偏好", [])), 1)
                items = service.recall("u1", "很旧")
                self.assertTrue(any("对话摘要" in item.content for item in items))
            finally:
                await service.stop()

    async def test_works_inside_module_runner(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config = AgentConfig(data_dir=Path(tmp))
            service = MemoryService(config=config)
            runner = ModuleRunner(config, modules=[service])
            await runner.start()
            try:
                await runner.bus.apublish(
                    "user_message", {"user_key": "u1", "message": "你好"}
                )
                self.assertEqual(len(service.store.mood_history("u1", limit=5)), 1)
            finally:
                await runner.stop()


if __name__ == "__main__":
    unittest.main()
