from __future__ import annotations

import asyncio
import unittest
from unittest.mock import patch

from agent.config import AgentConfig
from agent.services.chat_service import FRIENDLY_ERROR, ChatService

SAMPLE_UPDATE = {
    "update_id": 100,
    "message": {"message_id": 1, "chat": {"id": 42}, "text": "你好"},
}


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


class FakeChannel:
    def __init__(self, updates: list[dict] | None = None) -> None:
        self.offset = 0
        self.sent: list[tuple[int, str]] = []
        self.fetches = 0
        self._updates = list(updates or [])
        self._pending = True

    async def fetch_updates(self, offset: int) -> dict:
        self.offset = offset
        self.fetches += 1
        if self._pending and self._updates:
            self._pending = False
            return {"result": self._updates}
        await asyncio.Event().wait()
        return {"result": []}

    async def send_text(self, chat_id: int, text: str) -> None:
        self.sent.append((chat_id, text))


class ChatServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_parse_update_extracts_chat_id_and_text(self) -> None:
        service = ChatService(brain=FakeBrain(), channel=FakeChannel())
        self.assertEqual(service.parse_update(SAMPLE_UPDATE), (42, "你好"))
        self.assertIsNone(
            service.parse_update(
                {
                    "update_id": 1,
                    "edited_message": {"chat": {"id": 1}, "text": "改过了"},
                }
            )
        )
        self.assertIsNone(
            service.parse_update(
                {"update_id": 2, "message": {"chat": {"id": 3}}}
            )
        )
        self.assertIsNone(
            service.parse_update(
                {"update_id": 3, "message": {"chat": {"id": 4}, "text": ""}}
            )
        )

    async def test_handle_update_calls_brain_and_sends_reply(self) -> None:
        brain = FakeBrain(reply="收到！")
        channel = FakeChannel()
        service = ChatService(brain=brain, channel=channel)

        await service.handle_update(SAMPLE_UPDATE)

        self.assertEqual(brain.calls, [("42", "你好")])
        self.assertEqual(channel.sent, [(42, "收到！")])

    async def test_handle_update_sends_friendly_error_on_brain_exception(self) -> None:
        brain = FakeBrain(fail=True)
        channel = FakeChannel()
        service = ChatService(brain=brain, channel=channel)

        await service.handle_update(SAMPLE_UPDATE)

        self.assertEqual(channel.sent, [(42, FRIENDLY_ERROR)])

    async def test_start_without_token_stays_runnable(self) -> None:
        config = AgentConfig(telegram_token="")
        service = ChatService(config=config, brain=FakeBrain())
        with patch("agent.services.chat_service.os.getenv", return_value=""):
            with self.assertLogs("agent.services.chat_service", level="INFO") as logs:
                await service.start()

        self.assertTrue(service.running)
        self.assertIsNone(service._poll_task)
        self.assertTrue(any("TELEGRAM_BOT_TOKEN" in line for line in logs.output))
        await service.stop()

    async def test_start_with_token_starts_and_stop_cancels_polling(self) -> None:
        config = AgentConfig(telegram_token="123:fake")
        service = ChatService(
            config=config,
            brain=FakeBrain(),
            channel=FakeChannel(),
        )

        await service.start()

        self.assertTrue(service.running)
        self.assertIsNotNone(service._poll_task)
        self.assertFalse(service._poll_task.done())

        await service.stop()

        self.assertFalse(service.running)
        self.assertTrue(service._poll_task.cancelled())

    async def test_poll_loop_dispatches_fake_updates(self) -> None:
        brain = FakeBrain(reply="你好呀")
        channel = FakeChannel(updates=[SAMPLE_UPDATE])
        service = ChatService(
            config=AgentConfig(
                telegram_token="123:fake",
                thinking_delay_min=0,
                thinking_delay_max=0,
                message_delay=0,
                multi_reply_enabled=False,
            ),
            brain=brain,
            channel=channel,
        )

        await service.start()
        try:
            for _ in range(50):
                if brain.calls:
                    break
                await asyncio.sleep(0.01)
            self.assertEqual(brain.calls, [("42", "你好")])
            self.assertEqual(channel.sent, [(42, "你好呀")])
        finally:
            await service.stop()


if __name__ == "__main__":
    unittest.main()
