from __future__ import annotations

import unittest

from agent.channels.humanize import split_reply


class HumanizeTests(unittest.TestCase):
    def test_split_reply_by_newline(self) -> None:
        parts = split_reply("嘿嘿\n我也这么觉得\n想你了")
        self.assertEqual(len(parts), 3)

    def test_split_reply_by_comma(self) -> None:
        parts = split_reply("嘿嘿，我也这么觉得，想你了")
        self.assertGreaterEqual(len(parts), 2)


if __name__ == "__main__":
    unittest.main()
