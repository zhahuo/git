from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from agent.bus import AgentBus
from agent.config import AgentConfig
from agent.runner import ModuleRunner
from agent.services.publish_service import PublishService
from agent.social.douyin import DouyinPublisher


class PublishServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.config = AgentConfig(data_dir=Path(self._tmp.name))
        self.bus = AgentBus()
        self.finished: list[dict] = []
        self.bus.subscribe("publish_finished", self._collect_finished)

    async def _collect_finished(self, event: dict) -> None:
        self.finished.append(event)

    async def asyncTearDown(self) -> None:
        self._tmp.cleanup()

    async def test_dry_run_publish_requested_records_status(self) -> None:
        service = PublishService(config=self.config, bus=self.bus)
        await service.start()
        try:
            await self.bus.apublish(
                "publish_requested",
                {
                    "user_key": "u1",
                    "platform": "douyin",
                    "video_path": "videos/demo.mp4",
                    "title": "演示标题",
                    "description": "演示描述",
                    "tags": ["AI", "测试"],
                },
            )
            self.assertEqual(len(self.finished), 1)
            event = self.finished[0]
            self.assertEqual(event["payload"]["status"], "succeeded")
            self.assertTrue(event["payload"]["dry_run"])
            task = service.store.get_task(event["payload"]["task_id"])
            self.assertIsNotNone(task)
            self.assertEqual(task["status"], "succeeded")
            self.assertEqual(task["platform"], "douyin")
            self.assertTrue(task["dry_run"])
            self.assertEqual(task["title"], "演示标题")
            self.assertEqual(task["tags"], ["AI", "测试"])
            self.assertIn("演示模式", task["result"])
        finally:
            await service.stop()

    async def test_content_ready_auto_publishes_only_when_flagged(self) -> None:
        service = PublishService(config=self.config, bus=self.bus)
        await service.start()
        try:
            await self.bus.apublish(
                "content_ready", {"user_key": "u1", "reply": "视频做好了"}
            )
            self.assertEqual(self.finished, [])
            self.assertEqual(service.store.list_tasks(), [])

            await self.bus.apublish(
                "content_ready",
                {
                    "user_key": "u1",
                    "ready_to_publish": True,
                    "platform": "tiktok",
                    "video_path": "videos/demo.mp4",
                    "title": "TikTok 标题",
                },
            )
            self.assertEqual(len(self.finished), 1)
            event = self.finished[0]
            self.assertEqual(event["payload"]["status"], "succeeded")
            self.assertEqual(event["payload"]["source"], "content_ready")
            task = service.store.get_task(event["payload"]["task_id"])
            self.assertEqual(task["source"], "content_ready")
            self.assertEqual(task["platform"], "tiktok")
        finally:
            await service.stop()

    async def test_publisher_error_recorded_as_failed(self) -> None:
        class BrokenPublisher:
            platform = "douyin"
            dry_run = True
            configured = False

            def publish(
                self,
                video_path: str,
                title: str,
                description: str,
                tags: list[str] | None = None,
                **kwargs: object,
            ) -> dict[str, object]:
                raise RuntimeError("模拟发布失败")

        service = PublishService(
            config=self.config,
            bus=self.bus,
            publishers={"douyin": BrokenPublisher()},
        )
        await service.start()
        try:
            await self.bus.apublish(
                "publish_requested",
                {
                    "user_key": "u1",
                    "platform": "douyin",
                    "video_path": "videos/demo.mp4",
                    "title": "会失败",
                },
            )
            event = self.finished[0]
            self.assertEqual(event["payload"]["status"], "failed")
            self.assertIn("模拟发布失败", event["payload"]["error"])
            task = service.store.get_task(event["payload"]["task_id"])
            self.assertEqual(task["status"], "failed")
            self.assertIn("模拟发布失败", task["error"])
        finally:
            await service.stop()

    async def test_official_publish_requires_credentials_and_disabled_dry_run(self) -> None:
        service = PublishService(
            config=self.config,
            bus=self.bus,
            publishers={
                "douyin": DouyinPublisher(
                    dry_run=False, client_key="key", client_secret="secret"
                )
            },
        )
        await service.start()
        try:
            await self.bus.apublish(
                "publish_requested",
                {
                    "user_key": "u1",
                    "platform": "douyin",
                    "video_path": "videos/demo.mp4",
                    "title": "正式标题",
                },
            )
            event = self.finished[0]
            self.assertEqual(event["payload"]["status"], "failed")
            self.assertFalse(event["payload"]["dry_run"])
            self.assertIn("正式发布", event["payload"]["error"])
            task = service.store.get_task(event["payload"]["task_id"])
            self.assertEqual(task["status"], "failed")
            self.assertFalse(task["dry_run"])
        finally:
            await service.stop()

    async def test_without_credentials_stays_dry_run(self) -> None:
        service = PublishService(
            config=self.config,
            bus=self.bus,
            publishers={"douyin": DouyinPublisher(dry_run=False)},
        )
        await service.start()
        try:
            await self.bus.apublish(
                "publish_requested",
                {
                    "user_key": "u1",
                    "platform": "douyin",
                    "video_path": "videos/demo.mp4",
                    "title": "没有凭证",
                },
            )
            event = self.finished[0]
            self.assertEqual(event["payload"]["status"], "succeeded")
            self.assertTrue(event["payload"]["dry_run"])
            task = service.store.get_task(event["payload"]["task_id"])
            self.assertTrue(task["dry_run"])
        finally:
            await service.stop()

    async def test_invalid_payload_recorded_as_failed(self) -> None:
        service = PublishService(config=self.config, bus=self.bus)
        await service.start()
        try:
            await self.bus.apublish("publish_requested", {"user_key": "u1"})
            event = self.finished[0]
            self.assertEqual(event["payload"]["status"], "failed")
            self.assertIn("缺少 platform", event["payload"]["error"])
            self.assertIn("缺少 video_path", event["payload"]["error"])
            self.assertIn("缺少 title", event["payload"]["error"])
            task = service.store.get_task(event["payload"]["task_id"])
            self.assertEqual(task["status"], "failed")
        finally:
            await service.stop()

    async def test_works_inside_module_runner_without_double_dispatch(self) -> None:
        service = PublishService(config=self.config)
        runner = ModuleRunner(self.config, modules=[service])
        await runner.start()
        try:
            await runner.bus.apublish(
                "publish_requested",
                {
                    "user_key": "u1",
                    "platform": "douyin",
                    "video_path": "videos/demo.mp4",
                    "title": "runner 标题",
                },
            )
            tasks = service.store.list_tasks()
            self.assertEqual(len(tasks), 1)
            self.assertEqual(tasks[0]["status"], "succeeded")
        finally:
            await runner.stop()


if __name__ == "__main__":
    unittest.main()
