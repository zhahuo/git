from __future__ import annotations

from ..config import AgentConfig
from .base import VideoPublisher
from .douyin import DouyinPublisher
from .tiktok import TikTokPublisher

__all__ = ["VideoPublisher", "DouyinPublisher", "TikTokPublisher", "build_publishers"]


def build_publishers(config: AgentConfig) -> dict[str, VideoPublisher]:
    return {
        "douyin": DouyinPublisher(
            dry_run=config.dry_run,
            client_key=config.douyin_client_key,
            client_secret=config.douyin_client_secret,
        ),
        "tiktok": TikTokPublisher(
            dry_run=config.dry_run,
            client_key=config.tiktok_client_key,
            client_secret=config.tiktok_client_secret,
        ),
    }
