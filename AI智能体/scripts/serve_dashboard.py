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
    fetch_conversations,
    fetch_emotions,
    fetch_llm_calls,
    fetch_memory_stats,
    fetch_publish_tasks,
    fetch_summary,
)

PORT = int(os.getenv("DASHBOARD_PORT", "8765"))
CONFIG = AgentConfig.load(Path("config.json"))
DB = _db_path(CONFIG)

INDEX_HTML = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>AI 智能体仪表盘</title>
<style>
body{font-family:"Microsoft YaHei UI",sans-serif;background:#f6f2ec;color:#3b302a;margin:0;padding:24px}
h1{font-size:22px;margin:0 0 16px}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.card{background:#fffdf9;border:1px solid #e5ddd4;border-radius:8px;padding:14px}
.card .v{font-size:22px;font-weight:700;margin-top:6px}
.section{background:#fffdf9;border:1px solid #e5ddd4;border-radius:8px;padding:14px;margin-top:16px}
pre{white-space:pre-wrap;font-size:13px;line-height:1.6;margin:0}
</style>
</head>
<body>
<h1>AI 智能体仪表盘</h1>
<div class="cards" id="cards"></div>
<div class="section"><b>最近对话</b><pre id="conversations"></pre></div>
<div class="section"><b>最近模型调用</b><pre id="llm"></pre></div>
<div class="section"><b>最近发布</b><pre id="publish"></pre></div>
<script>
async function get(path){const r=await fetch(path);return r.json()}
function fmt(list){return list.map(x=>JSON.stringify(x)).join('\\n') || '暂无'}
async function refresh(){
  const s=await get('/api/summary');
  document.getElementById('cards').innerHTML=
    card('总 Token',s.total_tokens)+
    card('今日对话',s.today_conversations)+
    card('当前情绪',s.mood)+
    card('模块状态',s.module+' / '+s.status);
  document.getElementById('conversations').textContent=fmt(await get('/api/conversations?limit=5'));
  document.getElementById('llm').textContent=fmt(await get('/api/llm_calls?limit=5'));
  document.getElementById('publish').textContent=fmt(await get('/api/publish_tasks?limit=5'));
}
function card(label,value){return '<div class="card"><div>'+label+'</div><div class="v">'+value+'</div></div>'}
refresh();setInterval(refresh,10000);
</script>
</body>
</html>"""


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)
        limit = int(query.get("limit", ["10"])[0]) if query.get("limit") else 10
        routes: dict[str, Any] = {
            "/": INDEX_HTML,
            "/index.html": INDEX_HTML,
            "/api/summary": fetch_summary(DB),
            "/api/conversations": fetch_conversations(DB, limit),
            "/api/llm_calls": fetch_llm_calls(DB, limit),
            "/api/emotions": fetch_emotions(DB, limit),
            "/api/memory_stats": fetch_memory_stats(DB, limit),
            "/api/publish_tasks": fetch_publish_tasks(DB, limit),
        }
        if parsed.path not in routes:
            self.send_error(404)
            return
        body = routes[parsed.path]
        if parsed.path.startswith("/api/"):
            raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
        else:
            raw = body.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

    def log_message(self, format: str, *args: Any) -> None:
        return


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"仪表盘地址：http://127.0.0.1:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
