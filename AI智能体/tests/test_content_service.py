from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from agent.bus import AgentBus
from agent.config import AgentConfig
from agent.content import ContentStore
from agent.services.content_service import ContentService


class ContentServiceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.config = AgentConfig(data_dir=Path(self._tmp.name))
        self.store = ContentStore(Path(self._tmp.name) / "content.db")
        self.bus = AgentBus()
        self.events: list[dict] = []

        async def listener(event: dict) -> None:
            self.events.append(event)

        self.bus.subscribe("content_ready", listener)
        self.service = ContentService(
            config=self.config, bus=self.bus, store=self.store
        )

    def tearDown(self) -> None:
        self.store.close()
        self._tmp.cleanup()

    async def test_offline_template_generation(self) -> None:
        draft = await self.service.generate_draft()

        self.assertEqual(draft["status"], "draft")
        self.assertTrue(draft["ready_to_publish"])
        for key in ("topic", "title", "script", "cover_prompt"):
            self.assertTrue(draft[key].strip(), key)
        self.assertTrue(draft["tags"])

    async def test_draft_persisted(self) -> None:
        draft = await self.service.generate_draft()

        drafts = self.service.get_drafts("draft")
        self.assertEqual(len(drafts), 1)
        self.assertEqual(drafts[0]["id"], draft["id"])
        self.assertEqual(drafts[0]["title"], draft["title"])
        self.assertEqual(self.store.get_drafts("draft")[0]["topic"], draft["topic"])

    async def test_content_ready_event_published(self) -> None:
        draft = await self.service.generate_draft()

        self.assertEqual(len(self.events), 1)
        event = self.events[0]
        self.assertEqual(event["type"], "content_ready")
        self.assertEqual(event["payload"]["draft_id"], draft["id"])
        self.assertIs(event["payload"]["ready_to_publish"], True)

    async def test_llm_generation_uses_chat(self) -> None:
        class FakeLLM:
            available = True

            def __init__(self) -> None:
                self.calls = 0

            def chat(
                self,
                messages: list[dict],
                temperature: float = 0.8,
                tools: list[dict] | None = None,
            ) -> dict:
                self.calls += 1
                return {"content": f"内容-{self.calls}"}

        llm = FakeLLM()
        service = ContentService(
            config=self.config, bus=self.bus, store=self.store, llm=llm
        )

        draft = await service.generate_draft()

        self.assertEqual(llm.calls, 5)
        self.assertEqual(draft["topic"], "内容-1")
        self.assertEqual(draft["title"], "内容-2")
        self.assertEqual(draft["script"], "内容-3")
        self.assertEqual(draft["tags"], ["内容-4"])
        self.assertEqual(draft["cover_prompt"], "内容-5")

    async def test_start_and_stop_background_scheduler(self) -> None:
        await self.service.start()

        self.assertTrue(self.service.running)
        self.assertIsNotNone(self.service._task)

        await self.service.stop()

        self.assertFalse(self.service.running)
        self.assertIsNone(self.service._task)
        self.assertEqual(len(self.events), 0)


if __name__ == "__main__":
    unittest.main()
