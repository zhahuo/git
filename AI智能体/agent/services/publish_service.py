"""发布服务：订阅发布事件并把发布任务状态写入本地数据库。"""

from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path
from typing import Any

from ..bus import AgentBus
from ..config import AgentConfig
from ..memory import now_iso
from ..module import Module
from ..social import build_publishers


class PublishStore:
    """保存发布任务状态的轻量 SQLite 存储，默认落到 data/content.db。"""

    _COLUMNS = (
        "id",
        "created_at",
        "updated_at",
        "user_key",
        "source",
        "platform",
        "status",
        "video_path",
        "title",
        "description",
        "tags",
        "dry_run",
        "result",
        "error",
    )

    def __init__(self, db_path: str | Path) -> None:
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
                CREATE TABLE IF NOT EXISTS publish_tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    user_key TEXT NOT NULL DEFAULT '',
                    source TEXT NOT NULL DEFAULT 'publish_requested',
                    platform TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL,
                    video_path TEXT NOT NULL DEFAULT '',
                    title TEXT NOT NULL DEFAULT '',
                    description TEXT NOT NULL DEFAULT '',
                    tags TEXT NOT NULL DEFAULT '[]',
                    dry_run INTEGER NOT NULL DEFAULT 1,
                    result TEXT NOT NULL DEFAULT '',
                    error TEXT NOT NULL DEFAULT ''
                );
                """
            )
            self._conn.commit()

    def create_task(
        self,
        *,
        user_key: str,
        source: str,
        platform: str,
        video_path: str,
        title: str,
        description: str = "",
        tags: list[str] | None = None,
        dry_run: bool = True,
    ) -> int:
        now = now_iso()
        tags_json = json.dumps(tags or [], ensure_ascii=False)
        with self._lock:
            cursor = self._conn.execute(
                """
                INSERT INTO publish_tasks (
                    created_at, updated_at, user_key, source, platform, status,
                    video_path, title, description, tags, dry_run
                ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
                """,
                (
                    now,
                    now,
                    user_key,
                    source,
                    platform,
                    video_path,
                    title,
                    description,
                    tags_json,
                    1 if dry_run else 0,
                ),
            )
            self._conn.commit()
            return int(cursor.lastrowid)

    def update_status(
        self, task_id: int, status: str, result: str = "", error: str = ""
    ) -> None:
        with self._lock:
            self._conn.execute(
                """
                UPDATE publish_tasks
                SET status = ?, result = ?, error = ?, updated_at = ?
                WHERE id = ?
                """,
                (status, result, error, now_iso(), task_id),
            )
            self._conn.commit()

    def finish_task(
        self,
        task_id: int,
        status: str,
        result: str = "",
        error: str = "",
        dry_run: bool | None = None,
    ) -> None:
        if dry_run is None:
            self.update_status(task_id, status, result=result, error=error)
            return
        with self._lock:
            self._conn.execute(
                """
                UPDATE publish_tasks
                SET status = ?, result = ?, error = ?, dry_run = ?, updated_at = ?
                WHERE id = ?
                """,
                (status, result, error, 1 if dry_run else 0, now_iso(), task_id),
            )
            self._conn.commit()

    def get_task(self, task_id: int) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM publish_tasks WHERE id = ?", (task_id,)
            ).fetchone()
        return self._row_to_dict(row) if row is not None else None

    def list_tasks(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM publish_tasks ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        return [self._row_to_dict(row) for row in rows]

    def close(self) -> None:
        with self._lock:
            if self._closed:
                return
            self._conn.close()
            self._closed = True

    def _row_to_dict(self, row: tuple[Any, ...]) -> dict[str, Any]:
        data = dict(zip(self._COLUMNS, row))
        data["tags"] = json.loads(data["tags"] or "[]")
        data["dry_run"] = bool(data["dry_run"])
        return data


class PublishService(Module):
    """订阅 publish_requested / content_ready 并执行短视频发布的异步模块。"""

    name = "publish"

    def __init__(
        self,
        config: AgentConfig | None = None,
        bus: AgentBus | None = None,
        publishers: dict[str, Any] | None = None,
        db_path: str | Path | None = None,
    ) -> None:
        config = config or AgentConfig()
        super().__init__(config, bus or AgentBus())
        self.publishers = (
            publishers if publishers is not None else build_publishers(config)
        )
        self.db_path = (
            Path(db_path)
            if db_path is not None
            else Path(config.data_dir) / "content.db"
        )
        self.store = PublishStore(self.db_path)

    async def start(self) -> None:
        await super().start()
        self.bus.subscribe("publish_requested", self.handle)
        self.bus.subscribe("content_ready", self.handle)

    async def stop(self) -> None:
        if self.bus is not None:
            self.bus.unsubscribe("publish_requested", self.handle)
            self.bus.unsubscribe("content_ready", self.handle)
        self.store.close()
        await super().stop()

    async def handle(self, event: dict[str, Any]) -> None:
        event_type = event.get("type") if isinstance(event, dict) else None
        if event_type == "publish_requested":
            await self._handle_publish_requested(event)
        elif event_type == "content_ready":
            await self._handle_content_ready(event)

    async def _handle_publish_requested(self, event: dict[str, Any]) -> None:
        await self._publish_from_payload(
            dict(event.get("payload") or {}), source="publish_requested"
        )

    async def _handle_content_ready(self, event: dict[str, Any]) -> None:
        payload = dict(event.get("payload") or {})
        if payload.get("ready_to_publish") is not True:
            return
        await self._publish_from_payload(payload, source="content_ready")

    async def _publish_from_payload(
        self, payload: dict[str, Any], source: str
    ) -> None:
        params = self._task_params(payload, source)
        publisher = (
            self.publishers.get(params["platform"]) if params["platform"] else None
        )
        dry_run = self._effective_dry_run(publisher)
        task_id = self.store.create_task(
            user_key=params["user_key"],
            source=params["source"],
            platform=params["platform"],
            video_path=params["video_path"],
            title=params["title"],
            description=params["description"],
            tags=params["tags"],
            dry_run=dry_run,
        )
        error = self._validate(params)
        if error:
            self.store.finish_task(task_id, status="failed", error=error)
            await self._emit_finished(
                params, task_id, status="failed", dry_run=dry_run, error=error
            )
            return
        self.store.update_status(task_id, status="publishing")
        try:
            result = publisher.publish(
                params["video_path"],
                params["title"],
                params["description"],
                tags=params["tags"],
            )
            if isinstance(result, dict) and "dry_run" in result:
                dry_run = bool(result["dry_run"])
            self.store.finish_task(
                task_id,
                status="succeeded",
                result=json.dumps(result, ensure_ascii=False),
                dry_run=dry_run,
            )
            await self._emit_finished(
                params,
                task_id,
                status="succeeded",
                dry_run=dry_run,
                result=result,
            )
        except Exception as exc:
            error = str(exc) or exc.__class__.__name__
            self.store.finish_task(task_id, status="failed", error=error)
            await self._emit_finished(
                params, task_id, status="failed", dry_run=dry_run, error=error
            )

    def _task_params(
        self, payload: dict[str, Any], source: str
    ) -> dict[str, Any]:
        return {
            "user_key": str(payload.get("user_key") or "_agent"),
            "source": str(payload.get("source") or source),
            "platform": str(payload.get("platform") or "").strip().lower(),
            "video_path": str(payload.get("video_path") or "").strip(),
            "title": str(payload.get("title") or "").strip(),
            "description": str(payload.get("description") or "").strip(),
            "tags": self._normalize_tags(payload.get("tags")),
        }

    def _validate(self, params: dict[str, Any]) -> str | None:
        errors: list[str] = []
        if not params["platform"]:
            errors.append("缺少 platform")
        elif params["platform"] not in self.publishers:
            errors.append(f"不支持的平台：{params['platform']}")
        if not params["video_path"]:
            errors.append("缺少 video_path")
        if not params["title"]:
            errors.append("缺少 title")
        return "；".join(errors) or None

    @staticmethod
    def _effective_dry_run(publisher: Any) -> bool:
        if publisher is None:
            return True
        dry_run = getattr(publisher, "dry_run", None)
        return bool(dry_run) if dry_run is not None else True

    @staticmethod
    def _normalize_tags(tags: Any) -> list[str]:
        if tags is None:
            return []
        if isinstance(tags, str):
            return [tags]
        if isinstance(tags, (list, tuple)):
            return [str(tag) for tag in tags if str(tag).strip()]
        return []

    async def _emit_finished(
        self,
        params: dict[str, Any],
        task_id: int,
        *,
        status: str,
        dry_run: bool,
        result: Any = None,
        error: str | None = None,
    ) -> None:
        payload: dict[str, Any] = {
            "user_key": params["user_key"],
            "source": params["source"],
            "task_id": task_id,
            "platform": params["platform"],
            "video_path": params["video_path"],
            "title": params["title"],
            "status": status,
            "dry_run": bool(dry_run),
        }
        if result is not None:
            payload["result"] = result
        if error:
            payload["error"] = error
        if self.bus is not None:
            await self.bus.apublish("publish_finished", payload)
