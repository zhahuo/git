# AI 智能体

一个可以持续成长的本体：有长期记忆、情绪状态、联网搜索能力，可以接入聊天软件对话，也可以把短视频发布到短视频平台。

详细操作步骤请看 [使用说明.md](使用说明.md)。

## 第一版已经有的能力

- 长期记忆：用本地数据库保存对话、重要事件、用户偏好。
- 情绪系统：根据对话内容产生情绪变化，情绪会影响说话语气，并且会随时间慢慢平复。
- 联网能力：内置网页搜索和网页正文读取工具，默认演示模式，不依赖外部账号。
- 聊天渠道：Telegram 官方 Bot API，以及控制台直接对话。
- 短视频发布：抖音和 TikTok 的官方 API 适配骨架，默认演示模式，不会真的发视频。
- 多模块并行：大脑、记忆、情绪、联网、聊天、内容、发布 7 个模块在同一个事件总线上同时运行。
- 零第三方依赖：只使用 Python 标准库，可以直接运行。

## 快速开始

```bash
python -m agent run
```

`python -m agent run` 会同时启动全部模块。没配置模型接口时，会进入离线演示模式；配置模型后会自动变成真正的 AI 对话。

只跑控制台对话：

```bash
python -m agent --channel console
```

## 配置

把 `.env.example` 里的变量填好，或在项目根目录放一个 `config.json`：

```json
{
  "name": "小忆",
  "model": "gpt-4o-mini",
  "base_url": "https://api.openai.com/v1",
  "api_key": "你的密钥",
  "search_provider": "dry_run",
  "dry_run": true
}
```

常用环境变量：

- `AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL`：模型接口。
- `TELEGRAM_BOT_TOKEN`：Telegram 机器人令牌。
- `SEARCH_PROVIDER`：`dry_run`、`tavily`、`serper`、`brave`。
- `SEARCH_API_KEY`：搜索服务密钥。
- `DOUYIN_CLIENT_KEY`、`DOUYIN_CLIENT_SECRET`：抖音开放平台凭证。
- `TIKTOK_CLIENT_KEY`、`TIKTOK_CLIENT_SECRET`：TikTok 开发者凭证。
- `AGENT_ENABLED_MODULES`：要启动的模块列表，逗号分隔，默认全部启动。
- `WEB_WATCH_QUERIES`：联网服务定时关注的搜索词，逗号分隔。
- `CONTENT_SCHEDULE_MINUTES`：内容自动生成间隔，默认 1440 分钟。

## 监控与调试面板

后台默认包含 `monitor` 和 `debug` 模块，实时数据写入 `data/monitor.db`：

- 网页版：`python -m scripts.serve_dashboard`，浏览器打开 `http://127.0.0.1:8765`。
- 悬浮窗：`python -m scripts.open_dashboard`，或启动后台时自动带 pywebview 悬浮窗。
- 监控页：Token、今日对话、情绪、模块状态，以及 Token/情绪/记忆趋势、最近对话、模型调用、发布任务。
- 调试页：实时日志流（可过滤级别）、事件总线记录、模块运行状态、非敏感配置概览。
- 刷新间隔：监控页 1 秒，调试页 3 秒；Tk 悬浮窗通过 `DASHBOARD_REFRESH_SECONDS` 调整。

调试数据保留 30 天，由 `MONITOR_CLEANUP_DAYS` 控制；密钥和 Token 在面板中只显示“已配置/未配置”。

## 启动 Telegram 机器人

```bash
python -m agent run --channel telegram
```

未配置 `TELEGRAM_BOT_TOKEN` 时，聊天服务会保持运行但暂不轮询。

## 多模块并行流程

```text
Telegram/控制台消息
    → 事件总线 user_message
        → 大脑：情绪 + 记忆 + 模型回复
        → 记忆服务：落库、压缩
        → 情绪服务：更新情绪并广播
内容调度器
    → 内容服务：选题、脚本、标题、话题、封面提示词
    → content_ready
        → 发布服务：抖音/TikTok 演示发布或官方 API
联网服务
    → 定时搜索关注词 → content_ready
```

## 目录结构

```text
agent/
  brain.py        大脑主循环
  bus.py          事件总线
  runner.py       多模块运行器
  modules.py      模块注册与装配
  services/       记忆、情绪、联网、聊天、内容、发布服务
  emotion.py      情绪状态与情绪分析
  memory.py       本地长期记忆
  llm.py          模型接口
  tools.py        搜索、读网页、记忆、发视频等工具
  channels/       聊天渠道
  social/         短视频发布渠道
tests/            自动化测试
data/             运行时数据
scripts/          冒烟测试等辅助脚本
```

## 路线图

1. 让视频素材自动生成和成片渲染，真正实现全自动发视频。
2. 接入企业微信、Discord 等更多官方聊天渠道。
3. 做一个可视化控制台，直接查看情绪曲线、记忆库和发布记录。
4. 接入更多搜索服务，并按账号人格自动筛选热点选题。

## 平台合规说明

只建议通过各平台官方 API 接入。个人微信、个人抖音账号的自动化操作通常违反平台服务条款，容易导致封号或法律风险，所以本项目默认不提供这类实现。
