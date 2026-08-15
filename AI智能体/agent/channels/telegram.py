from __future__ import annotations

import json
import time
import urllib.request

from .base import Channel


def split_text(text: str, size: int = 3800) -> list[str]:
    return [text[i : i + size] for i in range(0, len(text), size)]


class TelegramChannel(Channel):
    def __init__(self, brain, token: str):
        super().__init__(brain)
        self.api_base = f"https://api.telegram.org/bot{token}"
        self.offset = 0

    def _call(self, method: str, params: dict[str, object] | None = None) -> dict:
        req = urllib.request.Request(
            f"{self.api_base}/{method}",
            data=json.dumps(params or {}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def send_message(self, chat_id: int, text: str) -> None:
        for chunk in split_text(text):
            self._call("sendMessage", {"chat_id": chat_id, "text": chunk})

    def run(self) -> None:
        print("Telegram 机器人已启动。")
        while True:
            try:
                data = self._call("getUpdates", {"offset": self.offset, "timeout": 20})
                for update in data.get("result", []):
                    self.offset = update.get("update_id", 0) + 1
                    message = update.get("message") or {}
                    chat_id = message.get("chat", {}).get("id")
                    text = message.get("text")
                    if not chat_id or not text:
                        continue
                    reply = self.brain.respond(str(chat_id), text)
                    self.send_message(chat_id, reply)
            except Exception as exc:
                print(f"Telegram 出错：{exc}")
                time.sleep(3)
