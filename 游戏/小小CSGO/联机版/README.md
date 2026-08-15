# STRIKE//ZONE 可复用开发包

这是从网页版 3D 枪战原型中整理出来的可复用代码，适合作为新 FPS / 枪战游戏项目的起步基础。目录只包含源码、配置、文档与许可，不包含 `node_modules`、构建产物和测试产物。

## 目录结构

```text
reusable-kit/
├─ server/                    权威服务器模块
├─ client/                    前端源码与工程配置
├─ docs/                      开发记录与首屏预览
├─ THIRD_PARTY_NOTICES.md     第三方许可声明
└─ licenses/                  开源许可原文
```

## server/ 模块

| 文件 | 用途 |
| --- | --- |
| `server-reference-index.mjs` | 完整权威服务器参考实现：WebSocket 房间、快照、事件、重连、防滥用 |
| `fixed-step.mjs` | 固定步长模拟与追赶上限 |
| `geometry.mjs` | 玩家半径、移动解析、矩形碰撞 |
| `combat.mjs` | 武器状态机、距离衰减、护甲吸收、命中判定 |
| `weapons.mjs` | 武器注册表与数值指标 |
| `maps.mjs` | 地图定义、出生点、拾取物、模式地图池 |
| `protocol.mjs` | 入站消息校验与归一化 |
| `snapshot-delta.mjs` | 快照增量编码与重建 |
| `backpressure.mjs` | 出站积压保护 |
| `state-store.mjs` | 原子 JSON 状态存储 |
| `bot-ai.mjs` | Bot 目标选择、反应窗口、射击决策 |
| `navigation.mjs` | 导航点图与绕障寻路 |
| `tactics.mjs` | 小队阵型与战术目的地 |
| `waves.mjs` | 生存波次难度曲线 |
| `killstreaks.mjs` | 连杀奖励循环 |
| `protection.mjs` | 出生保护与基地安全区 |
| `ctf.mjs` | 夺旗状态机 |
| `domination.mjs` | 占领点状态机 |
| `matchmaking.mjs` | 排位匹配队列 |
| `rating.mjs` | 评分与分段计算 |
| `ranking-service.mjs` | 匿名评分存档与榜单 |

## client/ 模块

`client/src/game/` 下的核心可复用代码：

| 文件 | 用途 |
| --- | --- |
| `network.ts` | WebSocket 客户端：快照、增量、事件、重连、同步请求 |
| `interpolation.ts` | 远端实体快照插值缓冲 |
| `reconciliation.ts` | 本地预测、未确认输入回放、硬校正 |
| `audio.ts` | 纯 Web Audio 程序化音效与空间音频 |
| `radar.ts` | 世界坐标到雷达投影 |
| `mapRegistry.ts` | 地图定义桥接、本地碰撞预测 |
| `store.ts` | Zustand 游戏状态 |
| `i18n.ts` | 多语言字典与切换（中/英/日/韩） |

`client/src/ui/` 提供设置面板、更新日志抽屉与语言切换器。`client/src/App.tsx`、`client/src/Arena.tsx`、`client/src/styles.css` 是完整的 UI 与 3D 场景参考。`client/` 根目录带有 `package.json`、Vite、TypeScript 与 Playwright 配置，可作为新项目脚手架。

## 新项目起步建议

1. 复制 `client/` 与 `server/` 到新项目。
2. 安装依赖：`pnpm install`（依赖见 `client/package.json`）。
3. 先以 `server-reference-index.mjs` 为权威服务器参考，按新玩法裁剪房间、模式和协议。
4. 保留 `client/src/game/network.ts`、`interpolation.ts`、`reconciliation.ts` 的网络链路，替换武器、地图与玩法逻辑。
5. 保持 `THIRD_PARTY_NOTICES.md` 与 `licenses/` 随代码分发。

## 原项目运行方式

```powershell
pnpm install
pnpm dev:server   # 权威游戏服务器，默认 127.0.0.1:2567
pnpm dev          # 前端，默认 http://127.0.0.1:5173
```

完整开发记录见 `docs/对话与开发记录.md`。

## 许可

项目依赖均为 MIT / Apache-2.0 等宽松许可。`server/combat.mjs` 与 `client/src/game/interpolation.ts` 改编自 MIT 许可的 [browser-shooter](https://github.com/vkopitsa/browser-shooter)，许可原文保留在 `licenses/browser-shooter-MIT.txt`。
