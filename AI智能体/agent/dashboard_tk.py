from __future__ import annotations

import os
import tkinter as tk
from pathlib import Path
from tkinter import ttk
from typing import Any

from .dashboard import (
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

BG = "#f6f2ec"
CARD_BG = "#fffdf9"
INK = "#3b302a"
MUTED = "#6b5b50"
ACCENT = "#c96f4a"
EMOTION = "#5a8f7b"
MEMORY = "#7b6a9f"


class DashboardTk:
    def __init__(self, root: tk.Tk, db_path: Path, config: Any = None) -> None:
        self.root = root
        self.db_path = db_path
        self.config = config
        self.root.title("AI 智能体仪表盘")
        self.root.geometry("480x760+120+120")
        self.root.attributes("-topmost", True)
        self.root.configure(bg=BG)
        self._build_ui()
        self.refresh()

    def _build_ui(self) -> None:
        header = tk.Frame(self.root, bg=BG)
        header.pack(fill="x", padx=12, pady=(10, 6))
        tk.Label(
            header,
            text="AI 智能体仪表盘",
            font=("Microsoft YaHei UI", 15, "bold"),
            bg=BG,
            fg=INK,
        ).pack(side="left")

        card_frame = tk.Frame(self.root, bg=BG)
        card_frame.pack(fill="x", padx=12)
        self.cards: dict[str, tk.Label] = {}
        for key, text in (
            ("tokens", "总 Token\n0"),
            ("today", "今日对话\n0"),
            ("mood", "当前情绪\n未知"),
            ("module", "模块状态\n-"),
        ):
            frame = tk.Frame(
                card_frame,
                bg=CARD_BG,
                highlightbackground="#e5ddd4",
                highlightthickness=1,
                padx=8,
                pady=8,
            )
            frame.pack(side="left", fill="x", expand=True, padx=3)
            label = tk.Label(
                frame,
                text=text,
                font=("Microsoft YaHei UI", 9),
                bg=CARD_BG,
                fg=INK,
                justify="center",
            )
            label.pack(fill="x")
            self.cards[key] = label

        chart_header = tk.Label(
            self.root,
            text="实时趋势",
            font=("Microsoft YaHei UI", 10, "bold"),
            bg=BG,
            fg=INK,
            anchor="w",
        )
        chart_header.pack(fill="x", padx=14, pady=(12, 2))

        self.charts: dict[str, tk.Canvas] = {}
        for key, color, label in (
            ("tokens", ACCENT, "Token 消耗"),
            ("emotions", EMOTION, "情绪曲线"),
            ("memory", MEMORY, "记忆量"),
        ):
            canvas = tk.Canvas(
                self.root,
                height=90,
                bg=CARD_BG,
                highlightthickness=0,
            )
            canvas.pack(fill="x", padx=12, pady=3)
            canvas.create_text(
                8,
                8,
                text=label,
                anchor="nw",
                fill=color,
                font=("Microsoft YaHei UI", 9, "bold"),
            )
            self.charts[key] = canvas

        notebook = ttk.Notebook(self.root)
        notebook.pack(fill="both", expand=True, padx=12, pady=(10, 12))
        self.texts: dict[str, tk.Text] = {}
        for tab, title in (
            ("conversations", "最近对话"),
            ("llm", "模型调用"),
            ("publish", "发布任务"),
            ("logs", "调试日志"),
            ("events", "事件总线"),
            ("statuses", "模块状态"),
            ("config", "配置概览"),
        ):
            page = tk.Frame(notebook, bg=CARD_BG)
            notebook.add(page, text=title)
            text = tk.Text(
                page,
                font=("Microsoft YaHei UI", 9),
                bg=CARD_BG,
                fg=INK,
                relief="flat",
                state="disabled",
                wrap="word",
            )
            text.pack(fill="both", expand=True, padx=6, pady=6)
            self.texts[tab] = text

    def refresh(self) -> None:
        summary = fetch_summary(self.db_path)
        self.cards["tokens"].config(text=f"总 Token\n{summary.get('total_tokens', 0)}")
        self.cards["today"].config(
            text=f"今日对话\n{summary.get('today_conversations', 0)}"
        )
        self.cards["mood"].config(text=f"当前情绪\n{summary.get('mood', '未知')}")
        self.cards["module"].config(
            text=f"模块状态\n{summary.get('module', '-')} {summary.get('status', '未知')}"
        )
        self._draw_chart("tokens", [row.get("total_tokens") or 0 for row in fetch_llm_calls(self.db_path, 60)[::-1]], ACCENT)
        self._draw_chart("emotions", [row.get("valence") or 0 for row in fetch_emotions(self.db_path, 60)[::-1]], EMOTION)
        self._draw_chart("memory", [row.get("conversations") or 0 for row in fetch_memory_stats(self.db_path, 60)[::-1]], MEMORY)
        self._fill_texts()
        self._fill_debug_texts()
        seconds = float(os.getenv("DASHBOARD_REFRESH_SECONDS", "15") or "15")
        self.root.after(max(1000, int(seconds * 1000)), self.refresh)

    def _draw_chart(self, key: str, values: list[float], color: str) -> None:
        canvas = self.charts[key]
        canvas.delete("trend")
        if not values:
            return
        width = max(int(canvas["width"]), 1)
        height = 90
        max_v = max(max(values), 1)
        min_v = min(min(values), 0)
        span = max(max_v - min_v, 1)
        step = max(width / max(len(values), 1), 1)
        points: list[tuple[float, float]] = []
        for index, value in enumerate(values):
            x = index * step
            y = height - ((value - min_v) / span) * (height - 20) - 8
            points.append((x, y))
        for (x1, y1), (x2, y2) in zip(points, points[1:]):
            canvas.create_line(x1, y1, x2, y2, fill=color, width=2, tags="trend")

    def _fill_texts(self) -> None:
        conversations = fetch_conversations(self.db_path, 8)
        llm = fetch_llm_calls(self.db_path, 8)
        publish = fetch_publish_tasks(self.db_path, 8)
        self._set_text("conversations", self._format_conversations(conversations))
        self._set_text("llm", self._format_llm(llm))
        self._set_text("publish", self._format_publish(publish))

    @staticmethod
    def _format_conversations(rows: list[dict[str, Any]]) -> str:
        lines = []
        for row in rows:
            role = "用户" if row.get("role") == "user" else "AI"
            content = (row.get("content") or "").replace("\n", " ")
            lines.append(f"{role}：{content[:80]}")
        return "\n\n".join(lines) or "暂无对话"

    @staticmethod
    def _format_llm(rows: list[dict[str, Any]]) -> str:
        lines = []
        for row in rows:
            lines.append(
                f"{row.get('model')}\n"
                f"Token {row.get('total_tokens')} · "
                f"延迟 {row.get('latency_ms')}ms"
            )
        return "\n\n".join(lines) or "暂无模型调用"

    @staticmethod
    def _format_publish(rows: list[dict[str, Any]]) -> str:
        lines = []
        for row in rows:
            lines.append(
                f"{row.get('platform')} [{row.get('status')}]\n{row.get('title')}"
            )
        return "\n\n".join(lines) or "暂无发布任务"

    def _fill_debug_texts(self) -> None:
        logs = fetch_logs(self.db_path, 30)
        events = fetch_bus_events(self.db_path, 30)
        statuses = fetch_module_statuses(self.db_path)
        config = public_config(self.config) if self.config is not None else {}
        self._set_text("logs", self._format_logs(logs))
        self._set_text("events", self._format_events(events))
        self._set_text("statuses", self._format_statuses(statuses))
        self._set_text("config", self._format_config(config))

    @staticmethod
    def _format_logs(rows: list[dict[str, Any]]) -> str:
        lines = []
        for row in rows:
            lines.append(
                f"[{row.get('level')}] {row.get('logger')}\n{row.get('message')}"
            )
        return "\n\n".join(lines) or "暂无日志"

    @staticmethod
    def _format_events(rows: list[dict[str, Any]]) -> str:
        lines = []
        for row in rows:
            payload = row.get("payload_json") or "{}"
            lines.append(f"{row.get('event_type')}  {payload[:160]}")
        return "\n\n".join(lines) or "暂无事件"

    @staticmethod
    def _format_statuses(rows: list[dict[str, Any]]) -> str:
        lines = []
        for row in rows:
            lines.append(
                f"{row.get('module')} [{row.get('status')}]\n"
                f"{row.get('detail')} · {row.get('created_at')}"
            )
        return "\n\n".join(lines) or "暂无模块状态"

    @staticmethod
    def _format_config(config: dict[str, Any]) -> str:
        if not config:
            return "暂无配置"
        lines = []
        for key, value in config.items():
            text = str(value)
            if isinstance(value, (list, tuple)):
                text = ", ".join(str(item) for item in value)
            lines.append(f"{key} = {text}")
        return "\n".join(lines)

    def _set_text(self, key: str, content: str) -> None:
        text = self.texts[key]
        text.configure(state="normal")
        text.delete("1.0", "end")
        text.insert("1.0", content)
        text.configure(state="disabled")


def run_dashboard(config: Any) -> None:
    root = tk.Tk()
    DashboardTk(root, _db_path(config), config)
    root.mainloop()
