from __future__ import annotations

import re
from dataclasses import dataclass, field

POSITIVE_WORDS = (
    "开心",
    "高兴",
    "喜欢",
    "爱",
    "太好了",
    "谢谢",
    "厉害",
    "棒",
    "温暖",
    "感动",
    "期待",
)
NEGATIVE_WORDS = (
    "难过",
    "伤心",
    "生气",
    "讨厌",
    "烦",
    "失望",
    "害怕",
    "焦虑",
    "累",
    "孤独",
    "哭",
)
INTENSIFIERS = ("很", "非常", "特别", "太", "真的", "超级")


def clamp(value: float, low: float = -1.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


@dataclass
class EmotionEvent:
    kind: str = "neutral"
    intensity: float = 0.5
    text: str = ""


@dataclass
class Personality:
    openness: float = 0.75
    conscientiousness: float = 0.70
    extraversion: float = 0.65
    agreeableness: float = 0.80
    neuroticism: float = 0.35


@dataclass
class EmotionState:
    valence: float = 0.20
    arousal: float = 0.35
    dominance: float = 0.55
    baseline_valence: float = 0.20
    baseline_arousal: float = 0.35
    baseline_dominance: float = 0.55
    personality: Personality = field(default_factory=Personality)
    history: list[tuple[str, float, float, float]] = field(default_factory=list)

    def update(self, event: EmotionEvent) -> None:
        delta = clamp(event.intensity, 0.0, 1.0)
        if event.kind in ("joy", "positive", "love", "gratitude"):
            self.valence += delta * 0.45
            self.arousal += delta * 0.15
        elif event.kind in ("anger", "fear", "anxiety", "negative"):
            self.valence -= delta * 0.40
            self.arousal += delta * 0.25
        elif event.kind in ("sadness", "disappointment"):
            self.valence -= delta * 0.35
            self.arousal -= delta * 0.12
        elif event.kind == "surprise":
            self.arousal += delta * 0.30
        else:
            self.valence += delta * 0.08

        damping = 0.85 + self.personality.neuroticism * 0.15
        self.valence = clamp(self.valence * damping)
        self.arousal = clamp(self.arousal, 0.0, 1.0)
        self.dominance = clamp(self.dominance, 0.0, 1.0)
        self.history.append((event.kind, self.valence, self.arousal, self.dominance))
        if len(self.history) > 200:
            self.history = self.history[-200:]

    def decay(self) -> None:
        self.valence += (self.baseline_valence - self.valence) * 0.08
        self.arousal += (self.baseline_arousal - self.arousal) * 0.08
        self.dominance += (self.baseline_dominance - self.dominance) * 0.08
        self.valence = clamp(self.valence)
        self.arousal = clamp(self.arousal, 0.0, 1.0)
        self.dominance = clamp(self.dominance, 0.0, 1.0)

    def mood_label(self) -> str:
        v, a = self.valence, self.arousal
        if v >= 0.55 and a >= 0.65:
            return "兴奋"
        if v >= 0.45:
            return "开心"
        if v >= 0.0:
            return "平静"
        if a >= 0.6:
            return "烦躁"
        return "低落"

    def describe(self) -> str:
        return (
            f"{self.mood_label()}（愉悦度 {self.valence:.2f}，"
            f"能量 {self.arousal:.2f}，掌控感 {self.dominance:.2f}）"
        )

    def style_prompt(self) -> str:
        mood = self.mood_label()
        if mood == "兴奋":
            return "语气更活泼、更有感染力，可以短句多一点。"
        if mood == "开心":
            return "语气轻快温暖，多一些鼓励和肯定。"
        if mood == "平静":
            return "语气自然从容，保持温和与清醒。"
        if mood == "烦躁":
            return "语气克制，先安抚情绪，不要火上浇油。"
        return "语气温柔耐心，多倾听、多陪伴，不要急着给建议。"


def analyze_sentiment(text: str) -> EmotionEvent:
    if not text:
        return EmotionEvent()
    positive_hits = sum(1 for word in POSITIVE_WORDS if word in text)
    negative_hits = sum(1 for word in NEGATIVE_WORDS if word in text)
    intensity = 0.35 + min(0.55, 0.12 * max(positive_hits, negative_hits))
    if any(word in text for word in INTENSIFIERS):
        intensity = min(1.0, intensity + 0.12)
    if "?" in text or "吗" in text or "为什么" in text:
        return EmotionEvent("curious", max(0.3, intensity * 0.6), text)
    if positive_hits > negative_hits:
        kind = "joy" if positive_hits > 1 else "positive"
        return EmotionEvent(kind, intensity, text)
    if negative_hits > positive_hits:
        if "生气" in text or "讨厌" in text:
            kind = "anger"
        elif "害怕" in text or "焦虑" in text:
            kind = "fear"
        elif "难过" in text or "伤心" in text or "哭" in text:
            kind = "sadness"
        else:
            kind = "negative"
        return EmotionEvent(kind, intensity, text)
    return EmotionEvent("neutral", 0.2, text)
