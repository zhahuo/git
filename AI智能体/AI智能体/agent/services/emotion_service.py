from __future__ import annotations

import asyncio
from typing import Any

from ..bus import AgentBus
from ..emotion import EmotionState, analyze_sentiment
from ..module import Module

DEFAULT_DECAY_INTERVAL = 60.0
DEFAULT_USER_KEY = "_agent"


class EmotionService(Module):
    """监听用户消息并按用户维护独立情绪状态。"""

    name = "emotion_service"

    def __init__(
        self,
        config: Any = None,
        bus: AgentBus | None = None,
        decay_interval: float = DEFAULT_DECAY_INTERVAL,
    ) -> None:
        super().__init__(config, bus)
        self.decay_interval = decay_interval
        self._states: dict[str, EmotionState] = {}
        self._decay_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        if self.running:
            return
        self.bus.subscribe("user_message", self.handle)
        self._decay_task = asyncio.create_task(
            self._decay_loop(), name=f"{self.name}-decay"
        )
        await super().start()

    async def stop(self) -> None:
        if not self.running:
            return
        task = self._decay_task
        self._decay_task = None
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self.bus.unsubscribe("user_message", self.handle)
        await super().stop()

    async def handle(self, event: dict[str, Any]) -> None:
        if event.get("type") != "user_message":
            return
        payload = event.get("payload") or {}
        message = (payload.get("message") or "").strip()
        if not message:
            return
        user_key = payload.get("user_key") or DEFAULT_USER_KEY
        state = self.state_for(user_key)
        emotion = analyze_sentiment(message)
        state.update(emotion)
        await self.bus.apublish(
            "emotion_changed",
            {
                "user_key": user_key,
                "event": emotion.kind,
                "intensity": emotion.intensity,
                "valence": state.valence,
                "arousal": state.arousal,
                "dominance": state.dominance,
                "mood": state.mood_label(),
            },
        )

    def state_for(self, user_key: str) -> EmotionState:
        return self._states.setdefault(user_key or DEFAULT_USER_KEY, EmotionState())

    def mood_report(self, user_key: str, limit: int = 10) -> dict[str, Any]:
        state = self.state_for(user_key)
        history = [
            {
                "event": kind,
                "valence": valence,
                "arousal": arousal,
                "dominance": dominance,
            }
            for kind, valence, arousal, dominance in state.history[-limit:]
        ]
        return {
            "user_key": user_key or DEFAULT_USER_KEY,
            "current": {
                "mood": state.mood_label(),
                "valence": state.valence,
                "arousal": state.arousal,
                "dominance": state.dominance,
                "describe": state.describe(),
            },
            "history": history,
        }

    async def _decay_loop(self) -> None:
        while True:
            await asyncio.sleep(self.decay_interval)
            for state in self._states.values():
                state.decay()
