from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from html.parser import HTMLParser
from typing import Any, Callable


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in ("script", "style", "noscript", "svg"):
            self.skip_depth += 1
        if tag in ("p", "div", "br", "li", "tr", "section", "article", "h1", "h2", "h3", "h4"):
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style", "noscript", "svg") and self.skip_depth > 0:
            self.skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if self.skip_depth == 0:
            self.parts.append(data)


def extract_text(html: str, max_chars: int = 4000) -> str:
    parser = TextExtractor()
    parser.feed(html)
    text = "".join(parser.parts)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text[:max_chars]


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict[str, Any]
    handler: Callable[..., str]

    def schema(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


class ToolRegistry:
    def __init__(
        self,
        memory: Any = None,
        publishers: dict[str, Any] | None = None,
        search_provider: str = "dry_run",
        search_api_key: str = "",
    ):
        self.memory = memory
        self.publishers = publishers or {}
        self.search_provider = search_provider
        self.search_api_key = search_api_key
        self.default_user = "_agent"
        self._tools: dict[str, Tool] = {}
        self._register_defaults()

    def register(
        self,
        name: str,
        description: str,
        parameters: dict[str, Any],
        handler: Callable[..., str],
    ) -> None:
        self._tools[name] = Tool(name, description, parameters, handler)

    def schemas(self) -> list[dict[str, Any]]:
        return [tool.schema() for tool in self._tools.values()]

    def run(self, name: str, arguments: dict[str, Any]) -> str:
        tool = self._tools.get(name)
        if tool is None:
            return f"没有这个工具：{name}"
        return tool.handler(**arguments)

    def _register_defaults(self) -> None:
        self.register(
            "web_search",
            "搜索互联网并获得文字结果，适合查询新闻、资料、事实和最新信息。",
            {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "搜索关键词"},
                    "max_results": {"type": "integer", "description": "返回结果数量，默认 5"},
                },
                "required": ["query"],
            },
            self._web_search,
        )
        self.register(
            "fetch_url",
            "打开一个网页并读取正文文字。",
            {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "网页地址"},
                    "max_chars": {"type": "integer", "description": "最多读取多少字"},
                },
                "required": ["url"],
            },
            self._fetch_url,
        )
        self.register(
            "remember",
            "把一件值得长期记住的事情写入记忆。",
            {
                "type": "object",
                "properties": {
                    "content": {"type": "string", "description": "要记住的内容"},
                    "category": {"type": "string", "description": "分类，如个人信息、偏好、事件"},
                },
                "required": ["content"],
            },
            self._remember,
        )
        self.register(
            "post_video",
            "发布一条短视频到已配置的短视频平台。",
            {
                "type": "object",
                "properties": {
                    "platform": {"type": "string", "description": "douyin 或 tiktok"},
                    "video_path": {"type": "string", "description": "本地视频文件路径"},
                    "title": {"type": "string", "description": "视频标题"},
                    "description": {"type": "string", "description": "视频描述"},
                    "tags": {"type": "array", "items": {"type": "string"}, "description": "话题标签"},
                },
                "required": ["platform", "video_path", "title", "description"],
            },
            self._post_video,
        )
        self.register(
            "get_time",
            "获取当前本地时间。",
            {"type": "object", "properties": {}},
            self._get_time,
        )

    def _web_search(self, query: str, max_results: int = 5) -> str:
        max_results = max(1, min(int(max_results), 10))
        if self.search_provider == "dry_run" or not self.search_api_key:
            return (
                f"【演示搜索】正在搜索“{query}”。"
                "配置 SEARCH_PROVIDER 和 SEARCH_API_KEY 后这里会返回真实结果。"
            )
        try:
            if self.search_provider == "tavily":
                body = self._post_json(
                    "https://api.tavily.com/search",
                    {"api_key": self.search_api_key, "query": query, "max_results": max_results},
                )
                items = body.get("results", [])
            elif self.search_provider == "serper":
                body = self._post_json(
                    "https://google.serper.dev/search",
                    {"q": query, "num": max_results},
                    headers={"X-API-KEY": self.search_api_key},
                )
                items = body.get("organic", [])
            elif self.search_provider == "brave":
                url = (
                    "https://api.search.brave.com/res/v1/web/search?"
                    + urllib.parse.urlencode({"q": query, "count": max_results})
                )
                body = self._get_json(url, headers={"X-Subscription-Token": self.search_api_key})
                items = body.get("web", {}).get("results", [])
            else:
                return f"未知搜索服务：{self.search_provider}"
        except Exception as exc:
            return f"搜索失败：{exc}"

        lines = [f"关于“{query}”的搜索结果："]
        for item in items[:max_results]:
            title = item.get("title") or item.get("name") or "无标题"
            url = item.get("url") or item.get("link") or ""
            snippet = item.get("content") or item.get("snippet") or ""
            lines.append(f"- {title}\n  {url}\n  {snippet[:200]}")
        return "\n".join(lines) if len(lines) > 1 else "没有搜索到结果。"

    def _fetch_url(self, url: str, max_chars: int = 4000) -> str:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return "只支持 http/https 网页。"
        headers = {"User-Agent": "Mozilla/5.0 (AI Agent)"}
        try:
            body = self._get_json(url, headers=headers, raw=True)
        except Exception as exc:
            return f"读取网页失败：{exc}"
        return extract_text(body, max_chars=max_chars)

    def _remember(self, content: str, category: str = "general") -> str:
        if self.memory is not None:
            self.memory.remember_fact(self.default_user, content, category=category)
            return f"已记住：{content}"
        return f"（没有可用记忆库）想记住：{content}"

    def _post_video(
        self,
        platform: str,
        video_path: str,
        title: str,
        description: str,
        tags: list[str] | None = None,
    ) -> str:
        publisher = self.publishers.get(platform)
        if publisher is None:
            return f"还没有接入 {platform} 发布渠道。"
        result = publisher.publish(video_path, title, description, tags=tags)
        return json.dumps(result, ensure_ascii=False)

    def _get_time(self) -> str:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    def _request_json(
        self,
        url: str,
        method: str = "GET",
        payload: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        raw: bool = False,
    ) -> Any:
        headers = dict(headers or {})
        data = None
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers.setdefault("Content-Type", "application/json")
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=15) as resp:
            content = resp.read().decode("utf-8", errors="replace")
        return content if raw else json.loads(content)

    def _post_json(
        self,
        url: str,
        payload: dict[str, Any],
        headers: dict[str, str] | None = None,
    ) -> Any:
        return self._request_json(url, method="POST", payload=payload, headers=headers)

    def _get_json(
        self,
        url: str,
        headers: dict[str, str] | None = None,
        raw: bool = False,
    ) -> Any:
        return self._request_json(url, method="GET", headers=headers, raw=raw)
