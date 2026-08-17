from __future__ import annotations

import asyncio
import unittest

from agent.config import AgentConfig
from agent.services.qq_service import FRIENDLY_ERROR, QQService


class Reply:
    pass


class FakeMessages:
    def __init__(self, text: str = "", at: list | None = None, reply: bool = False) -> None:
        self.text = text
        self.at = list(at or [])
        self.messages = [Reply()] if reply else []

    def concatenate_text(self) -> str:
        return self.text

    def is_user_at(self, user_id: str) -> bool:
        return user_id in self.at

    def filter(self, cls=None):
        return self.messages


class FakeEvent:
    def __init__(self, user_id=None, group_id=None, message=None) -> None:
        self.user_id = user_id
        self.group_id = group_id
        self.message = message or FakeMessages()
        self.replies: list[tuple[str, bool]] = []

    async def reply(self, text: str, at: bool = True) -> None:
        self.replies.append((text, at))


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


class QQServiceTests(unittest.IsolatedAsyncioTestCase):
    def test_parse_private_and_group_messages(self) -> None:
        config = AgentConfig(qq_bot_qq="10001")
        service = QQService(config=config)

        self.assertEqual(
            service.parse_event(
                FakeEvent(user_id="20001", message=FakeMessages("你好"))
            ),
            ("20001", "你好", False, False),
        )
        self.assertEqual(
            service.parse_event(
                FakeEvent(
                    group_id="30001",
                    message=FakeMessages("大家好", at=["10001"]),
                )
            ),
            ("30001", "大家好", True, True),
        )
        self.assertEqual(
            service.parse_event(
                FakeEvent(
                    group_id="30001",
                    message=FakeMessages("引用消息", reply=True),
                )
            ),
            ("30001", "引用消息", True, True),
        )
        self.assertIsNone(
            service.parse_event(FakeEvent(user_id="20001", message=FakeMessages("")))
        )

    async def test_private_whitelist_controls_reply(self) -> None:
        brain = FakeBrain()
        service = QQService(
            config=AgentConfig(
                qq_allowed_users="20001,20002",
                qq_reply_private=True,
            ),
            brain=brain,
        )

        denied = await service.handle_qq_event(
            FakeEvent(user_id="99999", message=FakeMessages("在吗"))
        )
        accepted = await service.handle_qq_event(
            FakeEvent(user_id="20002", message=FakeMessages("在吗"))
        )

        self.assertFalse(denied)
        self.assertTrue(accepted)
        self.assertEqual(brain.calls, [("20002", "在吗")])

    async def test_group_only_replies_to_mention_or_quote(self) -> None:
        brain = FakeBrain()
        service = QQService(
            config=AgentConfig(
                qq_bot_qq="10001",
                qq_allowed_groups="30001",
                qq_reply_group_mention=True,
            ),
            brain=brain,
        )

        ignored = await service.handle_qq_event(
            FakeEvent(group_id="30001", message=FakeMessages("普通消息"))
        )
        mentioned = await service.handle_qq_event(
            FakeEvent(
                group_id="30001",
                message=FakeMessages("帮我看下", at=["10001"]),
            )
        )
        quoted = await service.handle_qq_event(
            FakeEvent(
                group_id="30001",
                message=FakeMessages("引用一下", reply=True),
            )
        )

        self.assertFalse(ignored)
        self.assertTrue(mentioned)
        self.assertTrue(quoted)
        self.assertEqual(
            brain.calls,
            [("30001", "帮我看下"), ("30001", "引用一下")],
        )

    async def test_group_all_mode_replies_without_mention(self) -> None:
        brain = FakeBrain()
        service = QQService(
            config=AgentConfig(
                qq_bot_qq="10001",
                qq_allowed_groups="30001",
                qq_reply_group_all=True,
            ),
            brain=brain,
        )

        self.assertTrue(
            await service.handle_qq_event(
                FakeEvent(group_id="30001", message=FakeMessages("大家好"))
            )
        )
        self.assertEqual(brain.calls, [("30001", "大家好")])

    async def test_dry_run_records_reply_without_sending(self) -> None:
        brain = FakeBrain(reply="嘿嘿\n我也这么觉得")
        service = QQService(
            config=AgentConfig(
                qq_allowed_users="20001",
                qq_dry_run=True,
                thinking_delay_min=0,
                thinking_delay_max=0,
                message_delay=0,
            ),
            brain=brain,
        )
        event = FakeEvent(user_id="20001", message=FakeMessages("你好"))

        await service.handle_qq_event(event)

        self.assertEqual(service.sent, [("20001", "嘿嘿"), ("20001", "我也这么觉得")])
        self.assertEqual(event.replies, [])

    async def test_real_send_uses_humanized_segments(self) -> None:
        brain = FakeBrain(reply="嘿嘿\n我也这么觉得")
        service = QQService(
            config=AgentConfig(
                qq_bot_qq="10001",
                qq_allowed_groups="30001",
                qq_dry_run=False,
                thinking_delay_min=0,
                thinking_delay_max=0,
                message_delay=0,
            ),
            brain=brain,
        )
        event = FakeEvent(
            group_id="30001",
            message=FakeMessages("在吗", at=["10001"]),
        )

        await service.handle_qq_event(event)

        self.assertEqual(
            event.replies,
            [("嘿嘿", False), ("我也这么觉得", False)],
        )
        self.assertEqual(service.sent, [])

    async def test_handle_message_sends_friendly_error_on_brain_exception(self) -> None:
        brain = FakeBrain(fail=True)
        service = QQService(
            config=AgentConfig(
                qq_allowed_users="20001",
                qq_dry_run=False,
                multi_reply_enabled=False,
                thinking_delay_min=0,
                thinking_delay_max=0,
            ),
            brain=brain,
        )
        event = FakeEvent(user_id="20001", message=FakeMessages("你好"))

        await service.handle_qq_event(event)

        self.assertEqual(event.replies, [(FRIENDLY_ERROR, True)])

    async def test_start_without_enabled_stays_runnable(self) -> None:
        service = QQService(config=AgentConfig(qq_enabled=False), brain=FakeBrain())
        with self.assertLogs("agent.services.qq_service", level="INFO") as logs:
            await service.start()

        self.assertTrue(service.running)
        self.assertIsNone(service.client)
        self.assertTrue(any("QQ_ENABLED" in line for line in logs.output))
        await service.stop()

    def test_default_enabled_modules_include_qq(self) -> None:
        self.assertIn("qq", AgentConfig().enabled_modules)

    def test_config_fields_have_safe_defaults(self) -> None:
        config = AgentConfig()
        self.assertFalse(config.qq_enabled)
        self.assertTrue(config.qq_dry_run)
        self.assertEqual(config.qq_ws_url, "ws://127.0.0.1:3001")
        self.assertEqual(config.qq_allowed_users, "")
        self.assertEqual(config.qq_allowed_groups, "")


if __name__ == "__main__":
    unittest.main()
