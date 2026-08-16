from __future__ import annotations

import asyncio
from pathlib import Path

from agent.config import AgentConfig
from agent.dashboard import DashboardApi, _db_path


def main() -> None:
    config = AgentConfig.load(Path("config.json"))
    api = DashboardApi(_db_path(config))
    html = Path(__file__).resolve().parent.parent / "dashboard" / "index.html"
    try:
        import webview
    except Exception as exc:
        print(f"pywebview 未安装：{exc}")
        return
    webview.create_window(
        "AI 智能体仪表盘",
        url=str(html),
        js_api=api,
        width=440,
        height=680,
        min_size=(320, 480),
        resizable=True,
        on_top=True,
        easy_drag=True,
    )
    webview.start(http_server=False, private_mode=False)


if __name__ == "__main__":
    main()
