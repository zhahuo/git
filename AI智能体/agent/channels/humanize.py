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
    parts = re.split(r"(?<=[。！？!?\n；;，,])", text)
    segments = [part.strip() for part in parts if part.strip()]
    if not segments:
        return [text]
    final: list[str] = []
    for segment in segments:
        while len(segment) > max_chars and len(final) < max_segments:
            final.append(segment[:max_chars])
            segment = segment[max_chars:]
        final.append(segment)
    if len(final) > max_segments:
        final = final[:max_segments]
        final[-1] += "..."
    return final
