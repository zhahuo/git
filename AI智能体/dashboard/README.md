# 悬浮窗仪表盘模块

基于 pywebview 的桌面悬浮窗仪表盘，从 `data/monitor.db` 读取监控数据并实时展示。

## 功能

- 置顶悬浮窗：宽 440、高 680，可缩放、可拖动。
- 每秒刷新：总 Token、今日对话数、当前情绪、模块状态。
- 图表：Token 消耗趋势、情绪曲线、记忆量变化（ECharts）。
- 列表：最近对话、最近模型调用、最近发布任务。
- 数据接口：`get_summary()`、`get_conversations(limit)`、`get_llm_calls(limit)`、`get_emotions(limit)`、`get_memory_stats(limit)`、`get_publish_tasks(limit)`。

## 运行

仪表盘作为 `DashboardModule` 接入智能体，注册由集成会话负责。单独调试：

```bash
python -m pip install pywebview
python -c "import asyncio; from agent.dashboard import DashboardModule; m = DashboardModule(); m.start(); asyncio.get_event_loop().run_forever()"
```

## 依赖

- [pywebview](https://github.com/r0x0r/pywebview) 6.x
- [ECharts](https://echarts.apache.org/) 5.5.1（本地 `static/echarts.min.js`，失败时回退 CDN）
