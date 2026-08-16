from __future__ import annotations

import sqlite3
import tempfile
import unittest
import gc
from pathlib import Path

from agent.dashboard import (
    MAX_LIMIT,
    DashboardApi,
    fetch_conversations,
    fetch_emotions,
    fetch_llm_calls,
    fetch_memory_stats,
    fetch_publish_tasks,
    fetch_summary,
)


def build_sample_db(path: Path) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.executescript(
            """
            CREATE TABLE conversations (
                id INTEGER PRIMARY KEY,
                created_at TEXT,
                user_key TEXT,
                role TEXT,
                content TEXT
            );
            CREATE TABLE llm_calls (
                id INTEGER PRIMARY KEY,
                created_at TEXT,
                model TEXT,
                prompt_tokens INTEGER,
                completion_tokens INTEGER,
                total_tokens INTEGER,
                latency_ms INTEGER,
                ok INTEGER
            );
            CREATE TABLE module_heartbeats (
                id INTEGER PRIMARY KEY,
                created_at TEXT,
                module TEXT,
                status TEXT
            );
            CREATE TABLE emotions (
                id INTEGER PRIMARY KEY,
                created_at TEXT,
                mood TEXT,
                valence REAL,
                arousal REAL,
                dominance REAL
            );
            CREATE TABLE memory_stats (
                id INTEGER PRIMARY KEY,
                created_at TEXT,
                facts INTEGER,
                episodes INTEGER,
                conversations INTEGER
            );
            CREATE TABLE publish_tasks (
                id INTEGER PRIMARY KEY,
                created_at TEXT,
                platform TEXT,
                title TEXT,
                status TEXT
            );
            """
        )
        conn.executemany(
            "INSERT INTO conversations (created_at, user_key, role, content) VALUES (?, ?, ?, ?)",
            [
                ("2026-08-16 10:00:00", "u1", "user", "今天天气怎么样？"),
                ("2026-08-16 10:00:05", "u1", "assistant", "今天是个好天气。"),
                ("2026-08-15 23:00:00", "u2", "user", "昨天的对话"),
            ],
        )
        conn.executemany(
            "INSERT INTO llm_calls (created_at, model, prompt_tokens, completion_tokens, "
            "total_tokens, latency_ms, ok) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                ("2026-08-16 10:00:00", "gpt-4o-mini", 100, 50, 150, 800, 1),
                ("2026-08-16 10:01:00", "gpt-4o-mini", 200, 80, 280, 900, 0),
                ("2026-08-15 23:00:00", "gpt-4o-mini", 300, 100, 400, 700, 1),
            ],
        )
        conn.execute(
            "INSERT INTO module_heartbeats (created_at, module, status) VALUES (?, ?, ?)",
            ("2026-08-16 10:02:00", "monitor", "running"),
        )
        conn.executemany(
            "INSERT INTO emotions (created_at, mood, valence, arousal, dominance) VALUES (?, ?, ?, ?, ?)",
            [
                ("2026-08-16 09:00:00", "平静", 0.4, 0.2, 0.5),
                ("2026-08-16 10:00:00", "开心", 0.8, 0.6, 0.7),
            ],
        )
        conn.executemany(
            "INSERT INTO memory_stats (created_at, facts, episodes, conversations) VALUES (?, ?, ?, ?)",
            [
                ("2026-08-16 09:00:00", 10, 5, 20),
                ("2026-08-16 10:00:00", 12, 6, 21),
            ],
        )
        conn.executemany(
            "INSERT INTO publish_tasks (created_at, platform, title, status) VALUES (?, ?, ?, ?)",
            [
                ("2026-08-16 10:00:00", "公众号", "今日分享", "done"),
                ("2026-08-16 10:05:00", "抖音", "短视频", "pending"),
            ],
        )
        conn.commit()
    finally:
        conn.close()


class DashboardDataTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.db = Path(self._tmp.name) / "monitor.db"
        build_sample_db(self.db)

    def tearDown(self) -> None:
        gc.collect()
        self._tmp.cleanup()

    def test_fetch_summary(self) -> None:
        summary = fetch_summary(self.db)
        self.assertEqual(summary["today_conversations"], 2)
        self.assertEqual(summary["total_tokens"], 830)
        self.assertEqual(summary["total_llm_calls"], 3)
        self.assertEqual(summary["ok_llm_calls"], 2)
        self.assertEqual(summary["mood"], "开心")
        self.assertEqual(summary["status"], "running")

    def test_fetch_conversations_newest_first_and_limit(self) -> None:
        rows = fetch_conversations(self.db, 2)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["content"], "今天是个好天气。")
        self.assertEqual(rows[1]["user_key"], "u1")

    def test_fetch_llm_calls_fields(self) -> None:
        rows = fetch_llm_calls(self.db, 10)
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0]["model"], "gpt-4o-mini")
        self.assertFalse(rows[0]["ok"])
        self.assertIn("total_tokens", rows[0])
        self.assertIn("latency_ms", rows[0])

    def test_fetch_emotions(self) -> None:
        rows = fetch_emotions(self.db, 10)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["mood"], "开心")
        self.assertEqual(rows[0]["valence"], 0.8)

    def test_fetch_memory_stats(self) -> None:
        rows = fetch_memory_stats(self.db, 10)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["facts"], 12)
        self.assertEqual(rows[0]["episodes"], 6)

    def test_fetch_publish_tasks(self) -> None:
        rows = fetch_publish_tasks(self.db, 10)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["title"], "短视频")
        self.assertEqual(rows[0]["status"], "pending")

    def test_missing_database_returns_empty(self) -> None:
        missing = Path(self._tmp.name) / "missing.db"
        self.assertEqual(fetch_conversations(missing), [])
        self.assertEqual(fetch_summary(missing)["today_conversations"], 0)

    def test_limit_is_clamped(self) -> None:
        rows = fetch_llm_calls(self.db, 99999)
        self.assertLessEqual(len(rows), MAX_LIMIT)
        self.assertEqual(len(fetch_llm_calls(self.db, -1)), 1)

    def test_dashboard_api_returns_json(self) -> None:
        api = DashboardApi(self.db)
        self.assertIn('"开心"', api.get_emotions(10))
        self.assertIn('"今日分享"', api.get_publish_tasks(10))


class DashboardFilesTests(unittest.TestCase):
    def test_html_file_exists(self) -> None:
        root = Path(__file__).resolve().parent.parent
        html = root / "dashboard" / "index.html"
        self.assertTrue(html.exists())
        content = html.read_text(encoding="utf-8")
        self.assertIn("static/app.js", content)
        self.assertIn("static/style.css", content)
        self.assertIn("echarts.min.js", content)

    def test_static_assets_exist(self) -> None:
        root = Path(__file__).resolve().parent.parent
        static = root / "dashboard" / "static"
        self.assertTrue((static / "app.js").exists())
        self.assertTrue((static / "style.css").exists())
        self.assertTrue((static / "echarts.min.js").exists())
        self.assertGreater((static / "echarts.min.js").stat().st_size, 100_000)


if __name__ == "__main__":
    unittest.main()
