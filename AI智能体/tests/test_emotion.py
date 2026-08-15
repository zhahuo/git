from __future__ import annotations

import unittest

from agent.emotion import EmotionEvent, EmotionState, analyze_sentiment


class EmotionTests(unittest.TestCase):
    def test_positive_event_raises_valence(self) -> None:
        state = EmotionState()
        before = state.valence
        state.update(EmotionEvent("joy", 0.8, "太好了"))
        self.assertGreater(state.valence, before)

    def test_negative_event_lowers_valence(self) -> None:
        state = EmotionState()
        before = state.valence
        state.update(EmotionEvent("anger", 0.8, "生气"))
        self.assertLess(state.valence, before)

    def test_decay_moves_toward_baseline(self) -> None:
        state = EmotionState(valence=0.9)
        state.decay()
        self.assertLess(state.valence, 0.9)

    def test_mood_label(self) -> None:
        state = EmotionState(valence=0.8, arousal=0.9)
        self.assertIn(state.mood_label(), {"兴奋", "开心"})

    def test_analyze_sentiment(self) -> None:
        event = analyze_sentiment("我真的好生气")
        self.assertIn(event.kind, {"anger", "negative"})


if __name__ == "__main__":
    unittest.main()
