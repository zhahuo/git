# 虚拟卡网

一个开箱即用的中文虚拟卡密商城：用户浏览商品、加入购物车、下单，模拟支付或余额支付成功后自动发货并展示卡密；管理员在后台管理商品、分类、卡密库存、订单与销售统计。

## 功能

- 商城前台：商品搜索、分类筛选、排序、商品详情、购物车、结算、收银台、支付成功自动发货
- 个人中心：订单列表与详情、已购卡密查看与复制、余额充值、余额流水
- 管理后台：销售概览、商品/分类 CRUD、上下架、卡密批量导入与去重、订单取消与发货、低库存预警
- 业务边界：同一卡密只发放一次；库存不足禁止下单；余额不足支付返回 409；重复支付返回 409；待支付订单可取消
- 响应式界面：桌面与移动端均可完整使用

## 技术栈

- Next.js 15（App Router）+ TypeScript
- Tailwind CSS 4
- SQLite（`node:sqlite`，无原生数据库依赖）
- lucide-react 图标、本地 SVG 商品封面

## 快速开始

要求：Node.js 24+ 与 pnpm 10+。

```bash
pnpm install
pnpm dev
```

打开 http://localhost:3000 即可使用。首次访问会自动创建 `data/app.db` 并写入种子数据。

生产模式：

```bash
pnpm build
pnpm start
```

外部集成（可选）：如要让闲鱼自动发货等系统调用发卡接口，启动前设置环境变量 `INTEGRATION_API_TOKEN`（例如 PowerShell：`$env:INTEGRATION_API_TOKEN='your-token'`），接口文档见 API.md 第 6 节。

常用命令：

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 开发模式 |
| `pnpm build` | 生产构建 |
| `pnpm start` | 启动生产服务器 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm db:reset` | 删除数据库，下次启动重建种子数据 |
| `pnpm smoke` | 集成冒烟测试（需先启动服务器） |

## 默认账号

| 角色 | 用户名 | 密码 | 说明 |
| --- | --- | --- | --- |
| 管理员 | `admin` | `admin123` | 可访问 `/admin` 管理后台 |
| 普通用户 | `user` | `user123` | 初始余额 5000 分（¥50.00） |

## 数据库

- 数据库文件：`data/app.db`，首次访问自动建表并写入种子数据
- 金额统一使用整数「分」存储，例如 `4690` 表示 ¥46.90
- 重置：`pnpm db:reset`，删除 `data/app.db*` 后下次启动重建
- 所有 SQL 集中在 `src/lib/schema.sql`

## 目录结构

```text
.
├── API.md                        # 接口文档（权威）
├── src/
│   ├── app/                      # Next.js 页面与 API 路由
│   │   ├── page.tsx              # 首页商城
│   │   ├── products/             # 商品详情
│   │   ├── cart/                 # 购物车
│   │   ├── checkout/             # 结算
│   │   ├── pay/                  # 收银台
│   │   ├── auth/                 # 登录/注册
│   │   ├── account/              # 个人中心
│   │   ├── admin/                # 管理后台
│   │   └── api/                  # 后端接口
│   ├── components/               # 页面组件
│   └── lib/                      # 数据库、鉴权、业务逻辑
├── public/covers/                # 商品封面 SVG
├── scripts/
│   ├── reset-db.mjs              # 数据库重置
│   ├── smoke.mjs                 # 集成冒烟测试
│   └── screenshots.mjs           # 桌面/移动端截图脚本
├── data/                         # SQLite 数据库目录（自动创建）
├── docs/
│   ├── 模块契约.md
│   ├── 模块笔记/                 # 各模块交付笔记
│   └── screenshots/              # 桌面/移动端截图
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## 部署

### VPS（Node 24 + pnpm）

```bash
# 1. 安装 Node.js 24 与 pnpm
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pnpm

# 2. 上传或克隆项目后安装依赖
pnpm install --frozen-lockfile

# 3. 构建并启动（建议用 pm2 或 systemd 守护）
pnpm build
pnpm start -- -p 3000
```

