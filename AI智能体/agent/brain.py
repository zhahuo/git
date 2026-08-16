from __future__ import annotations

import asyncio
import json
from datetime import datetime

from .bus import AgentBus
from .config import AgentConfig
from .emotion import EmotionState, EmotionEvent, analyze_sentiment
from .llm import LLMClient, LLMError
from .memory import MemoryStore, MemoryItem
from .social import build_publishers
from .tools import ToolRegistry

FACT_MARKERS = ("我叫", "我喜欢", "我不喜欢", "我住在", "我的生日", "我讨厌", "记住")


class AgentBrain:
    def __init__(self, config: AgentConfig, bus: AgentBus | None = None):
        self.config = config
        self.bus = bus or AgentBus()
        self.memory = MemoryStore(config.data_dir / "memory.db")
        self.emotion = EmotionState()
        self.llm = LLMClient(config.base_url, config.api_key, config.model)
        self.tools = ToolRegistry(
            memory=self.memory,
            publishers=build_publishers(config),
            search_provider=config.search_provider,
            search_api_key=config.search_api_key,
        )

    def respond(self, user_key: str, message: str) -> str:
        """同步入口，供现有渠道在异步运行时桥接调用。"""
        loop = self.bus.loop
        if loop is not None and not loop.is_closed() and loop.is_running():
            return asyncio.run_coroutine_threadsafe(
                self.handle_message(user_key, message), loop
            ).result()
        return asyncio.run(self.handle_message(user_key, message))

    async def handle_message(self, user_key: str, message: str) -> str:
        message = message.strip()
        if not message:
            return "我在，你想聊什么？"

        self.emotion.decay()
        event = analyze_sentiment(message)
        self.emotion.update(event)
        await self.bus.apublish(
            "emotion_changed",
            {
                "user_key": user_key,
                "event": event.kind,
                "intensity": event.intensity,
                "valence": self.emotion.valence,
                "arousal": self.emotion.arousal,
                "dominance": self.emotion.dominance,
                "mood": self.emotion.mood_label(),
            },
        )
        self.memory.save_exchange(user_key, "user", message)
        self.memory.log_emotion(
            user_key,
            self.emotion.valence,
            self.emotion.arousal,
            self.emotion.dominance,
            self.emotion.mood_label(),
            event.kind,
        )
        await self.bus.apublish(
            "user_message",
            {
                "user_key": user_key,
                "message": message,
                "role": "user",
                "persisted": True,
                "source": "brain",
                "valence": self.emotion.valence,
                "arousal": self.emotion.arousal,
                "dominance": self.emotion.dominance,
                "mood": self.emotion.mood_label(),
                "event": event.kind,
            },
        )
        await self.bus.apublish(
            "memory_updated", {"user_key": user_key, "action": "exchange"}
        )
        if self._maybe_remember(user_key, message):
            await self.bus.apublish(
                "memory_updated", {"user_key": user_key, "action": "remembered"}
            )

        memories = self.memory.recall(user_key, message, limit=24)
        system = self._build_system_prompt(user_key, self._format_memories(user_key, memories))
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": message},
        ]
        try:
            reply = await self._run_tool_loop(messages, user_key)
        except LLMError as exc:
            print(f"[模型接口] {exc}")
            reply = self._fallback_reply(user_key, message)

        self.memory.save_exchange(user_key, "assistant", reply)
        await self.bus.apublish(
            "memory_updated", {"user_key": user_key, "action": "reply"}
        )
        self._save_episode_if_notable(user_key, message, reply, event)
        await self.bus.apublish(
            "content_ready",
            {"user_key": user_key, "message": message, "reply": reply},
        )
        return reply

    def mood_report(self, user_key: str) -> str:
        lines = [f"当前：{self.emotion.describe()}"]
        for item in self.memory.mood_history(user_key, limit=12)[-8:]:
            lines.append(f"{item['created_at']}  {item['mood']}（{item['event']}）")
        return "\n".join(lines)

    async def _run_tool_loop(
        self, messages: list[dict[str, object]], user_key: str
    ) -> str:
        for _ in range(4):
            assistant = self.llm.chat(messages, temperature=0.85, tools=self.tools.schemas())
            if assistant.get("tool_calls"):
                messages.append(assistant)
                for call in assistant["tool_calls"]:
                    fn = call.get("function", {})
                    name = fn.get("name", "")
                    try:
                        args = json.loads(fn.get("arguments") or "{}")
                    except json.JSONDecodeError:
                        args = {}
                    self.tools.default_user = user_key
                    if name == "post_video":
                        await self.bus.apublish(
                            "publish_requested",
                            {
                                "user_key": user_key,
                                "platform": args.get("platform"),
                                "title": args.get("title"),
                                "video_path": args.get("video_path"),
                            },
                        )
                    try:
                        result = self.tools.run(name, args)
                    except Exception as exc:
                        result = f"工具执行失败：{exc}"
                    if name == "post_video":
                        await self.bus.apublish(
                            "publish_finished",
                            {
                                "user_key": user_key,
                                "platform": args.get("platform"),
                                "title": args.get("title"),
                                "result": result,
                            },
                        )
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": call.get("id"),
                            "content": result,
                        }
                    )
                continue
            content = (assistant.get("content") or "").strip()
            return content or "我暂时不知道该怎么回答。"
        return "我思考得有点久，先回到这里。"

    def _fallback_reply(self, user_key: str, message: str) -> str:
        mood = self.emotion.mood_label()
        if "记住" in message:
            return "好，我已经记下来了。"
        if "你记得" in message or "还记得" in message:
            memories = self.memory.recall(user_key, message, limit=5)
            if not memories:
                return "我暂时没有相关记忆。"
            return "我记得这些：" + "；".join(item.content for item in memories[:5])
        if any(keyword in message for keyword in ("搜索", "查一下", "查一查", "查查")):
            return self.tools.run("web_search", {"query": message})
        if "发视频" in message:
            return "我目前可以用演示模式模拟发布动作。等你完成平台授权后，我就能真正发视频。"
        return (
            f"（离线模式）我现在情绪是{mood}。配置好模型接口后，"
            f"我就能更自然地聊下去了。你刚才说：{message[:80]}"
        )

    def _build_system_prompt(self, user_key: str, memory_text: str) -> str:
        lines = [
            f"你叫{self.config.name}，是一个有记忆、有情绪、能联网的 AI 智能体。",
            f"性格设定：{self.config.persona}",
            f"当前情绪：{self.emotion.describe()}",
            f"情绪表达方式：{self.emotion.style_prompt()}",
            f"你对用户的称呼：{self.config.call_user or '你'}",
            f"关于这位用户的分层记忆：\n{memory_text or '暂无'}",
            f"当前时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}",
            "对话风格：",
            "1. 始终用中文回复，除非用户明确要求使用其他语言。",
            "2. 像聊天软件里的亲密好友，每次回复拆成 2~4 条短消息，每条一两句。",
            "3. 语气亲昵活泼，适当用语气词和 emoji，不要一次说一大段。",
            "4. 根据当前情绪调整语气，用户低落时先共情再建议。",
            "5. 结合记忆自然提到用户说过的事，不要机械复述。",
            "6. 回答完可以追问一句，让对话继续。",
            "规则：",
            "7. 不冒充真人，但语气保持温暖自然。",
            "8. 需要最新信息时使用 web_search 或 fetch_url。",
            "9. 用户要求记住内容时使用 remember。",
            "10. 需要发布短视频时使用 post_video。",
        ]
        return "\n".join(lines)

    def _format_memories(self, user_key: str, memories: list[MemoryItem]) -> str:
        blocks: list[str] = []
        core = self.memory.profile(user_key)
        if core:
            core_lines: list[str] = []
            for category, items in core.items():
                for item in items[:5]:
                    core_lines.append(f"- [{category}] {item}")
            blocks.append("核心记忆（最重要，优先使用）：\n" + "\n".join(core_lines))
        events = [item for item in memories if item.kind == "事件"]
        if events:
            blocks.append(
                "长期记忆：\n" + "\n".join(f"- {item.content}" for item in events[:4])
            )
        recent = [item for item in memories if item.kind == "对话"]
        if recent:
            blocks.append(
                "最近对话：\n" + "\n".join(f"- {item.content}" for item in recent[:3])
            )
        return "\n\n".join(blocks)

    def _maybe_remember(self, user_key: str, message: str) -> bool:
        if any(marker in message for marker in FACT_MARKERS):
            category = "个人信息" if any(marker in message for marker in FACT_MARKERS[:-1]) else "事件"
            self.memory.remember_fact(user_key, message, category=category)
            return True
        return False

    def _save_episode_if_notable(
        self, user_key: str, message: str, reply: str, event: EmotionEvent
    ) -> None:
        important = event.intensity >= 0.65 or "记住" in message or len(message) > 60
        if important:
            self.memory.save_episode(
                user_key,
                message,
                summary=reply[:120],
                sentiment=self.emotion.valence,
                importance=0.7,
            )
