from __future__ import annotations

import json
import os
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from agent.config import AgentConfig
from agent.dashboard import (
    _db_path,
    fetch_bus_events,
    fetch_conversations,
    fetch_emotions,
    fetch_llm_calls,
    fetch_logs,
    fetch_memory_stats,
    fetch_module_statuses,
    fetch_publish_tasks,
    fetch_summary,
    public_config,
)

DASHBOARD_DIR = Path(__file__).resolve().parent.parent / "dashboard"
STATIC_DIR = DASHBOARD_DIR / "static"
INDEX_PATH = DASHBOARD_DIR / "index.html"
DEFAULT_PORT = int(os.getenv("DASHBOARD_PORT", "8765"))

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".woff2": "font/woff2",
}


def _query_int(raw: str | None, default: int = 50) -> int:
    if raw is None:
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


def create_dashboard_server(
    host: str = "127.0.0.1",
    port: int = DEFAULT_PORT,
    config: AgentConfig | None = None,
    db_path: str | Path | None = None,
) -> ThreadingHTTPServer:
    config = config or AgentConfig.load(Path("config.json"))
    db_path = Path(db_path) if db_path else _db_path(config)

    class DashboardHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            parsed = urllib.parse.urlparse(self.path)
            query = urllib.parse.parse_qs(parsed.query)
            limit = _query_int((query.get("limit") or [None])[0])
            level = (query.get("level") or [None])[0]
            event_type = (query.get("type") or [None])[0]

            routes: dict[str, Any] = {
                "/api/summary": fetch_summary(db_path),
                "/api/conversations": fetch_conversations(db_path, limit),
                "/api/llm_calls": fetch_llm_calls(db_path, limit),
                "/api/emotions": fetch_emotions(db_path, limit),
                "/api/memory_stats": fetch_memory_stats(db_path, limit),
                "/api/publish_tasks": fetch_publish_tasks(db_path, limit),
                "/api/logs": fetch_logs(db_path, limit, level),
                "/api/bus_events": fetch_bus_events(
                    db_path, limit, event_type
                ),
                "/api/module_statuses": fetch_module_statuses(db_path),
                "/api/config": public_config(config),
            }
            if parsed.path in routes:
                self._send_json(routes[parsed.path])
                return
            if parsed.path in ("/", "/index.html"):
                self._send_file(INDEX_PATH, CONTENT_TYPES[".html"])
                return
            if parsed.path.startswith("/static/"):
                target = (STATIC_DIR / parsed.path[len("/static/") :]).resolve()
                static_root = STATIC_DIR.resolve()
                if (
                    static_root not in target.parents
                    or not target.is_file()
                ):
                    self.send_error(404)
                    return
                content_type = CONTENT_TYPES.get(
                    target.suffix.lower(), "application/octet-stream"
                )
                self._send_file(target, content_type)
                return
            self.send_error(404)

        def _send_json(self, payload: Any) -> None:
            raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def _send_file(self, path: Path, content_type: str) -> None:
            raw = path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def log_message(self, format: str, *args: Any) -> None:
            return

    return ThreadingHTTPServer((host, port), DashboardHandler)


def main() -> None:
    port = int(os.getenv("DASHBOARD_PORT", str(DEFAULT_PORT)))
    server = create_dashboard_server(port=port)
    print(f"仪表盘地址：http://127.0.0.1:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
