from __future__ import annotations

import re
import sqlite3
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def tokenize(text: str) -> set[str]:
    return set(re.findall(r"[\w\u4e00-\u9fff]+", text.lower()))


@dataclass
class MemoryItem:
    kind: str
    created_at: str
    content: str
    score: float = 0.0


class MemoryStore:
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
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
                CREATE TABLE IF NOT EXISTS episodes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    user_key TEXT NOT NULL,
                    content TEXT NOT NULL,
                    summary TEXT DEFAULT '',
                    sentiment REAL DEFAULT 0,
                    importance REAL DEFAULT 0.5
                );
                CREATE TABLE IF NOT EXISTS facts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    user_key TEXT NOT NULL,
                    category TEXT NOT NULL DEFAULT 'general',
                    content TEXT NOT NULL,
                    confidence REAL DEFAULT 0.8
                );
                CREATE TABLE IF NOT EXISTS emotions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    user_key TEXT NOT NULL,
                    valence REAL NOT NULL,
                    arousal REAL NOT NULL,
                    dominance REAL NOT NULL,
                    mood TEXT NOT NULL,
                    event TEXT NOT NULL
                );
                """
            )
            self._conn.commit()

    def save_exchange(
        self,
        user_key: str,
        role: str,
        content: str,
        created_at: str | None = None,
    ) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO conversations (created_at, user_key, role, content) VALUES (?, ?, ?, ?)",
                (created_at or now_iso(), user_key, role, content),
            )
            self._conn.commit()

    def conversation_users(self) -> list[str]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT DISTINCT user_key FROM conversations ORDER BY user_key"
            ).fetchall()
        return [row[0] for row in rows]

    def conversations_before(
        self, user_key: str, before_iso: str
    ) -> list[dict[str, str | int]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT id, created_at, role, content FROM conversations "
                "WHERE user_key = ? AND created_at < ? ORDER BY id ASC",
                (user_key, before_iso),
            ).fetchall()
        return [
            {"id": row[0], "created_at": row[1], "role": row[2], "content": row[3]}
            for row in rows
        ]

    def delete_conversations_before(self, user_key: str, before_iso: str) -> int:
        with self._lock:
            cursor = self._conn.execute(
                "DELETE FROM conversations WHERE user_key = ? AND created_at < ?",
                (user_key, before_iso),
            )
            self._conn.commit()
            return cursor.rowcount

    def save_episode(
        self,
        user_key: str,
        content: str,
        summary: str = "",
        sentiment: float = 0.0,
        importance: float = 0.5,
    ) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO episodes (created_at, user_key, content, summary, sentiment, importance) VALUES (?, ?, ?, ?, ?, ?)",
                (now_iso(), user_key, content, summary, sentiment, importance),
            )
            self._conn.commit()

    def remember_fact(
        self, user_key: str, content: str, category: str = "general", confidence: float = 0.8
    ) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO facts (created_at, user_key, category, content, confidence) VALUES (?, ?, ?, ?, ?)",
                (now_iso(), user_key, category, content, confidence),
            )
            self._conn.commit()

    def dedupe_facts(self) -> int:
        with self._lock:
            cursor = self._conn.execute(
                "DELETE FROM facts WHERE id NOT IN "
                "(SELECT MIN(id) FROM facts GROUP BY user_key, category, content)"
            )
            self._conn.commit()
            return cursor.rowcount

    def log_emotion(
        self,
        user_key: str,
        valence: float,
        arousal: float,
        dominance: float,
        mood: str,
        event: str,
    ) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO emotions (created_at, user_key, valence, arousal, dominance, mood, event) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (now_iso(), user_key, valence, arousal, dominance, mood, event),
            )
            self._conn.commit()

    def recall(self, user_key: str, query: str, limit: int = 8) -> list[MemoryItem]:
        tokens = tokenize(query)
        with self._lock:
            conv_rows = self._conn.execute(
                "SELECT created_at, role, content FROM conversations WHERE user_key = ? ORDER BY id DESC LIMIT 50",
                (user_key,),
            ).fetchall()
            episode_rows = self._conn.execute(
                "SELECT created_at, content FROM episodes WHERE user_key = ? ORDER BY id DESC LIMIT 50",
                (user_key,),
            ).fetchall()
            fact_rows = self._conn.execute(
                "SELECT created_at, category, content FROM facts WHERE user_key = ? ORDER BY id DESC LIMIT 100",
                (user_key,),
            ).fetchall()

        candidates: list[tuple[str, str, str]] = []
        for created_at, role, content in conv_rows:
            candidates.append(("对话", created_at, f"{role}: {content}"))
        for created_at, content in episode_rows:
            candidates.append(("事件", created_at, content))
        for created_at, category, content in fact_rows:
            candidates.append(("记忆", created_at, f"[{category}] {content}"))

        scored: list[tuple[float, str, str, str]] = []
        for kind, created_at, content in candidates:
            overlap = len(tokens & tokenize(content))
            base = 1.0 if kind == "记忆" else 0.4
            scored.append((overlap * 3.0 + base, created_at, kind, content))
        scored.sort(key=lambda row: row[1], reverse=True)
        scored.sort(key=lambda row: -row[0])
        return [
            MemoryItem(kind=kind, created_at=created_at, content=content, score=score)
            for score, created_at, kind, content in scored[:limit]
        ]

    def profile(self, user_key: str) -> dict[str, list[str]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT category, content FROM facts WHERE user_key = ? ORDER BY created_at DESC",
                (user_key,),
            ).fetchall()
        grouped: dict[str, list[str]] = {}
        for category, content in rows:
            grouped.setdefault(category, []).append(content)
        return grouped

    def mood_history(self, user_key: str, limit: int = 30) -> list[dict[str, str | float]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT created_at, valence, arousal, dominance, mood, event FROM emotions WHERE user_key = ? ORDER BY id DESC LIMIT ?",
                (user_key, limit),
            ).fetchall()
        history = []
        for created_at, valence, arousal, dominance, mood, event in reversed(rows):
            history.append(
                {
                    "created_at": created_at,
                    "valence": valence,
                    "arousal": arousal,
                    "dominance": dominance,
                    "mood": mood,
                    "event": event,
                }
            )
        return history

    def close(self) -> None:
        with self._lock:
            self._conn.close()
