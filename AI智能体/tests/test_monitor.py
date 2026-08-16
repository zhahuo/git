from __future__ import annotations

import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from agent.monitor import MonitorStore


class MonitorStoreTests(unittest.TestCase):
    def _old_iso(self, days: int) -> str:
        return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat(
            timespec="seconds"
        )

    def test_schema_and_record_methods(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = MonitorStore(Path(tmp) / "monitor.db")
            try:
                conversation_id = store.record_conversation("u1", "user", "你好")
                llm_id = store.record_llm(
                    "gpt-4o-mini", 10, 20, 30, 5, ok=True
                )
                heartbeat_id = store.heartbeat("monitor", "running")
                emotion_id = store.record_emotion("开心", 0.8, 0.6, 0.7)
                memory_id = store.snapshot_memory(3, 2, 1)
                publish_id = store.record_publish(
                    "douyin", "演示标题", "succeeded"
                )
                ids = (
                    conversation_id,
                    llm_id,
                    heartbeat_id,
                    emotion_id,
                    memory_id,
                    publish_id,
                )
                self.assertTrue(all(item > 0 for item in ids))

                conn = sqlite3.connect(str(store.db_path))
                try:
                    tables = {
                        row[0]
                        for row in conn.execute(
                            "SELECT name FROM sqlite_master WHERE type = 'table'"
                        )
                    }
                    expected = {
                        "conversations",
                        "llm_calls",
                        "module_heartbeats",
                        "emotions",
                        "memory_stats",
                        "publish_tasks",
                    }
                    self.assertTrue(expected.issubset(tables))
                    row = conn.execute(
                        "SELECT * FROM llm_calls WHERE id = ?", (llm_id,)
                    ).fetchone()
                    self.assertEqual(row[2], "gpt-4o-mini")
                    self.assertEqual(row[7], 1)
                finally:
                    conn.close()

                summary = store.summary(hours=24)
                self.assertEqual(summary["conversations"], 1)
                self.assertEqual(summary["llm_calls"], 1)
                self.assertEqual(summary["llm_ok"], 1)
                self.assertEqual(summary["module_heartbeats"], 1)
                self.assertEqual(summary["emotions"], 1)
                self.assertEqual(summary["memory_stats"], 1)
                self.assertEqual(summary["publish_tasks"], 1)
            finally:
                store.close()

    def test_summary_respects_hours(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = MonitorStore(Path(tmp) / "monitor.db")
            try:
                store.record_conversation(
                    "u1",
                    "user",
                    "旧消息",
                    created_at=self._old_iso(2),
                )
                store.record_conversation("u1", "user", "新消息")
                recent = store.summary(hours=1)
                self.assertEqual(recent["conversations"], 1)
                all_time = store.summary(hours=0)
                self.assertEqual(all_time["conversations"], 2)
            finally:
                store.close()

    def test_cleanup_removes_only_old_records(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = MonitorStore(Path(tmp) / "monitor.db")
            try:
                store.record_llm(
                    "gpt-4o-mini",
                    10,
                    20,
                    30,
                    5,
                    ok=True,
                    created_at=self._old_iso(31),
                )
                store.record_llm(
                    "gpt-4o-mini",
                    10,
                    20,
                    30,
                    5,
                    ok=True,
                    created_at=self._old_iso(1),
                )
                deleted = store.cleanup(days=30)
                self.assertEqual(deleted, 1)
                self.assertEqual(store.summary(hours=0)["llm_calls"], 1)
            finally:
                store.close()


if __name__ == "__main__":
    unittest.main()
