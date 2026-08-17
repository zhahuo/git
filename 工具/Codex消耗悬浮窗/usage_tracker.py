import json
import re
import sqlite3
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
USAGE_DB = DATA_DIR / "usage.db"
COSTS_FILE = BASE_DIR / "costs.json"
LOGS_DB = Path.home() / ".codex" / "logs_2.sqlite"
TZ = ZoneInfo("Asia/Shanghai")
BATCH_SIZE = 500
WEEK_SECONDS = 7 * 24 * 3600


def _epoch_ms_to_s(ts):
    return int(ts)


def today_start_epoch(now=None):
    now = time.time() if now is None else now
    return int(datetime.fromtimestamp(now, TZ).replace(hour=0, minute=0, second=0, microsecond=0).timestamp())


def week_start_epoch(now=None):
    now = time.time() if now is None else now
    local = datetime.fromtimestamp(now, TZ)
    monday = local - timedelta(days=local.weekday())
    monday = monday.replace(hour=0, minute=0, second=0, microsecond=0)
    return int(monday.timestamp())


class UsageTracker:
    def __init__(self):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self, path=USAGE_DB, read_only=False):
        if read_only:
            return sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=3)
        return sqlite3.connect(path, timeout=3)

    def _init_db(self):
        with self._connect() as con:
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS usage (
                    id INTEGER PRIMARY KEY,
                    ts INTEGER NOT NULL,
                    model TEXT NOT NULL,
                    thread_id TEXT,
                    total_tokens INTEGER NOT NULL,
                    seen_at INTEGER NOT NULL
                )
                """
            )
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS meta (
                    key TEXT PRIMARY KEY,
                    value INTEGER NOT NULL
                )
                """
            )
            con.execute("INSERT OR IGNORE INTO meta(key, value) VALUES ('last_ts', 0)")
            con.execute("INSERT OR IGNORE INTO meta(key, value) VALUES ('last_id', 0)")

    def _meta(self, key):
        with self._connect(read_only=True) as con:
            row = con.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        return row[0] if row else 0

    def _set_meta(self, key, value):
        with self._connect() as con:
            con.execute(
                "INSERT INTO meta(key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (key, int(value)),
            )

    def _load_costs(self):
        defaults = {
            "deepseek-v4-flash": 0.001,
            "deepseek-v4-pro": 0.002,
            "glm-5.1": 0.002,
            "glm-5.2": 0.002,
            "kimi-k2.7-code": 0.002,
            "grok-4.5": 0.003,
            "gpt-5.6-luna": 0.005,
            "mimo-v2.5-pro": 0.002,
        }
        if COSTS_FILE.exists():
            try:
                user_costs = json.loads(COSTS_FILE.read_text(encoding="utf-8"))
                if isinstance(user_costs, dict):
                    defaults.update({k: float(v) for k, v in user_costs.items()})
            except (ValueError, TypeError):
                pass
        return defaults

    def _parse_row(self, row_id, ts, body):
        model_match = re.search(r"\bmodel=([A-Za-z0-9._-]+)", body)
        tokens_match = re.search(r"\btotal_usage_tokens=(\d+)", body)
        thread_match = re.search(r"thread\.id=([0-9a-f-]+)", body)
        if not model_match or not tokens_match:
            return None
        return {
            "id": int(row_id),
            "ts": int(ts),
            "model": model_match.group(1),
            "thread_id": thread_match.group(1) if thread_match else None,
            "total_tokens": int(tokens_match.group(1)),
            "seen_at": int(time.time()),
        }

    def sync(self):
        last_ts = self._meta("last_ts")
        last_id = self._meta("last_id")
        if last_ts == 0:
            last_ts = week_start_epoch() - 1

        if not LOGS_DB.exists():
            return 0

        inserted = 0
        with self._connect(LOGS_DB, read_only=True) as logs:
            while True:
                rows = logs.execute(
                    """
                    SELECT id, ts, feedback_log_body
                    FROM logs
                    WHERE (ts > ? OR (ts = ? AND id > ?))
                      AND target = 'codex_core::session::turn'
                      AND feedback_log_body LIKE '%post sampling token usage%'
                    ORDER BY ts, id
                    LIMIT ?
                    """,
                    (last_ts, last_ts, last_id, BATCH_SIZE),
                ).fetchall()
                if not rows:
                    break

                parsed = [self._parse_row(r[0], r[1], r[2]) for r in rows]
                parsed = [p for p in parsed if p is not None]
                if parsed:
                    with self._connect() as usage:
                        usage.executemany(
                            """
                            INSERT OR IGNORE INTO usage(id, ts, model, thread_id, total_tokens, seen_at)
                            VALUES (:id, :ts, :model, :thread_id, :total_tokens, :seen_at)
                            """,
                            parsed,
                        )
                    inserted += len(parsed)

                last_ts = rows[-1][1]
                last_id = rows[-1][0]
                if len(rows) < BATCH_SIZE:
                    break

        self._set_meta("last_ts", last_ts)
        self._set_meta("last_id", last_id)
        return inserted

    def breakdown(self, since_ts):
        with self._connect(read_only=True) as con:
            rows = con.execute(
                """
                SELECT model, SUM(total_tokens), COUNT(*)
                FROM usage
                WHERE ts >= ?
                GROUP BY model
                ORDER BY SUM(total_tokens) DESC
                """,
                (int(since_ts),),
            ).fetchall()
        costs = self._load_costs()
        items = []
        for model, tokens, calls in rows:
            price = costs.get(model, 0.0)
            items.append(
                {
                    "model": model,
                    "tokens": int(tokens or 0),
                    "calls": int(calls or 0),
                    "cost": round((tokens or 0) * price / 1000.0, 2),
                }
            )
        return items

    def summary(self):
        today = today_start_epoch()
        week = week_start_epoch()
        today_items = self.breakdown(today)
        week_items = self.breakdown(week)
        return {
            "today": self._sum_items(today_items),
            "week": self._sum_items(week_items),
            "today_models": today_items,
            "week_models": week_items,
        }

    @staticmethod
    def _sum_items(items):
        return {
            "tokens": sum(i["tokens"] for i in items),
            "calls": sum(i["calls"] for i in items),
            "cost": round(sum(i["cost"] for i in items), 2),
        }


if __name__ == "__main__":
    tracker = UsageTracker()
    new_rows = tracker.sync()
    print("new rows:", new_rows)
    print(json.dumps(tracker.summary(), ensure_ascii=False, indent=2))
