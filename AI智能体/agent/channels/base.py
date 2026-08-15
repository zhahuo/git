from __future__ import annotations

from ..brain import AgentBrain


class Channel:
    def __init__(self, brain: AgentBrain):
        self.brain = brain

    def run(self) -> None:
        raise NotImplementedError
