from __future__ import annotations

import unittest

from agent.tools import ToolRegistry


class ToolTests(unittest.TestCase):
    def test_web_search_dry_run(self) -> None:
        registry = ToolRegistry()
        result = registry.run("web_search", {"query": "今天天气"})
        self.assertIn("演示", result)

    def test_schemas_include_video_publish(self) -> None:
        names = [tool["function"]["name"] for tool in ToolRegistry().schemas()]
        self.assertIn("post_video", names)


if __name__ == "__main__":
    unittest.main()
