from __future__ import annotations

import os
import sys
import time

from .base import Channel

BACKGROUND = os.getenv("AGENT_BACKGROUND") == "1"


class ConsoleChannel(Channel):
    def run(self) -> None:
        if BACKGROUND or not sys.stdin.isatty():
            print("[后台模式] 跳过控制台对话，仅保留后台服务。")
            while True:
                time.sleep(3600)
            return
        name = self.brain.config.name
        print(f"你好，我是{name}。输入 /mood 看情绪，/memory 看记忆，/quit 退出。")
        while True:
            try:
                line = input("你：").strip()
            except EOFError:
                if BACKGROUND or not sys.stdin.isatty():
                    time.sleep(3600)
                    continue
                print()
                break
            except KeyboardInterrupt:
                print()
                break
            if not line:
                continue
            if line in ("/quit", "/exit"):
                break
            if line == "/mood":
                print(f"{name}：{self.brain.emotion.describe()}")
                continue
            if line == "/memory":
                items = self.brain.memory.recall("console", "", limit=10)
                if not items:
                    print(f"{name}：我还没有什么记忆。")
                else:
                    print(f"{name}：我记得这些——")
                    for item in items:
                        print(f"- [{item.kind}] {item.content}")
                continue
            try:
                reply = self.brain.respond("console", line)
            except Exception as exc:
                print(f"{name}：出错了：{exc}")
                continue
            print(f"{name}：{reply}")
