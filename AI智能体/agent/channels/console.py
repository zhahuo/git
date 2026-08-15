from __future__ import annotations

from .base import Channel


class ConsoleChannel(Channel):
    def run(self) -> None:
        name = self.brain.config.name
        print(f"你好，我是{name}。输入 /mood 看情绪，/memory 看记忆，/quit 退出。")
        while True:
            try:
                line = input("你：").strip()
            except (EOFError, KeyboardInterrupt):
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
            reply = self.brain.respond("console", line)
            print(f"{name}：{reply}")
