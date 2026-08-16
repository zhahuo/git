from __future__ import annotations

import base64
import json
import os
import sys
import urllib.request
from pathlib import Path


def main() -> None:
    token = ""
    auth_path = Path(os.path.expanduser("~/.codex/auth.json"))
    if auth_path.exists():
        try:
            auth = json.loads(auth_path.read_text(encoding="utf-8"))
            token = str(auth.get("OPENAI_API_KEY", "") or "")
        except (json.JSONDecodeError, OSError):
            token = ""
    image_path = Path(sys.argv[1])
    data_url = "data:image/png;base64," + base64.b64encode(
        image_path.read_bytes()
    ).decode()
    payload = {
        "model": "mimo-v2.5",
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "请详细描述这张截图：界面元素、聊天内容、气泡样式、"
                            "回复方式、任何与 AI 对话相关的交互细节，以及它和普通"
                            "一问一答有什么不同。"
                        ),
                    },
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ],
        "max_tokens": 1200,
    }
    req = urllib.request.Request(
        "http://127.0.0.1:15721/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    print(data["choices"][0]["message"]["content"])


if __name__ == "__main__":
    main()
