from __future__ import annotations

import json
import urllib.request
from pathlib import Path

from agent.config import AgentConfig


def main() -> None:
    config = AgentConfig.load(Path("config.json"))
    url = config.base_url.rstrip("/") + "/models"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {config.api_key}",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0 Safari/537.36"
            ),
        },
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    for item in data.get("data", []):
        print(item.get("id"))


if __name__ == "__main__":
    main()
