import argparse
import sqlite3
import sys
import time
from datetime import datetime, timezone, timedelta


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-db", default=r"C:\Users\袁\.codex\state_5.sqlite")
    parser.add_argument("--minutes", type=int, default=15)
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    cutoff_ms = int((time.time() - args.minutes * 60) * 1000)
    uri = "file:" + args.state_db.replace("\\", "/") + "?mode=ro"
    con = sqlite3.connect(uri, uri=True)
    cur = con.cursor()

    rows = cur.execute(
        """
        select id, title, updated_at_ms, recency_at_ms, archived, cwd
        from threads
        order by updated_at_ms desc
        """
    ).fetchall()

    all_rows = [r for r in rows if not r[4]]
    active_rows = [r for r in all_rows if r[2] >= cutoff_ms]

    def fmt(ms):
        return datetime.fromtimestamp(ms / 1000, tz=timezone(timedelta(hours=8))).strftime("%Y-%m-%d %H:%M:%S")

    print(f"CUTOFF_MINUTES={args.minutes}")
    print(f"CUTOFF_AT={fmt(cutoff_ms)}")
    print(f"TOTAL_THREADS={len(rows)}")
    print(f"NON_ARCHIVED_THREADS={len(all_rows)}")
    print(f"ACTIVE_NON_ARCHIVED_THREADS={len(active_rows)}")
    print()
    print("ACTIVE_SESSIONS:")
    print("| id | title | updated_at | recency_at | cwd |")
    print("| --- | --- | --- | --- | --- |")
    for r in active_rows:
        title = (r[1] or "").replace("|", "/").replace("\n", " ")[:80]
        print(f"| {r[0]} | {title} | {fmt(r[2])} | {fmt(r[3])} | {r[5]} |")
    print()
    print("RECENT_INACTIVE_NON_ARCHIVED (top 20):")
    print("| id | title | updated_at |")
    print("| --- | --- | --- |")
    for r in all_rows[:20]:
        if r in active_rows:
            continue
        title = (r[1] or "").replace("|", "/").replace("\n", " ")[:80]
        print(f"| {r[0]} | {title} | {fmt(r[2])} |")

    con.close()


if __name__ == "__main__":
    main()
