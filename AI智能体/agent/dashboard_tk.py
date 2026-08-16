from __future__ import annotations

import tkinter as tk
import os
from pathlib import Path
from typing import Any

from .dashboard import (
    _db_path,
    fetch_conversations,
    fetch_emotions,
    fetch_llm_calls,
    fetch_memory_stats,
    fetch_publish_tasks,
    fetch_summary,
)


class DashboardTk:
    def __init__(self, root: tk.Tk, db_path: Path) -> None:
        self.root = root
        self.db_path = db_path
        self.root.title("AI 智能体仪表盘")
        self.root.geometry("460x720+120+120")
        self.root.attributes("-topmost", True)
        self.root.configure(bg="#f6f2ec")
        self._build_ui()
        self.refresh()

    def _build_ui(self) -> None:
        header = tk.Frame(self.root, bg="#f6f2ec")
        header.pack(fill="x", padx=12, pady=(10, 4))
        tk.Label(
            header,
            text="AI 智能体仪表盘",
            font=("Microsoft YaHei UI", 15, "bold"),
            bg="#f6f2ec",
            fg="#3b302a",
        ).pack(side="left")
        self.status_label = tk.Label(
            header,
            text="",
            font=("Microsoft YaHei UI", 10),
            bg="#f6f2ec",
            fg="#6b5b50",
        )
        self.status_label.pack(side="right")

        self.summary_frame = tk.Frame(self.root, bg="#f6f2ec")
        self.summary_frame.pack(fill="x", padx=12, pady=4)
        self.summary_labels: dict[str, tk.Label] = {}
        for key, text in (
            ("tokens", "Token 0"),
            ("today", "今日 0"),
            ("mood", "情绪 未知"),
            ("module", "模块 -"),
        ):
            label = tk.Label(
                self.summary_frame,
                text=text,
                font=("Microsoft YaHei UI", 10),
                bg="#fffdf9",
                fg="#3b302a",
                relief="groove",
                padx=8,
                pady=6,
            )
            label.pack(side="left", fill="x", expand=True, padx=3)
            self.summary_labels[key] = label

        self.canvas = tk.Canvas(
            self.root,
            width=430,
            height=150,
            bg="#fffdf9",
            highlightthickness=0,
        )
        self.canvas.pack(fill="x", padx=12, pady=8)

        list_frame = tk.Frame(self.root, bg="#f6f2ec")
        list_frame.pack(fill="both", expand=True, padx=12, pady=4)
        self.text = tk.Text(
            list_frame,
            font=("Microsoft YaHei UI", 9),
            bg="#fffdf9",
            fg="#3b302a",
            relief="groove",
            state="disabled",
            wrap="word",
        )
        scroll = tk.Scrollbar(list_frame, command=self.text.yview)
        self.text.configure(yscrollcommand=scroll.set)
        scroll.pack(side="right", fill="y")
        self.text.pack(fill="both", expand=True)

    def refresh(self) -> None:
        summary = fetch_summary(self.db_path)
        self.summary_labels["tokens"].config(
            text=f"Token {summary.get('total_tokens', 0)}"
        )
        self.summary_labels["today"].config(
            text=f"今日 {summary.get('today_conversations', 0)}"
        )
        self.summary_labels["mood"].config(
            text=f"情绪 {summary.get('mood', '未知')}"
        )
        self.summary_labels["module"].config(
            text=f"{summary.get('module', '-')} {summary.get('status', '未知')}"
        )
        self._draw_charts()
        self._fill_lists()
        seconds = float(os.getenv("DASHBOARD_REFRESH_SECONDS", "10") or "10")
        self.root.after(max(1000, int(seconds * 1000)), self.refresh)

    def _draw_charts(self) -> None:
        canvas = self.canvas
        canvas.delete("all")
        width = int(canvas["width"])
        height = int(canvas["height"])
        llm = fetch_llm_calls(self.db_path, 60)[::-1]
        emotions = fetch_emotions(self.db_path, 60)[::-1]
        memory = fetch_memory_stats(self.db_path, 60)[::-1]
        self._line(
            canvas,
            [row.get("total_tokens") or 0 for row in llm],
            width,
            height // 3,
            "#c96f4a",
            "Token",
        )
        self._line(
            canvas,
            [row.get("valence") or 0 for row in emotions],
            width,
            height // 3,
            "#5a8f7b",
            "情绪",
            offset=height // 3,
        )
        self._line(
            canvas,
            [row.get("conversations") or 0 for row in memory],
            width,
            height // 3,
            "#7b6a9f",
            "记忆",
            offset=height * 2 // 3,
        )

    @staticmethod
    def _line(
        canvas: tk.Canvas,
        values: list[float],
        width: int,
        height: int,
        color: str,
        label: str,
        offset: int = 0,
    ) -> None:
        canvas.create_text(
            8,
            offset + 10,
            text=label,
            anchor="nw",
            fill=color,
            font=("Microsoft YaHei UI", 9, "bold"),
        )
        if not values:
            return
        max_v = max(max(values), 1)
        min_v = min(min(values), 0)
        span = max(max_v - min_v, 1)
        points = []
        step = max(width / max(len(values), 1), 1)
        for i, value in enumerate(values):
            x = i * step
            y = offset + height - ((value - min_v) / span) * (height - 16) - 8
            points.append((x, y))
        for (x1, y1), (x2, y2) in zip(points, points[1:]):
            canvas.create_line(x1, y1, x2, y2, fill=color, width=2)

    def _fill_lists(self) -> None:
        conversations = fetch_conversations(self.db_path, 5)
        llm = fetch_llm_calls(self.db_path, 5)
        publish = fetch_publish_tasks(self.db_path, 5)
        lines = ["== 最近对话 =="]
        for row in conversations:
            role = "用户" if row.get("role") == "user" else "AI"
            content = (row.get("content") or "").replace("\n", " ")
            lines.append(f"{role}: {content[:60]}")
        lines.append("")
        lines.append("== 最近模型调用 ==")
        for row in llm:
            lines.append(
                f"{row.get('model')} token={row.get('total_tokens')} "
                f"延迟={row.get('latency_ms')}ms"
            )
        lines.append("")
        lines.append("== 最近发布 ==")
        for row in publish:
            lines.append(
                f"{row.get('platform')} [{row.get('status')}] {row.get('title')}"
            )
        self.text.configure(state="normal")
        self.text.delete("1.0", "end")
        self.text.insert("1.0", "\n".join(lines))
        self.text.configure(state="disabled")


def run_dashboard(config: Any) -> None:
    root = tk.Tk()
    DashboardTk(root, _db_path(config))
    root.mainloop()
