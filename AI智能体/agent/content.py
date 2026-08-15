from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

STATUS_DRAFT = "draft"
STATUS_PUBLISHED = "published"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class ContentStore:
    """SQLite 草稿存储，供内容服务与发布服务共享。"""

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._init_schema()

    def _init_schema(self) -> None:
        with self._lock:
            self._conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS drafts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'draft',
                    ready_to_publish INTEGER NOT NULL DEFAULT 1,
                    topic TEXT NOT NULL,
                    title TEXT NOT NULL,
                    script TEXT NOT NULL,
                    tags TEXT NOT NULL DEFAULT '[]',
                    cover_prompt TEXT NOT NULL
                );
                """
            )
            self._conn.commit()

    def save_draft(self, draft: Mapping[str, Any]) -> int:
        with self._lock:
            cursor = self._conn.execute(
                "INSERT INTO drafts "
                "(created_at, status, ready_to_publish, topic, title, script, tags, cover_prompt) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    now_iso(),
                    draft.get("status") or STATUS_DRAFT,
                    1 if draft.get("ready_to_publish", True) else 0,
                    (draft.get("topic") or "").strip(),
                    (draft.get("title") or "").strip(),
                    (draft.get("script") or "").strip(),
                    json.dumps(draft.get("tags") or [], ensure_ascii=False),
                    (draft.get("cover_prompt") or "").strip(),
                ),
            )
            self._conn.commit()
            return int(cursor.lastrowid)

    def get_drafts(
        self, status: str | None = STATUS_DRAFT, limit: int = 50
    ) -> list[dict[str, Any]]:
        with self._lock:
            if status is None:
                rows = self._conn.execute(
                    "SELECT * FROM drafts ORDER BY id DESC LIMIT ?", (limit,)
                ).fetchall()
            else:
                rows = self._conn.execute(
                    "SELECT * FROM drafts WHERE status = ? ORDER BY id DESC LIMIT ?",
                    (status, limit),
                ).fetchall()
        return [self._row_to_dict(row) for row in rows]

    def update_status(
        self, draft_id: int, status: str, ready_to_publish: bool | None = None
    ) -> None:
        with self._lock:
            if ready_to_publish is None:
                self._conn.execute(
                    "UPDATE drafts SET status = ? WHERE id = ?", (status, draft_id)
                )
            else:
                self._conn.execute(
                    "UPDATE drafts SET status = ?, ready_to_publish = ? WHERE id = ?",
                    (status, 1 if ready_to_publish else 0, draft_id),
                )
            self._conn.commit()

    def count_drafts(self) -> int:
        with self._lock:
            row = self._conn.execute("SELECT COUNT(*) FROM drafts").fetchone()
        return int(row[0])

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def _row_to_dict(self, row: sqlite3.Row) -> dict[str, Any]:
        item = dict(row)
        try:
            tags = json.loads(item.get("tags") or "[]")
            item["tags"] = tags if isinstance(tags, list) else []
        except json.JSONDecodeError:
            item["tags"] = []
        item["ready_to_publish"] = bool(item["ready_to_publish"])
        return item