`data/app.db` 会在首次启动时自动创建，请确保运行用户对 `data/` 目录有写权限。生产环境建议在前面加 Nginx 反向代理并配置 HTTPS。

### Docker

构建并运行：

```bash
docker build -t virtual-card-mall .
docker run -d --name virtual-card-mall -p 3000:3000 -v virtual-card-data:/app/data virtual-card-mall
```

或使用 Compose：

```bash
docker compose up -d --build
```

Compose 配置会持久化 `data/` 目录（命名卷 `virtual-card-data`），重启容器后订单、用户与卡密数据不会丢失。镜像基于 `node:24-alpine`，应用使用 `node:sqlite`，无需安装原生 SQLite 依赖。

## 闲鱼自动回复/自动发货集成

### 卡网侧

外部集成接口使用 `INTEGRATION_API_TOKEN` 鉴权（生产环境请使用足够长的随机字符串）。启动卡网时设置：

```bash
export INTEGRATION_API_TOKEN=your-long-random-token
pnpm build && pnpm start
```

- `POST /api/integration/cards/claim`：闲鱼/外部系统领卡接口，请求头 `Authorization: Bearer <INTEGRATION_API_TOKEN>`，请求体 `{ "product_id": 1, "quantity": 1, "external_order_no": "XIANYU-xxx" }`。返回 `claim_no` 与卡密内容；同一 `external_order_no` 重复调用返回 409，不会重复扣库存。
- `GET /api/admin/integration/claims`：管理端发卡对账接口，管理员可在后台「发卡记录」页查看时间、流水号、外部订单号、商品、数量与卡密 ID。
- 令牌未配置时领卡接口返回 503，错误令牌返回 401。

### 发卡桥接（模块7）

桥接服务位于 `integrations/xianyu/bridge/`，把闲鱼侧订单触发转换为卡网领卡调用，再把卡密按模板发送给买家：

```bash
cd integrations/xianyu/bridge
export INTEGRATION_API_TOKEN=your-long-random-token
export BRIDGE_TRIGGER_TOKEN=bridge-service-token   # 生产必须设置
node server.mjs                                     # 默认 127.0.0.1:8787
```

- 触发：`POST /trigger`，请求头 `Authorization: Bearer <BRIDGE_TRIGGER_TOKEN>`，事件体含 `external_order_no`、`item_id` 或 `title`、`buyer_id`、`trigger`。
- 商品映射：编辑 `integrations/xianyu/bridge/config/mapping.json`，把闲鱼 `item_id`/标题关键词映射到卡网 `product_id` 与数量。
- 消息发送：`config/settings.json -> sender.http.url` 指向闲鱼后端的回复接口；未配置时只写日志便于联调。
- 对账：卡网 `integration_claims` 表与后台「发卡记录」页面保存每次发卡的 `claim_no`、外部订单号与卡密 ID。

### 闲鱼后端（模块6）

闲鱼自动回复后端部署自外部仓库 `GuDong2003/xianyu-auto-reply-fix`（FastAPI + SQLite + Playwright，AGPL-3.0），按该仓库文档启动后，在「消息、拍下、付款」节点把订单事件转发到桥接 `POST /trigger`，桥接完成领卡后通过 `sender.http.url` 把卡密消息回传给闲鱼买家。详细接入方式见 `integrations/xianyu/bridge/README.md` 与 `docs/模块笔记/模块7-闲鱼自动发货.md`。

## 冒烟测试

启动服务器后执行：

```bash
pnpm smoke
```

脚本覆盖健康检查、商品/分类、注册登录、下单、模拟支付、余额支付与流水、余额不足、库存不足、重复支付、权限边界、后台统计/商品/分类/卡密/订单管理，以及闲鱼发卡（领卡、重复领卡、库存不足、发卡记录对账）等关键接口。设置 `INTEGRATION_API_TOKEN` 后运行可额外执行集成检查，全部通过返回 0，任一失败返回非 0 退出码；未设置令牌时集成检查输出 SKIP。
