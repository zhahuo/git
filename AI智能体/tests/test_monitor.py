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
                        "logs",
                        "bus_events",
                        "module_status",
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

    def test_debug_tables_record_and_upsert(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = MonitorStore(Path(tmp) / "monitor.db")
            try:
                log_id = store.record_log("WARNING", "agent.brain", "测试日志")
                event_id = store.record_event(
                    "user_message", {"user_key": "u1", "message": "你好"}
                )
                self.assertGreater(log_id, 0)
                self.assertGreater(event_id, 0)

                store.upsert_module_status("brain", "running", "BrainModule")
                store.upsert_module_status("brain", "stopped", "BrainModule")
                conn = sqlite3.connect(str(store.db_path))
                try:
                    row = conn.execute(
                        "SELECT status, detail FROM module_status WHERE module = ?",
                        ("brain",),
                    ).fetchone()
                    self.assertEqual(row, ("stopped", "BrainModule"))
                    log_row = conn.execute(
                        "SELECT level, logger, message FROM logs WHERE id = ?",
                        (log_id,),
                    ).fetchone()
                    self.assertEqual(
                        log_row, ("WARNING", "agent.brain", "测试日志")
                    )
                    event_row = conn.execute(
                        "SELECT event_type, payload_json FROM bus_events WHERE id = ?",
                        (event_id,),
                    ).fetchone()
                    self.assertEqual(event_row[0], "user_message")
                    self.assertIn("你好", event_row[1])
                finally:
                    conn.close()
            finally:
                store.close()

    def test_debug_cleanup_removes_old_records(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = MonitorStore(Path(tmp) / "monitor.db")
            try:
                store.record_log(
                    "INFO",
                    "agent",
                    "旧日志",
                    created_at=self._old_iso(31),
                )
                store.record_log("INFO", "agent", "新日志")
                deleted = store.cleanup(days=30)
                self.assertGreaterEqual(deleted, 1)
                conn = sqlite3.connect(str(store.db_path))
                try:
                    count = conn.execute(
                        "SELECT COUNT(*) FROM logs WHERE message = '新日志'"
                    ).fetchone()[0]
                finally:
                    conn.close()
                self.assertEqual(count, 1)
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
