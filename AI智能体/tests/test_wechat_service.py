from __future__ import annotations

import asyncio
import unittest

from agent.config import AgentConfig
from agent.services.wechat_service import FRIENDLY_ERROR, WeChatService


class FakeBrain:
    def __init__(self, reply: str = "好的", fail: bool = False) -> None:
        self.reply = reply
        self.fail = fail
        self.calls: list[tuple[str, str]] = []

    async def handle_message(self, user_key: str, message: str) -> str:
        self.calls.append((user_key, message))
        if self.fail:
            raise RuntimeError("brain failure")
        return self.reply


class FakeWx:
    def __init__(self, messages: list | None = None) -> None:
        self.sent: list[tuple[str, str]] = []
        self._messages = list(messages or [])

    def GetNextNewMessage(self, timeout: int = 1):
        if self._messages:
            return self._messages.pop(0)
        return []

    def SendMsg(self, text: str, who: str) -> None:
        self.sent.append((who, text))


class WeChatServiceTests(unittest.IsolatedAsyncioTestCase):
    def test_parse_message_extracts_common_forms(self) -> None:
        service = WeChatService()
        self.assertEqual(
            service.parse_message({"chat": "filehelper", "text": "你好"}),
            ("filehelper", "你好"),
        )
        self.assertEqual(
            service.parse_message({"chat_id": 123, "text": "在吗"}),
            ("123", "在吗"),
        )
        self.assertEqual(
            service.parse_message({"张三": "忙吗"}),
            ("张三", "忙吗"),
        )
        self.assertEqual(
            service.parse_message(["wxid_1", "hello"]),
            ("wxid_1", "hello"),
        )
        self.assertIsNone(service.parse_message({"chat": "a"}))
        self.assertIsNone(service.parse_message({"chat": "", "text": "x"}))
        self.assertIsNone(service.parse_message(42))

    async def test_start_dry_run_stays_runnable_without_real_operation(self) -> None:
        config = AgentConfig(wechat_enabled=True, wechat_dry_run=True)
        service = WeChatService(config=config, brain=FakeBrain())
        with self.assertLogs("agent.services.wechat_service", level="INFO") as logs:
            await service.start()

        self.assertTrue(service.running)
        self.assertIsNone(service._poll_task)
        self.assertIsNone(service.wx)
        self.assertTrue(any("WECHAT_DRY_RUN" in line for line in logs.output))
        await service.stop()

    async def test_start_without_enabled_flag_stays_runnable(self) -> None:
        config = AgentConfig(wechat_enabled=False, wechat_dry_run=False)
        service = WeChatService(config=config, brain=FakeBrain())
        with self.assertLogs("agent.services.wechat_service", level="INFO") as logs:
            await service.start()

        self.assertTrue(service.running)
        self.assertIsNone(service._poll_task)
        self.assertTrue(any("WECHAT_ENABLED" in line for line in logs.output))
        await service.stop()

    async def test_handle_message_calls_brain_and_sends_humanized_reply(self) -> None:
        brain = FakeBrain(reply="嘿嘿\n我也这么觉得")
        wx = FakeWx()
        service = WeChatService(
            config=AgentConfig(
                thinking_delay_min=0,
                thinking_delay_max=0,
                message_delay=0,
            ),
            brain=brain,
            wx=wx,
        )

        await service.handle_message("wxid_1", "你好")

        self.assertEqual(brain.calls, [("wxid_1", "你好")])
        self.assertEqual(wx.sent, [("wxid_1", "嘿嘿"), ("wxid_1", "我也这么觉得")])

    async def test_handle_message_sends_friendly_error_on_brain_exception(self) -> None:
        brain = FakeBrain(fail=True)
        wx = FakeWx()
        service = WeChatService(
            config=AgentConfig(
                thinking_delay_min=0,
                thinking_delay_max=0,
                message_delay=0,
                multi_reply_enabled=False,
            ),
            brain=brain,
            wx=wx,
        )

        await service.handle_message("wxid_1", "你好")

        self.assertEqual(wx.sent, [("wxid_1", FRIENDLY_ERROR)])

    async def test_handle_message_ignores_disallowed_chat(self) -> None:
        brain = FakeBrain()
        wx = FakeWx()
        service = WeChatService(
            config=AgentConfig(wechat_allowed_chats="allowed1,allowed2"),
            brain=brain,
            wx=wx,
        )

        await service.handle_message("other", "你好")

        self.assertEqual(brain.calls, [])
        self.assertEqual(wx.sent, [])

    async def test_start_with_wx_starts_polling_and_stop_cancels(self) -> None:
        config = AgentConfig(wechat_enabled=True, wechat_dry_run=False)
        service = WeChatService(
            config=config,
            brain=FakeBrain(),
            wx=FakeWx(),
        )

        await service.start()

        self.assertTrue(service.running)
        self.assertIsNotNone(service._poll_task)
        self.assertFalse(service._poll_task.done())

        await service.stop()

        self.assertFalse(service.running)
        self.assertTrue(service._poll_task.cancelled())

    async def test_poll_loop_dispatches_fake_messages(self) -> None:
        brain = FakeBrain(reply="收到\n好的")
        wx = FakeWx(messages=[["wxid_1", "你好"]])
        service = WeChatService(
            config=AgentConfig(
                wechat_enabled=True,
                wechat_dry_run=False,
                thinking_delay_min=0,
                thinking_delay_max=0,
                message_delay=0,
            ),
            brain=brain,
            wx=wx,
        )

        await service.start()
        try:
            for _ in range(50):
                if brain.calls:
                    break
                await asyncio.sleep(0.01)
            self.assertEqual(brain.calls, [("wxid_1", "你好")])
            self.assertEqual(wx.sent, [("wxid_1", "收到"), ("wxid_1", "好的")])
        finally:
            await service.stop()

    def test_default_enabled_modules_include_wechat(self) -> None:
        self.assertIn("wechat", AgentConfig().enabled_modules)


if __name__ == "__main__":
    unittest.main()
