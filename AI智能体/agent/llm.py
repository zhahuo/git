from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any


class LLMError(RuntimeError):
    pass


class LLMClient:
    def __init__(self, base_url: str, api_key: str, model: str, timeout: int = 30):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    @property
    def available(self) -> bool:
        return bool(self.api_key)

    def chat(
        self,
        messages: list[dict[str, Any]],
        temperature: float = 0.8,
        tools: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        if not self.api_key:
            raise LLMError("未配置 AI_API_KEY")
        url = f"{self.base_url}/chat/completions"
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
        }
        if tools:
            payload["tools"] = tools
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0 Safari/537.36"
            ),
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise LLMError(f"模型接口返回 {exc.code}: {detail[:300]}") from exc
        except urllib.error.URLError as exc:
            raise LLMError(f"无法连接模型接口: {exc.reason}") from exc
        try:
            return body["choices"][0]["message"]
        except (KeyError, IndexError) as exc:
            raise LLMError(f"模型返回格式异常: {body}") from exc
