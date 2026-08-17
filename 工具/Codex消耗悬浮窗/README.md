# Codex 消耗小鲸鱼悬浮窗

一个可爱的 Windows 桌面悬浮窗，实时展示 Codex 本地模型消耗。

## 功能

- 今日 Token、本周 Token、今日费用估算。
- 右键查看本周各模型用量明细。
- 置顶、无边框、可拖拽，可最小化成小鲸鱼图标。
- 本地增量读取 Codex 日志，数据缓存在 `data/usage.db`，重启不会重复计数。

## 启动

双击 `start.cmd`，或手动运行：

```text
C:\Users\袁\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe codex_cost_widget.py
```

## 数据来源

- 日志库：`C:\Users\袁\.codex\logs_2.sqlite`
- 读取 `codex_core::session::turn` 中 `post sampling token usage` 记录。
- 只读访问，不会修改 Codex 数据。

## 费用配置

编辑 `costs.json` 可调整每千 Token 的估算价格，单位为“元 / 1K Token”。未配置的模型按 0 元显示。
