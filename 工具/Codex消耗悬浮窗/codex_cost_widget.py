import tkinter as tk
from pathlib import Path
from tkinter import font as tkfont

from usage_tracker import UsageTracker


BASE_DIR = Path(__file__).resolve().parent
TRANSPARENT = "#010203"
BG = "#EAF7FF"
CARD = "#FFFFFF"
ACCENT = "#5AC8FA"
DEEP = "#0B6FA4"
TEXT = "#123B5A"
MUTED = "#7FA9C4"
WIDTH = 360
HEIGHT = 212
REFRESH_MS = 5000


def rounded_rect(canvas, x1, y1, x2, y2, r, **kwargs):
    points = [
        x1 + r, y1,
        x2 - r, y1,
        x2, y1,
        x2, y1 + r,
        x2, y2 - r,
        x2, y2,
        x2 - r, y2,
        x1 + r, y2,
        x1, y2,
        x1, y2 - r,
        x1, y1 + r,
        x1, y1,
    ]
    return canvas.create_polygon(points, smooth=True, **kwargs)


class CostWidget:
    def __init__(self, root):
        self.root = root
        self.tracker = UsageTracker()
        self.font = tkfont.Font(family="Microsoft YaHei UI", size=10)
        self.small_font = tkfont.Font(family="Microsoft YaHei UI", size=8)
        self.title_font = tkfont.Font(family="Microsoft YaHei UI", size=12, weight="bold")

        self._drag_offset = None
        self._normal_geometry = f"{WIDTH}x{HEIGHT}+{self._default_x()}+40"

        root.overrideredirect(True)
        root.attributes("-topmost", True)
        root.attributes("-transparentcolor", TRANSPARENT)
        root.configure(bg=TRANSPARENT)
        root.geometry(self._normal_geometry)

        self.canvas = tk.Canvas(root, width=WIDTH, height=HEIGHT, bg=TRANSPARENT, highlightthickness=0)
        self.canvas.pack(fill="both", expand=True)

        self._build_ui()
        self._bind_drag(self.root)
        self._bind_drag(self.canvas)

        self.refresh()
        self._tick()

    @staticmethod
    def _default_x():
        try:
            return max(20, int(round((root.winfo_screenwidth() - WIDTH) * 0.92)))
        except Exception:
            return 1200

    def _build_ui(self):
        for attr in ("close_btn", "mini_btn"):
            btn = getattr(self, attr, None)
            if btn is not None:
                try:
                    btn.destroy()
                except tk.TclError:
                    pass

        rounded_rect(
            self.canvas,
            2, 2, WIDTH - 2, HEIGHT - 2,
            28,
            fill=BG,
            outline=ACCENT,
            width=2,
        )
        self._draw_whale()

        self.title_text = self.canvas.create_text(
            108, 28,
            text="小鲸鱼消耗",
            font=self.title_font,
            fill=TEXT,
            anchor="w",
        )
        self.subtitle_text = self.canvas.create_text(
            108, 46,
            text="Codex Token 管家",
            font=self.small_font,
            fill=MUTED,
            anchor="w",
        )

        self.close_btn = tk.Label(
            self.root,
            text="×",
            bg=BG,
            fg=TEXT,
            font=tkfont.Font(family="Microsoft YaHei UI", size=13),
            cursor="hand2",
        )
        self.close_btn.place(x=WIDTH - 28, y=6, width=22, height=22)
        self.close_btn.bind("<Button-1>", lambda _e: self.root.destroy())

        self.mini_btn = tk.Label(
            self.root,
            text="—",
            bg=BG,
            fg=TEXT,
            font=tkfont.Font(family="Microsoft YaHei UI", size=13),
            cursor="hand2",
        )
        self.mini_btn.place(x=WIDTH - 52, y=6, width=22, height=22)
        self.mini_btn.bind("<Button-1>", lambda _e: self._toggle_mini())

        self.today_tokens = self._stat_text(112, 76, "今日 Token")
        self.week_tokens = self._stat_text(112, 116, "本周 Token")
        self.cost_text = self._stat_text(112, 156, "今日费用估算")
        self.updated_text = self.canvas.create_text(
            18, HEIGHT - 18,
            text="读取中…",
            font=self.small_font,
            fill=MUTED,
            anchor="w",
        )

        self.canvas.tag_bind(self.today_tokens, "<Button-3>", lambda _e: self._show_detail())
        self.canvas.tag_bind(self.week_tokens, "<Button-3>", lambda _e: self._show_detail())
        self.canvas.tag_bind(self.cost_text, "<Button-3>", lambda _e: self._show_detail())
        self.canvas.bind("<Button-3>", lambda _e: self._show_detail())

        self._mini_mode = False
        self._mini_whale = None

    def _stat_text(self, x, y, label):
        self.canvas.create_text(x, y - 1, text=label, font=self.small_font, fill=MUTED, anchor="w")
        item = self.canvas.create_text(x, y + 17, text="—", font=self.title_font, fill=DEEP, anchor="w")
        return item

    def _draw_whale(self):
        self.canvas.create_oval(22, 58, 88, 116, fill=ACCENT, outline="")
        self.canvas.create_polygon(
            24, 74,
            6, 52,
            10, 94,
            22, 88,
            fill=ACCENT,
            smooth=True,
        )
        self.canvas.create_oval(46, 88, 88, 114, fill=BG, outline="")
        self.canvas.create_oval(64, 70, 73, 79, fill=TEXT, outline="")
        self.canvas.create_oval(66, 72, 70, 76, fill="#FFFFFF", outline="")
        self.canvas.create_arc(
            52, 80, 74, 100,
            start=0,
            extent=-180,
            style="arc",
            outline=TEXT,
            width=2,
        )
        self.canvas.create_line(48, 50, 46, 36, 52, 28, 56, 22, fill=DEEP, width=2, smooth=True)
        self.canvas.create_oval(49, 20, 57, 28, fill=DEEP, outline="")
        self.canvas.create_oval(52, 42, 60, 50, fill=ACCENT, outline="")

    def _toggle_mini(self):
        if not self._mini_mode:
            self._normal_geometry = self.root.geometry()
            self.root.geometry("96x44+{}+40".format(self._default_x()))
            self.canvas.delete("all")
            self._mini_whale = self.canvas.create_text(48, 22, text="🐳", font=tkfont.Font(size=22))
            self._mini_mode = True
        else:
            self.canvas.delete("all")
            self._mini_mode = False
            self._build_ui()
            self._bind_drag(self.root)
            self._bind_drag(self.canvas)
            self.root.geometry(self._normal_geometry)
            self.refresh()

    def _bind_drag(self, widget):
        widget.bind("<ButtonPress-1>", self._start_drag)
        widget.bind("<B1-Motion>", self._on_drag)

    def _start_drag(self, event):
        self._drag_offset = (event.x_root - self.root.winfo_x(), event.y_root - self.root.winfo_y())

    def _on_drag(self, event):
        if not self._drag_offset:
            return
        x = event.x_root - self._drag_offset[0]
        y = event.y_root - self._drag_offset[1]
        self.root.geometry(f"+{x}+{y}")

    def _format_tokens(self, value):
        if value >= 1_000_000:
            return f"{value / 1_000_000:.2f}M"
        if value >= 1_000:
            return f"{value / 1_000:.1f}K"
        return str(int(value))

    def refresh(self):
        try:
            self.tracker.sync()
            summary = self.tracker.summary()
            today = summary["today"]
            week = summary["week"]
            self.canvas.itemconfigure(self.today_tokens, text=self._format_tokens(today["tokens"]))
            self.canvas.itemconfigure(self.week_tokens, text=self._format_tokens(week["tokens"]))
            self.canvas.itemconfigure(self.cost_text, text=f"¥{today['cost']:.2f}")
            self.canvas.itemconfigure(self.updated_text, text=f"{today['calls']} 次调用 · 实时")
        except Exception:
            self.canvas.itemconfigure(self.updated_text, text="数据读取中…")

    def _show_detail(self):
        try:
            self.tracker.sync()
            summary = self.tracker.summary()
        except Exception:
            summary = {"week_models": []}

        detail = tk.Toplevel(self.root)
        detail.title("小鲸鱼消耗明细")
        detail.attributes("-topmost", True)
        detail.configure(bg=BG)
        detail.geometry("380x260+{}+120".format(self._default_x() - 20))

        tk.Label(
            detail,
            text="本周模型消耗",
            bg=BG,
            fg=TEXT,
            font=tkfont.Font(family="Microsoft YaHei UI", size=12, weight="bold"),
        ).pack(pady=(12, 6))

        frame = tk.Frame(detail, bg=CARD, padx=8, pady=8)
        frame.pack(fill="both", expand=True, padx=12, pady=(0, 12))

        header = "模型 | Token | 调用 | 费用"
        tk.Label(frame, text=header, bg=CARD, fg=MUTED, font=self.small_font, anchor="w").pack(fill="x")
        tk.Frame(frame, bg=ACCENT, height=1).pack(fill="x", pady=4)

        items = summary.get("week_models", [])
        if not items:
            tk.Label(frame, text="本周还没有消耗记录", bg=CARD, fg=TEXT, font=self.small_font).pack(pady=20)
        else:
            for item in items:
                line = f"{item['model']}  |  {self._format_tokens(item['tokens'])}  |  {item['calls']}  |  ¥{item['cost']:.2f}"
                tk.Label(frame, text=line, bg=CARD, fg=TEXT, font=self.small_font, anchor="w").pack(fill="x", pady=2)

    def _tick(self):
        self.refresh()
        self.root.after(REFRESH_MS, self._tick)


def main():
    global root
    try:
        root = tk.Tk()
        root.title("小鲸鱼消耗")
        CostWidget(root)
        root.mainloop()
    except Exception as exc:
        import traceback

        error_file = BASE_DIR / "data" / "widget-error.log"
        error_file.parent.mkdir(parents=True, exist_ok=True)
        with open(error_file, "a", encoding="utf-8") as f:
            f.write(traceback.format_exc())
        raise


if __name__ == "__main__":
    main()
