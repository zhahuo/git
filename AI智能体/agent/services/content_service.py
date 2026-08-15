from __future__ import annotations

import asyncio
import os
import re
from pathlib import Path
from typing import Any

from ..bus import AgentBus
from ..config import AgentConfig
from ..content import STATUS_DRAFT, ContentStore
from ..llm import LLMClient, LLMError
from ..module import Module

DEFAULT_SCHEDULE_MINUTES = 1440
FALLBACK_TAGS = ["知识分享", "短视频", "实用技巧"]

DRAFT_TEMPLATES = [
    {
        "topic": "为什么你总是熬夜，却戒不掉手机",
        "title": "你不是懒，只是被手机偷走了睡眠",
        "script": (
            "开头：你是不是也说过“看完这条就睡”？\n"
            "正文：熬夜不是意志力的问题，是信息流在不停给你多巴胺。"
            "把手机放到客厅，睡前半小时只留一盏暖灯，入睡会快很多。\n"
            "结尾：今晚试试，明早你会感谢自己。"
        ),
        "tags": ["早睡", "自律", "睡眠", "成长", "习惯"],
        "cover_prompt": (
            "夜晚卧室暖灯，手机被放远，人物轻松躺下，"
            "大字标题“今晚早点睡”，干净生活感画面。"
        ),
    },
    {
        "topic": "普通人也能开始的三个微习惯",
        "title": "把目标缩小，你就赢了一半",
        "script": (
            "开头：想改变自己，不必从宏大计划开始。\n"
            "正文：每天读两页书、做十个俯卧撑、写下明天最重要的一件事。"
            "目标小到不可能失败，坚持就会自然发生。\n"
            "结尾：先做两分钟，再决定要不要继续。"
        ),
        "tags": ["微习惯", "自我提升", "效率", "成长", "行动"],
        "cover_prompt": (
            "明亮的书桌俯拍，翻开两页书和一杯水，"
            "大字标题“先做两分钟”，清爽极简构图。"
        ),
    },
    {
        "topic": "职场里高情商回消息的三个公式",
        "title": "会回消息的人，升职都快一点",
        "script": (
            "开头：同样一句话，为什么别人回得让人舒服？\n"
            "正文：先接住情绪，再给事实，最后给选项。"
            "比如“收到，我确认一下，下午三点前回复您”。\n"
            "结尾：这组公式，今天就能用上。"
        ),
        "tags": ["职场", "沟通", "情商", "表达", "工作"],
        "cover_prompt": (
            "现代办公桌与手机消息气泡，人物微笑回复，"
            "大字标题“高情商回消息”，专业明亮风格。"
        ),
    },
    {
        "topic": "第一次去健身房该怎么不尴尬",
        "title": "去健身房别慌，记住这三步",
        "script": (
            "开头：第一次进健身房，很多人连器械都不敢碰。\n"
            "正文：先热身五分钟，再做固定器械，最后拉伸放松。"
            "不懂就问教练，没有人会嘲笑认真的人。\n"
            "结尾：迈出第一步，你就已经赢了。"
        ),
        "tags": ["健身", "新手", "健康", "运动", "生活"],
        "cover_prompt": (
            "明亮健身房，新手在教练指导下使用固定器械，"
            "大字标题“第一次健身”，充满活力不夸张。"
        ),
    },
    {
        "topic": "存钱第一步不是记账，是自动转存",
        "title": "钱存不下来？先试试自动转存",
        "script": (
            "开头：每次都月底才发现钱没了？\n"
            "正文：发工资当天，先自动转走固定比例到储蓄账户。"
            "先支付未来的自己，剩下的再安排开销。\n"
            "结尾：把存钱交给系统，而不是意志力。"
        ),
        "tags": ["理财", "存钱", "习惯", "生活", "实用"],
        "cover_prompt": (
            "手机银行界面与存钱罐同框，箭头指向自动转存按钮，"
            "大字标题“先存再花”，简洁金融感设计。"
        ),
    },
]


def _parse_tags(text: str) -> list[str]:
    tags: list[str] = []
    for part in re.split(r"[\s,，、;；]+", (text or "").strip()):
        tag = part.lstrip("#").strip()
        if tag:
            tags.append(tag)
    return tags


