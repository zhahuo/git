from __future__ import annotations

from pathlib import Path
from typing import Any

from .base import VideoPublisher


class DouyinPublisher(VideoPublisher):
    """抖音短视频发布器，默认 dry_run 演示模式，不会真实上传。"""

    platform = "douyin"
    ACCESS_TOKEN_URL = "https://open.douyin.com/oauth/access_token/"
    UPLOAD_URL = "https://open.douyin.com/video/upload/"
    CREATE_URL = "https://open.douyin.com/video/create/"

    def publish(
        self,
        video_path: str | Path,
        title: str,
        description: str,
        tags: list[str] | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """发布到抖音。

        只有 dry_run=False 且已配置凭证时才尝试官方 API；
        当前官方接入未实现，此时会抛出 NotImplementedError。
        """
        video_path = str(video_path or "").strip()
        title = str(title or "").strip()
        if not video_path:
            raise ValueError("video_path 不能为空")
        if not title:
            raise ValueError("title 不能为空")
        self._normalize_tags(tags)
        if self.dry_run or not self.configured:
            return self.dry_result(video_path, title, str(description or ""))
        raise NotImplementedError(
            "抖音正式发布需要开发者资质、用户授权、视频上传和发布接口实现，请先完成开放平台接入。"
        )
