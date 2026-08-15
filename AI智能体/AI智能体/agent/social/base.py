from __future__ import annotations

from pathlib import Path
from typing import Any


class VideoPublisher:
    platform = "generic"

    def __init__(self, dry_run: bool = True, **credentials: str):
        self.dry_run = dry_run
        self.credentials = credentials

    @property
    def configured(self) -> bool:
        return any(bool(value) for value in self.credentials.values())

    def _normalize_tags(self, tags: Any) -> list[str]:
        if tags is None:
            return []
        if isinstance(tags, str):
            tags = [tags]
        if not isinstance(tags, (list, tuple)):
            raise ValueError("tags 必须是字符串或字符串列表")
        return [str(tag).strip() for tag in tags if str(tag).strip()]

    def dry_result(self, video_path: str, title: str, description: str) -> dict[str, Any]:
        return {
            "ok": True,
            "platform": self.platform,
            "dry_run": True,
            "message": f"{self.platform} 发布为演示模式，未真正上传。",
            "video": str(video_path),
            "title": title,
            "description": description,
        }

    def publish(
        self,
        video_path: str | Path,
        title: str,
        description: str,
        tags: list[str] | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        raise NotImplementedError
