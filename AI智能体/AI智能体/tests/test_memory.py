from __future__ import annotations

import unittest
from pathlib import Path

from agent.memory import MemoryStore


class MemoryTests(unittest.TestCase):
    def test_save_and_recall(self) -> None:
        store = MemoryStore(Path(":memory:"))
        store.save_exchange("u1", "user", "我喜欢吃火锅")
        store.remember_fact("u1", "用户喜欢吃火锅", "偏好")
        items = store.recall("u1", "火锅")
        self.assertTrue(any("火锅" in item.content for item in items))
        self.assertEqual(store.profile("u1")["偏好"], ["用户喜欢吃火锅"])


if __name__ == "__main__":
    unittest.main()
