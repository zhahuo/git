from __future__ import annotations

import random
import re

from ..config import AgentConfig


def thinking_delay(config: AgentConfig | None) -> float:
    if config is None:
        return random.uniform(0.8, 2.2)
    low = max(0.0, float(config.thinking_delay_min))
    high = max(low, float(config.thinking_delay_max))
    return random.uniform(low, high)


def message_delay(config: AgentConfig | None) -> float:
    if config is None:
        return 0.8
    return max(0.0, float(config.message_delay))


def split_reply(text: str, max_chars: int = 120, max_segments: int = 4) -> list[str]:
    text = text.strip()
    if not text:
        return []
    if len(text) <= max_chars:
        return [text]
    parts = re.split(r"(?<=[。！？!?\n])", text)
    segments: list[str] = []
    buffer = ""
    for part in parts:
        if buffer and len(buffer) + len(part) > max_chars:
            segments.append(buffer.strip())
            buffer = part
        else:
            buffer += part
    if buffer.strip():
        segments.append(buffer.strip())
    result = [segment for segment in segments if segment]
    if not result:
        return [text]
    if len(result) > max_segments:
        result = result[:max_segments]
        result[-1] += "..."
    return result
