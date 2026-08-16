from __future__ import annotations

import json
import logging
import signal
import sqlite3
import threading
from datetime import datetime
from pathlib import Path
from typing import Any

try:
    import webview

    PYWEBVIEW_AVAILABLE = True
except Exception:  # pragma: no cover - depends on local install
    webview = None
    PYWEBVIEW_AVAILABLE = False

from agent.module import Module

logger = logging.getLogger(__name__)

DEFAULT_LIMIT = 50
MAX_LIMIT = 200


def _db_path(config: Any) -> Path:
    if config is not None and hasattr(config, "data_dir"):
        return Path(config.data_dir) / "monitor.db"
    return Path(__file__).resolve().parent.parent / "data" / "monitor.db"


def _clamp_limit(limit: int | None) -> int:
    if not isinstance(limit, int) or isinstance(limit, bool):
        return DEFAULT_LIMIT
    return max(1, min(limit, MAX_LIMIT))


def _query(db_path: Path | str, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    db_path = Path(db_path)
    if not db_path.exists():
        return []
    try:
        conn = sqlite3.connect(str(db_path))
        try:
            conn.execute("PRAGMA query_only = ON")
            conn.row_factory = sqlite3.Row
            rows = conn.execute(sql, params).fetchall()
        finally:
            conn.close()
        return [dict(row) for row in rows]
    except sqlite3.Error:
        logger.exception("dashboard query failed: %s", sql)
        return []


def fetch_summary(db_path: Path | str) -> dict[str, Any]:
    today = datetime.now().strftime("%Y-%m-%d")
    conversations = _query(
        db_path,
        "SELECT COUNT(*) AS total FROM conversations WHERE substr(created_at, 1, 10) = ?",
        (today,),
    )
    llm_rows = _query(
        db_path,
        "SELECT total_tokens, ok FROM llm_calls",
    )
    total_tokens = sum(row.get("total_tokens") or 0 for row in llm_rows)
    ok_calls = sum(1 for row in llm_rows if row.get("ok"))

    latest_emotion = _query(
        db_path,
        "SELECT mood, valence, arousal, dominance FROM emotions ORDER BY created_at DESC, id DESC LIMIT 1",
    )
    latest_heartbeat = _query(
        db_path,
        "SELECT module, status FROM module_heartbeats ORDER BY created_at DESC, id DESC LIMIT 1",
    )
    emotion = latest_emotion[0] if latest_emotion else {}
    heartbeat = latest_heartbeat[0] if latest_heartbeat else {}
    return {
        "total_tokens": total_tokens,
        "today_conversations": conversations[0]["total"] if conversations else 0,
        "total_llm_calls": len(llm_rows),
        "ok_llm_calls": ok_calls,
        "mood": emotion.get("mood") or "未知",
        "valence": emotion.get("valence"),
        "arousal": emotion.get("arousal"),
        "dominance": emotion.get("dominance"),
        "module": heartbeat.get("module") or "-",
        "status": heartbeat.get("status") or "未知",
    }


def fetch_conversations(db_path: Path | str, limit: int | None = None) -> list[dict[str, Any]]:
    return _query(
        db_path,
        "SELECT id, created_at, user_key, role, content FROM conversations "
        "ORDER BY created_at DESC, id DESC LIMIT ?",
        (_clamp_limit(limit),),
    )


def fetch_llm_calls(db_path: Path | str, limit: int | None = None) -> list[dict[str, Any]]:
    return _query(
        db_path,
        "SELECT id, created_at, model, prompt_tokens, completion_tokens, total_tokens, "
        "latency_ms, ok FROM llm_calls ORDER BY created_at DESC, id DESC LIMIT ?",
        (_clamp_limit(limit),),
    )


def fetch_emotions(db_path: Path | str, limit: int | None = None) -> list[dict[str, Any]]:
    return _query(
        db_path,
        "SELECT id, created_at, mood, valence, arousal, dominance FROM emotions "
        "ORDER BY created_at DESC, id DESC LIMIT ?",
        (_clamp_limit(limit),),
    )


def fetch_memory_stats(db_path: Path | str, limit: int | None = None) -> list[dict[str, Any]]:
    return _query(
        db_path,
        "SELECT id, created_at, facts, episodes, conversations FROM memory_stats "
        "ORDER BY created_at DESC, id DESC LIMIT ?",
        (_clamp_limit(limit),),
    )


def fetch_publish_tasks(db_path: Path | str, limit: int | None = None) -> list[dict[str, Any]]:
    return _query(
        db_path,
        "SELECT id, created_at, platform, title, status FROM publish_tasks "
        "ORDER BY created_at DESC, id DESC LIMIT ?",
        (_clamp_limit(limit),),
    )


class DashboardModule(Module):
    """桌面悬浮窗仪表盘，读取 data/monitor.db 并实时展示。"""

    name = "dashboard"

    def __init__(self, config: Any = None, bus: Any = None) -> None:
        super().__init__(config=config, bus=bus)
        self.db_path = _db_path(config)
        self._window: Any = None
        self._gui_thread: threading.Thread | None = None

    def _api(self) -> "DashboardApi":
        return DashboardApi(self.db_path)

    async def start(self) -> None:
        if not PYWEBVIEW_AVAILABLE:
            logger.warning("pywebview 未安装，跳过悬浮窗仪表盘")
            return
        if self.running:
            return
        await super().start()
        html_path = Path(__file__).resolve().parent.parent / "dashboard" / "index.html"
        api = self._api()

        def _run_gui() -> None:
            original_signal = signal.signal
            try:
                # pywebview 按线程名检查主线程；在后台线程运行 GUI 循环以配合 asyncio 运行器。
                threading.current_thread().name = "MainThread"
                # winforms 后端在非主线程注册 Ctrl+C 信号处理器会失败；窗口显示不受影响。
                if threading.current_thread() is not threading.main_thread():
                    def _noop_signal(signum: int, handler: Any) -> Any:
                        return handler

                    signal.signal = _noop_signal  # type: ignore[assignment]
                self._window = webview.create_window(
                    "AI 智能体仪表盘",
                    url=str(html_path),
                    js_api=api,
                    width=440,
                    height=680,
                    min_size=(320, 480),
                    resizable=True,
                    on_top=True,
                    easy_drag=True,
                )
                webview.start(http_server=False, private_mode=False)
            except Exception:
                logger.exception("pywebview 启动失败")
            finally:
                if threading.current_thread() is not threading.main_thread():
                    signal.signal = original_signal  # type: ignore[assignment]
                self.running = False

        self._gui_thread = threading.Thread(target=_run_gui, name="dashboard-gui", daemon=True)
        self._gui_thread.start()

    async def stop(self) -> None:
        if not self.running:
            return
        await super().stop()
        window = self._window
        self._window = None
        if window is not None:
            try:
                window.destroy()
            except Exception:
                logger.exception("关闭仪表盘窗口失败")
        thread = self._gui_thread
        self._gui_thread = None
        if thread is not None and thread.is_alive():
            thread.join(timeout=3.0)

    async def handle(self, event: dict[str, Any]) -> None:
        # 仪表盘只读展示监控数据，不消费业务事件。
        logger.debug("dashboard ignored event: %s", event.get("type"))


class DashboardApi:
    """pywebview js_api：前端轮询时调用的数据接口。"""

    def __init__(self, db_path: Path | str) -> None:
        self.db_path = Path(db_path)

    def get_summary(self) -> str:
        return json.dumps(fetch_summary(self.db_path), ensure_ascii=False)

    def get_conversations(self, limit: int | None = None) -> str:
        return json.dumps(fetch_conversations(self.db_path, limit), ensure_ascii=False)

    def get_llm_calls(self, limit: int | None = None) -> str:
        return json.dumps(fetch_llm_calls(self.db_path, limit), ensure_ascii=False)

    def get_emotions(self, limit: int | None = None) -> str:
        return json.dumps(fetch_emotions(self.db_path, limit), ensure_ascii=False)

    def get_memory_stats(self, limit: int | None = None) -> str:
        return json.dumps(fetch_memory_stats(self.db_path, limit), ensure_ascii=False)

    def get_publish_tasks(self, limit: int | None = None) -> str:
        return json.dumps(fetch_publish_tasks(self.db_path, limit), ensure_ascii=False)