class ContentService(Module):
    name = "content"

    def __init__(
        self,
        config: AgentConfig | None = None,
        bus: AgentBus | None = None,
        store: ContentStore | None = None,
        llm: LLMClient | None = None,
        schedule_minutes: int | None = None,
    ) -> None:
        super().__init__(config, bus)
        data_dir = config.data_dir if config is not None else Path("data")
        self.store = store or ContentStore(data_dir / "content.db")
        self._owns_store = store is None
        if llm is not None:
            self.llm = llm
        elif config is not None:
            self.llm = LLMClient(config.base_url, config.api_key, config.model)
        else:
            self.llm = None
        self.schedule_minutes = schedule_minutes
        self._task: asyncio.Task[Any] | None = None
        self._interval_seconds = DEFAULT_SCHEDULE_MINUTES * 60

    async def start(self) -> None:
        if self._task is not None:
            return
        minutes = self.schedule_minutes
        if minutes is None:
            try:
                minutes = max(
                    1, int(os.getenv("CONTENT_SCHEDULE_MINUTES", DEFAULT_SCHEDULE_MINUTES))
                )
            except ValueError:
                minutes = DEFAULT_SCHEDULE_MINUTES
        self._interval_seconds = max(1, minutes) * 60
        await super().start()
        self._task = asyncio.create_task(self._scheduler_loop())

    async def stop(self) -> None:
        task, self._task = self._task, None
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            except Exception:
                pass
        self.running = False
        if self._owns_store:
            self.store.close()
        await super().stop()

    async def handle(self, event: dict[str, Any]) -> None:
        return None

    async def _scheduler_loop(self) -> None:
        while self.running:
            try:
                await asyncio.sleep(self._interval_seconds)
            except asyncio.CancelledError:
                break
            if not self.running:
                break
            try:
                await self.generate_draft()
            except Exception:
                continue

    async def generate_draft(self, topic: str | None = None) -> dict[str, Any]:
        if self.llm is not None and getattr(self.llm, "available", False):
            try:
                draft = self._generate_with_llm(topic)
            except LLMError:
                draft = self._generate_with_template(topic)
        else:
            draft = self._generate_with_template(topic)
        draft["status"] = STATUS_DRAFT
        draft["ready_to_publish"] = True
        draft_id = self.store.save_draft(draft)
        draft["id"] = draft_id
        await self._emit_content_ready(draft)
        return draft

    def get_drafts(
        self, status: str | None = STATUS_DRAFT, limit: int = 50
    ) -> list[dict[str, Any]]:
        return self.store.get_drafts(status, limit)

    def _generate_with_llm(self, topic: str | None) -> dict[str, Any]:
        if self.llm is None:
            return self._generate_with_template(topic)
        system = [
            {
                "role": "system",
                "content": (
                    "你是一名中文短视频内容策划。只输出要求的内容本身，"
                    "不要解释、不要客套、不要使用 Markdown。"
                ),
            }
        ]

        def ask(prompt: str) -> str:
            reply = self.llm.chat(system + [{"role": "user", "content": prompt}])
            return (reply.get("content") or "").strip()

        chosen_topic = (topic or "").strip() or ask(
            "先做选题：给出一个适合 60 秒短视频的中文主题，一句话即可。"
        )
        title = ask(f"基于主题“{chosen_topic}”，写一个吸引人的短视频标题，25 字以内。")
        script = ask(
            f"基于主题“{chosen_topic}”，写一段 60 秒短视频口播脚本，"
            "分开头、正文、结尾，总字数 200 字以内。"
        )
        tags_text = ask(
            f"基于主题“{chosen_topic}”，给出 5 个中文话题标签，用空格分隔，不要带 # 号。"
        )
        cover_prompt = ask(
            f"基于主题“{chosen_topic}”，写一句中文封面提示词，"
            "描述画面构图和封面文字，50 字以内。"
        )
        tags = _parse_tags(tags_text) or FALLBACK_TAGS
        if not (chosen_topic and title and script and cover_prompt):
            return self._generate_with_template(topic)
        return {
            "topic": chosen_topic,
            "title": title,
            "script": script,
            "tags": tags,
            "cover_prompt": cover_prompt,
        }

    def _generate_with_template(self, topic: str | None = None) -> dict[str, Any]:
        template = DRAFT_TEMPLATES[self.store.count_drafts() % len(DRAFT_TEMPLATES)]
        draft = {
            key: template[key]
            for key in ("topic", "title", "script", "tags", "cover_prompt")
        }
        if topic and topic.strip():
            topic = topic.strip()
            draft["topic"] = topic
            draft["title"] = f"一分钟讲清楚：{topic}"
            draft["script"] = (
                "开头：这个问题，很多人都有同感。\n"
                f"正文：今天用一个例子聊聊{topic}，记住三个关键点就够了。\n"
                "结尾：如果你觉得有用，点个赞，我们下次继续。"
            )
            draft["tags"] = FALLBACK_TAGS
            draft["cover_prompt"] = (
                f"短视频封面，主题：{topic}，明亮简洁，人物居中，配大字标题。"
            )
        return draft

    async def _emit_content_ready(self, draft: dict[str, Any]) -> None:
        if self.bus is None:
            return
        await self.bus.apublish(
            "content_ready",
            {
                "draft_id": draft["id"],
                "ready_to_publish": bool(draft["ready_to_publish"]),
                "topic": draft.get("topic", ""),
                "title": draft.get("title", ""),
            },
        )
