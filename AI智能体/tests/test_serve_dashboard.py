from __future__ import annotations

import json
import tempfile
import threading
import unittest
import urllib.request
from pathlib import Path

from agent.config import AgentConfig
from agent.monitor import MonitorStore
from scripts.serve_dashboard import create_dashboard_server


class ServeDashboardTests(unittest.TestCase):
    def test_http_serves_page_static_and_debug_api(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config = AgentConfig(data_dir=Path(tmp))
            db_path = Path(tmp) / "monitor.db"
            store = MonitorStore(db_path)
            try:
                store.record_log("INFO", "agent.brain", "调试日志消息")
            finally:
                store.close()

            server = create_dashboard_server(
                host="127.0.0.1",
                port=0,
                config=config,
                db_path=db_path,
            )
            thread = threading.Thread(
                target=server.serve_forever,
                daemon=True,
            )
            thread.start()
            port = server.server_address[1]
            try:
                with urllib.request.urlopen(
                    f"http://127.0.0.1:{port}/", timeout=5
                ) as response:
                    html = response.read().decode("utf-8")
                self.assertIn('data-view="debug"', html)
                self.assertIn("日志流", html)

                with urllib.request.urlopen(
                    f"http://127.0.0.1:{port}/static/app.js", timeout=5
                ) as response:
                    app_js = response.read().decode("utf-8")
                self.assertIn("get_logs", app_js)
                self.assertIn('"/api/"', app_js)

                with urllib.request.urlopen(
                    f"http://127.0.0.1:{port}/api/logs?limit=10", timeout=5
                ) as response:
                    logs = json.loads(response.read().decode("utf-8"))
                self.assertTrue(
                    any(row["message"] == "调试日志消息" for row in logs)
                )

                with urllib.request.urlopen(
                    f"http://127.0.0.1:{port}/api/config", timeout=5
                ) as response:
                    cfg = json.loads(response.read().decode("utf-8"))
                self.assertEqual(cfg["name"], "小忆")
                self.assertIn("debug", cfg["enabled_modules"])
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
