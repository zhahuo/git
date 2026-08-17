import json
import sys
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from usage_tracker import UsageTracker


def main():
    tracker = UsageTracker()
    new_rows = tracker.sync()
    summary = tracker.summary()
    print("new_rows:", new_rows)
    print("today:", json.dumps(summary["today"], ensure_ascii=False))
    print("week:", json.dumps(summary["week"], ensure_ascii=False))
    print("week_models:", json.dumps(summary["week_models"], ensure_ascii=False))

    assert summary["today"]["tokens"] >= 0
    assert summary["week"]["tokens"] >= summary["today"]["tokens"]
    assert summary["week"]["cost"] >= 0
    print("SMOKE OK")


if __name__ == "__main__":
    main()
