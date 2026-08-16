from __future__ import annotations

import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

DEFAULT_MONITOR_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "monitor.db"

_TABLES = (
    "conversations",
    "llm_calls",
    "module_heartbeats",
    "emotions",
    "memory_stats",
    "publish_tasks",
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _to_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


class MonitorStore:
    """AI 智能体运行监控数据的 SQLite 存储。"""

    def __init__(self, db_path: str | Path = DEFAULT_MONITOR_DB_PATH) -> None:
        self.db_path = Path(db_path)
        if str(self.db_path) != ":memory:":
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._closed = False
        self._init_schema()

    def _init_schema(self) -> None:
        with self._lock:
            self._conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS conversations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    user_key TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS llm_calls (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    model TEXT NOT NULL,
                    prompt_tokens INTEGER NOT NULL DEFAULT 0,
                    completion_tokens INTEGER NOT NULL DEFAULT 0,
                    total_tokens INTEGER NOT NULL DEFAULT 0,
                    latency_ms INTEGER NOT NULL DEFAULT 0,
                    ok INTEGER NOT NULL DEFAULT 1
                );
                CREATE TABLE IF NOT EXISTS module_heartbeats (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    module TEXT NOT NULL,
                    status TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS emotions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    mood TEXT NOT NULL,
                    valence REAL NOT NULL DEFAULT 0,
                    arousal REAL NOT NULL DEFAULT 0,
                    dominance REAL NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS memory_stats (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    facts INTEGER NOT NULL DEFAULT 0,
                    episodes INTEGER NOT NULL DEFAULT 0,
                    conversations INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS publish_tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    platform TEXT NOT NULL,
                    title TEXT NOT NULL,
                    status TEXT NOT NULL
                );
                """
            )
            self._conn.commit()

    def record_conversation(
        self,
        user_key: str,
        role: str,
        content: str,
        created_at: str | None = None,
    ) -> int:
        with self._lock:
            cursor = self._conn.execute(
                "INSERT INTO conversations (created_at, user_key, role, content) "
                "VALUES (?, ?, ?, ?)",
                (created_at or _now_iso(), str(user_key), str(role), str(content)),
            )
            self._conn.commit()
            return int(cursor.lastrowid)

    def record_llm(
        self,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
        total_tokens: int,
        latency_ms: int,
        ok: bool = True,
        created_at: str | None = None,
    ) -> int:
        with self._lock:
            cursor = self._conn.execute(
                "INSERT INTO llm_calls ("
                "created_at, model, prompt_tokens, completion_tokens, "
                "total_tokens, latency_ms, ok"
                ") VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    created_at or _now_iso(),
                    str(model),
                    _to_int(prompt_tokens),
                    _to_int(completion_tokens),
                    _to_int(total_tokens),
                    _to_int(latency_ms),
                    1 if ok else 0,
                ),
            )
            self._conn.commit()
            return int(cursor.lastrowid)

    def heartbeat(
        self,
        module: str,
        status: str = "running",
        created_at: str | None = None,
    ) -> int:
        with self._lock:
            cursor = self._conn.execute(
                "INSERT INTO module_heartbeats (created_at, module, status) "
                "VALUES (?, ?, ?)",
                (created_at or _now_iso(), str(module), str(status)),
            )
            self._conn.commit()
            return int(cursor.lastrowid)

    def record_emotion(
        self,
        mood: str,
        valence: float,
        arousal: float,
        dominance: float,
        created_at: str | None = None,
    ) -> int:
        with self._lock:
            cursor = self._conn.execute(
                "INSERT INTO emotions (created_at, mood, valence, arousal, dominance) "
                "VALUES (?, ?, ?, ?, ?)",
                (
                    created_at or _now_iso(),
                    str(mood),
                    _to_float(valence),
                    _to_float(arousal),
                    _to_float(dominance),
                ),
            )
            self._conn.commit()
            return int(cursor.lastrowid)

    def snapshot_memory(
        self,
        facts: int,
        episodes: int,
        conversations: int,
        created_at: str | None = None,
    ) -> int:
        with self._lock:
            cursor = self._conn.execute(
                "INSERT INTO memory_stats (created_at, facts, episodes, conversations) "
                "VALUES (?, ?, ?, ?)",
                (
                    created_at or _now_iso(),
                    _to_int(facts),
                    _to_int(episodes),
                    _to_int(conversations),
                ),
            )
            self._conn.commit()
            return int(cursor.lastrowid)

    def record_publish(
        self,
        platform: str,
        title: str,
        status: str,
        created_at: str | None = None,
    ) -> int:
        with self._lock:
            cursor = self._conn.execute(
                "INSERT INTO publish_tasks (created_at, platform, title, status) "
                "VALUES (?, ?, ?, ?)",
                (
                    created_at or _now_iso(),
                    str(platform),
                    str(title),
                    str(status),
                ),
            )
            self._conn.commit()
            return int(cursor.lastrowid)

    def summary(self, hours: int = 24) -> dict[str, Any]:
        hours = max(0, _to_int(hours))
        cutoff = (
            (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat(
                timespec="seconds"
            )
            if hours
            else None
        )
        with self._lock:
            llm_row = self._conn.execute(
                "SELECT COUNT(*), "
                "COALESCE(AVG(latency_ms), 0), "
                "COALESCE(SUM(CASE WHEN ok = 1 THEN 1 ELSE 0 END), 0), "
                "COALESCE(SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END), 0) "
                "FROM llm_calls"
                + (self._cutoff_sql() if cutoff else ""),
                (cutoff,) if cutoff else (),
            ).fetchone()
            result = {
                "hours": hours,
                "conversations": self._count("conversations", cutoff),
                "llm_calls": int(llm_row[0]),
                "avg_latency_ms": float(llm_row[1]),
                "llm_ok": int(llm_row[2]),
                "llm_failed": int(llm_row[3]),
                "module_heartbeats": self._count("module_heartbeats", cutoff),
                "emotions": self._count("emotions", cutoff),
                "memory_stats": self._count("memory_stats", cutoff),
                "publish_tasks": self._count("publish_tasks", cutoff),
            }
        return result

    def cleanup(self, days: int = 30) -> int:
        days = max(0, _to_int(days))
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat(
            timespec="seconds"
        )
        deleted = 0
        with self._lock:
            for table in _TABLES:
                cursor = self._conn.execute(
                    f"DELETE FROM {table} WHERE created_at < ?", (cutoff,)
                )
                deleted += cursor.rowcount
            self._conn.commit()
        return deleted

    def close(self) -> None:
        with self._lock:
            if self._closed:
                return
            self._conn.close()
            self._closed = True

    def _count(self, table: str, cutoff: str | None) -> int:
        sql = f"SELECT COUNT(*) FROM {table}"
        params: tuple[Any, ...] = ()
        if cutoff is not None:
            sql += " WHERE created_at >= ?"
            params = (cutoff,)
        return int(self._conn.execute(sql, params).fetchone()[0])

    @staticmethod
    def _cutoff_sql() -> str:
        return " WHERE created_at >= ?"
