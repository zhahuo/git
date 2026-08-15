# 虚拟卡网 API 文档

本文档为「虚拟卡网」后端接口的权威说明，由模块 1（基础层）维护。接口基于 Next.js App Router 路由处理器实现，统一返回 JSON。

## 1. 通用约定

- 基础路径：`/api`
- 金额一律使用整数「分」传输与存储，例如 `4690` 表示 ¥46.90。
- 时间统一为 UTC 字符串；数据库内为 `YYYY-MM-DD HH:MM:SS`，接口示例同时展示 ISO 8601 形式。前端展示时转换为 Asia/Shanghai。
- 会话使用 httpOnly Cookie：`vc_session`，有效期 30 天。浏览器调用登录、注册接口后自动携带。
- 角色：`user`（普通用户）、`admin`（管理员，种子账号 `admin / admin123`）。普通用户种子账号 `user / user123`，初始余额 5000 分。
- 管理端接口统一以 `/api/admin/` 开头，仅 `admin` 角色可访问；普通用户访问返回 `403`，未登录返回 `401`。

## 2. 错误码

| 状态码 | 含义 | 常见场景 |
| --- | --- | --- |
| 400 | 请求格式或参数错误 | 缺少字段、数量不合法、JSON 解析失败 |
| 401 | 未登录或会话失效 | 未携带 `vc_session`、会话已过期 |
| 403 | 无权限 | 普通用户访问 `/api/admin/*` |
| 404 | 资源不存在 | 商品/订单/分类/卡密不存在 |
| 409 | 业务状态冲突 | 库存不足、余额不足、订单状态不可操作、用户名或分类已存在 |
| 500 | 服务器内部错误 | 未预期的数据库或运行时异常 |

错误响应体：

```json
{ "error": "商品不存在或已下架" }
```

部分错误会附带 `details` 字段：

```json
{ "error": "余额不足", "details": { "required_cents": 4690, "balance_cents": 1000 } }
```

## 3. 订单状态机与卡密绑定规则

### 3.1 订单状态机

合法状态：`pending`（待支付）、`paid`（已支付）、`delivered`（已发货）、`cancelled`（已取消）。

```text
pending ── 支付成功 ──> delivered
pending ── 取消 ──> cancelled
pending ──> paid ──> delivered（保留的中间状态，用于未来人工支付/后台流程）
```

当前支付流程（`mock` 或 `balance`）在单个事务内完成：记录支付 → 锁定卡密 → 更新销量 → 状态置为 `delivered`，因此客户端观察到的最终状态直接是 `delivered`。`paid` 是数据表预留的中间状态；管理端「发货」操作只允许作用于 `paid` 订单。

### 3.2 卡密绑定规则

- 下单时按商品当前可用库存校验，卡密不足直接拒绝下单（`409`）。
- 支付时在 `BEGIN IMMEDIATE` 事务内再次校验库存，按 `available` 顺序锁定卡密，将卡密更新为 `sold`，绑定到对应 `order_item_id`，写入 `sold_at`。
- 同一张卡密只会绑定到一条订单明细；`(product_id, content)` 唯一索引从导入端防止重复。
- 若支付时库存已不足，订单自动置为 `cancelled` 并提交，返回 `409`，不会产生部分发货或扣款残留。
- 余额支付顺序：校验余额 → 校验并绑定卡密 → 扣余额 → 写 `balance_logs`（type=`consume`）→ 记录支付 → 置为 `delivered`。任一环节失败整体回滚。
- 用户只能支付/查看自己的订单；管理端可查看所有订单。

## 4. 公共接口

### 4.1 GET /api/health

健康检查，无需鉴权。

响应 `200`：

```json
{
  "ok": true,
  "service": "虚拟卡网",
  "time": "2026-08-15T06:00:00.000Z"
}
```

### 4.2 GET /api/products

查询在售商品，无需鉴权。

查询参数：

| 参数 | 说明 |
| --- | --- |
| `q` | 搜索商品名称/描述 |
| `category` | 分类 slug 或名称 |
| `sort` | `newest`（默认）、`price_asc`、`price_desc`、`sales` |

响应 `200`：

```json
{
  "products": [
    {
      "id": 1,
      "category_id": 1,
      "category_name": "游戏充值",
      "name": "Steam 充值卡 50 元",
      "description": "官方正品 Steam 钱包充值码。",
      "cover": "/covers/steam.svg",
      "price_cents": 4690,
      "original_price_cents": 5000,
      "is_active": 1,
      "stock_alert_threshold": 10,
      "stock_count": 60,
      "sales_count": 0,
      "created_at": "2026-08-15 06:00:00",
      "updated_at": "2026-08-15 06:00:00"
    }
  ]
}
```

### 4.3 GET /api/products/[id]

商品详情，仅返回在售商品，无需鉴权。

响应 `200`：`{ "product": { ... } }`，字段同 4.2。

错误：

| 状态码 | 说明 |
| --- | --- |
| 400 | `id` 不是合法正整数 |
| 404 | 商品不存在或已下架 |

### 4.4 GET /api/categories

分类列表（含在售商品数），无需鉴权。

响应 `200`：

```json
{
  "categories": [
    {
      "id": 1,
      "name": "游戏充值",
      "slug": "游戏充值",
      "sort_order": 0,
      "created_at": "2026-08-15 06:00:00",
      "product_count": 2
    }
  ]
}
```

### 4.5 POST /api/auth/register

注册并自动登录。请求体：

```json
{
  "username": "newuser",
  "password": "123456",
  "nickname": "新用户"
}
```

规则：用户名 3-20 位字母/数字/下划线；密码 6-32 位；昵称 2-20 位（可选，默认取用户名）。昵称可为空。

响应 `201`：

```json
{
  "user": {
    "id": 3,
    "username": "newuser",
    "nickname": "新用户",
    "email": "",
    "role": "user",
    "balance_cents": 0,
    "created_at": "2026-08-15 06:00:00"
  }
}
```

错误：`400` 参数不合法；`409` 用户名已存在。

### 4.6 POST /api/auth/login

请求体：

```json
{ "username": "user", "password": "user123" }
```

响应 `200`：`{ "user": { ... } }`。

错误：`401` 用户名或密码错误。

### 4.7 POST /api/auth/logout

清除当前会话，无需请求体。响应 `200`：

```json
{ "ok": true }
```

### 4.8 GET /api/auth/me

当前登录用户信息。响应 `200`：`{ "user": { ... } }`。

错误：`401` 未登录。

### 4.9 POST /api/orders

创建订单，需要登录。服务端重新计价并校验库存，前端传入的价格不生效。

请求体：

```json
{
  "items": [
    { "product_id": 1, "quantity": 1 },
    { "product_id": 4, "quantity": 2 }
  ],
  "remark": "尽快发货"
}
```

响应 `201`：

```json
{
  "order": {
    "id": 1,
    "order_no": "VC17552520000001234",
    "user_id": 2,
    "username": "user",
    "status": "pending",
    "total_cents": 7870,
    "remark": "尽快发货",
    "paid_at": null,
    "created_at": "2026-08-15 06:00:00",
    "updated_at": "2026-08-15 06:00:00",
    "items": [
      {
        "id": 1,
        "order_id": 1,
        "product_id": 1,
        "product_name": "Steam 充值卡 50 元",
        "cover": "/covers/steam.svg",
        "unit_price_cents": 4690,
        "quantity": 1
      }
    ]
  }
}
```

错误：

| 状态码 | 说明 |
| --- | --- |
| 400 | 购物车为空、数量不合法、商品不存在或已下架 |
| 401 | 未登录 |
| 409 | 卡密库存不足 |

### 4.10 GET /api/orders

当前用户订单列表（最新 100 条），需要登录。响应 `200`：`{ "orders": [ ... ] }`，订单字段同 4.9（不含卡密）。

### 4.11 GET /api/orders/[id]

当前用户订单详情，需要登录；只能查看自己的订单。发货后 `items[].cards` 包含绑定卡密。

响应 `200`：

```json
{
  "order": {
    "id": 1,
    "order_no": "VC17552520000001234",
    "user_id": 2,
    "username": "user",
    "status": "delivered",
    "total_cents": 4690,
    "remark": "",
    "paid_at": "2026-08-15 06:01:00",
    "created_at": "2026-08-15 06:00:00",
    "updated_at": "2026-08-15 06:01:00",
    "items": [
      {
        "id": 1,
        "order_id": 1,
        "product_id": 1,
        "product_name": "Steam 充值卡 50 元",
        "cover": "/covers/steam.svg",
        "unit_price_cents": 4690,
        "quantity": 1,
        "cards": [
          {
            "id": 1,
            "product_id": 1,
            "content": "1234-5678-9012-3456",
            "status": "sold",
            "order_item_id": 1,
            "sold_at": "2026-08-15 06:01:00",
            "created_at": "2026-08-15 06:00:00"
          }
        ]
      }
    ]
  }
}
```

错误：`400` 参数错误；`401` 未登录；`404` 订单不存在或不属于当前用户（不暴露他人订单存在性）。

### 4.12 POST /api/payments/[orderId]

模拟支付，需要登录，只能支付自己的订单。支付成功后自动绑定卡密并置为 `delivered`。

请求体：

```json
{ "method": "mock" }
```

`method` 取值：`mock`（模拟支付，不扣余额）、`balance`（余额支付，扣减余额并写 `balance_logs`）。缺省按 `mock` 处理。

响应 `200`：

```json
{
  "order": { "id": 1, "status": "delivered", "...": "同 4.11 订单对象" },
  "cards": [
    {
      "id": 1,
      "product_id": 1,
      "content": "1234-5678-9012-3456",
      "status": "sold",
      "order_item_id": 1,
      "sold_at": "2026-08-15 06:01:00",
      "created_at": "2026-08-15 06:00:00"
    }
  ]
}
```

错误：

| 状态码 | 说明 |
| --- | --- |
| 400 | 订单 ID 无效 |
| 401 | 未登录 |
| 404 | 订单不存在 |
| 409 | 订单状态不可支付、余额不足、库存不足（此时订单已自动取消） |

### 4.13 GET /api/balance

当前用户余额与最近 50 条余额流水，需要登录。

响应 `200`：

```json
{
  "balance_cents": 310,
  "logs": [
    {
      "id": 1,
      "user_id": 2,
      "change_cents": -4690,
      "balance_after_cents": 310,
      "type": "consume",
      "note": "支付订单 VC17552520000001234",
      "created_at": "2026-08-15 06:01:00"
    }
  ]
}
```

`logs[].type` 取值：`recharge`、`consume`、`refund`、`adjust`。

### 4.14 POST /api/balance/recharge

演示充值，需要登录。请求体：

```json
{ "amount_cents": 10000 }
```

金额需为 1-1000000 之间的整数分。响应 `201`：

```json
{
  "balance_cents": 10310,
  "log": {
    "id": 2,
    "user_id": 2,
    "change_cents": 10000,
    "balance_after_cents": 10310,
    "type": "recharge",
    "note": "演示充值",
    "created_at": "2026-08-15 06:02:00"
  }
}
```

错误：`400` 金额不合法；`401` 未登录。

## 5. 管理端接口

以下接口均要求管理员登录，统一错误：

| 状态码 | 说明 |
| --- | --- |
| 401 | 未登录 |
| 403 | 非管理员角色 |

### 5.1 GET /api/admin/products

商品管理列表（含下架商品），支持筛选：

| 参数 | 说明 |
| --- | --- |
| `q` | 搜索名称/描述 |
| `category_id` | 按分类筛选 |
| `status` | `active` 或 `inactive` |

响应 `200`：`{ "products": [ ... ] }`，商品字段同 4.2（含 `stock_count`、`sales_count`）。

### 5.2 POST /api/admin/products

新增商品。请求体：

```json
{
  "category_id": 1,
  "name": "Steam 充值卡 200 元",
  "description": "官方正品充值码。",
  "cover": "/covers/steam-200.svg",
  "price_cents": 18800,
  "original_price_cents": 20000,
  "is_active": 1,
  "stock_alert_threshold": 10
}
```

`cover` 缺省为 `/covers/card.svg`，`stock_alert_threshold` 缺省为 10，`is_active` 缺省为 1。响应 `201`：`{ "product": { ... } }`。

错误：`400` 参数不合法；`404` 分类不存在。

### 5.3 GET /api/admin/products/[id]

单个商品详情（含下架商品）。响应 `200`：`{ "product": { ... } }`；`404` 商品不存在。

### 5.4 PATCH /api/admin/products/[id]

部分更新商品，可传 `name`、`description`、`cover`、`category_id`、`price_cents`、`original_price_cents`、`is_active`、`stock_alert_threshold` 中的任意字段。

请求体示例：

```json
{ "price_cents": 4500, "is_active": 0 }
```

响应 `200`：`{ "product": { ... } }`。

错误：`400` 无更新字段或参数不合法；`404` 商品不存在。

### 5.5 DELETE /api/admin/products/[id]

删除商品（级联删除其未售卡密）。商品存在已售出卡密时返回 `409`，避免删除订单发货记录，建议改用 `PATCH { "is_active": 0 }` 下架。响应 `200`：`{ "ok": true }`；`404` 商品不存在。

### 5.6 GET /api/admin/categories

分类管理列表（含商品数，包含下架商品）。响应 `200`：`{ "categories": [ ... ] }`。

### 5.7 POST /api/admin/categories

新增分类。请求体：

```json
{ "name": "虚拟商品", "slug": "virtual", "sort_order": 10 }
```

`slug` 缺省取 `name`。响应 `201`：`{ "category": { ... } }`。

错误：`400` 名称/别名不合法；`409` 名称或别名已存在。

### 5.8 PUT /api/admin/categories/[id]

全量更新分类，字段同 5.7。响应 `200`：`{ "category": { ... } }`。

### 5.9 DELETE /api/admin/categories/[id]

删除分类，其下商品自动置为未分类（`category_id = NULL`）。响应 `200`：`{ "ok": true }`；`404` 分类不存在。

### 5.10 GET /api/admin/cards

卡密管理列表，支持筛选：

| 参数 | 说明 |
| --- | --- |
| `product_id` | 按商品筛选 |
| `status` | `available` 或 `sold` |
| `q` | 模糊搜索卡密内容 |
| `limit` | 默认 50，最大 200 |
| `offset` | 默认 0 |

响应 `200`：

```json
{
  "cards": [
    {
      "id": 1,
      "product_id": 1,
      "product_name": "Steam 充值卡 50 元",
      "content": "1234-5678-9012-3456",
      "status": "available",
      "order_item_id": null,
      "sold_at": null,
      "created_at": "2026-08-15 06:00:00"
    }
  ],
  "total": 60
}
```

### 5.11 POST /api/admin/cards

批量导入卡密。两种请求体格式任选：

数组格式：

```json
{
  "product_id": 1,
  "contents": ["AAAA-BBBB-CCCC-DDDD", "EEEE-FFFF-0000-1111"]
}
```

多行文本格式：

```json
{
  "product_id": 1,
  "content": "AAAA-BBBB-CCCC-DDDD\nEEEE-FFFF-0000-1111"
}
```

响应 `201`：

```json
{ "imported": 2, "skipped": 0, "product_id": 1 }
```

`skipped` 表示重复或超长被忽略的条数；`(product_id, content)` 唯一，重复卡密不会重复入库。单次最多 500 条。

### 5.12 DELETE /api/admin/cards/[id]

删除卡密。仅 `available` 卡密可删除；已售出卡密返回 `409`（需保留用于订单追溯）。响应 `200`：`{ "ok": true }`。

### 5.13 GET /api/admin/orders

全部订单列表，支持筛选：

| 参数 | 说明 |
| --- | --- |
| `status` | `pending` / `paid` / `delivered` / `cancelled` |
| `q` | 搜索订单号或用户名 |
| `limit` | 默认 50，最大 200 |
| `offset` | 默认 0 |

响应 `200`：`{ "orders": [ ... ], "total": 12 }`，订单对象含 `items`。

### 5.14 PATCH /api/admin/orders/[id]

订单状态管理。请求体：

```json
{ "action": "cancel" }
```

`action` 取值：

| 取值 | 规则 |
| --- | --- |
| `cancel` | 仅 `pending` 订单可取消，置为 `cancelled` |
| `deliver` | 仅 `paid` 订单可发货，绑定卡密并置为 `delivered` |

响应 `200`：`{ "order": { ... }, "cards": [ ... ] }`（`cancel` 无 `cards`）。

错误：`400` action 不合法；`404` 订单不存在；`409` 订单状态不可操作或库存不足。

### 5.15 GET /api/admin/stats

销售统计与库存预警。响应 `200`：

```json
{
  "today": {
    "orders_count": 3,
    "sales_count": 4,
    "revenue_cents": 13670
  },
  "total": {
    "orders_count": 10,
    "sales_count": 15,
    "revenue_cents": 67210
  },
  "pending_orders_count": 1,
  "totalUsers": 3,
  "low_stock_products": [
    {
      "id": 9,
      "category_id": 4,
      "category_name": "生活服务",
      "name": "美团外卖 20 元代金券",
      "stock_count": 8,
      "stock_alert_threshold": 10,
      "sales_count": 0
    }
  ],
  "category_sales": [
    { "name": "游戏充值", "sales_count": 6, "revenue_cents": 28140 }
  ],
  "recent_orders": []
}
```

说明：`today` 按 Asia/Shanghai 自然日统计已发货订单；`total` 为累计已发货订单统计；`pending_orders_count` 为待支付订单数；`totalUsers` 为注册用户总数；`low_stock_products` 为可用库存小于等于预警阈值的商品；`recent_orders` 为最近 10 个订单。

## 6. 字段说明

### orders

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | number | 自增主键 |
| `order_no` | string | 唯一订单号 |
| `user_id` | number | 下单用户 |
| `username` | string | 下单用户名（联表冗余展示） |
| `status` | string | `pending` / `paid` / `delivered` / `cancelled` |
| `total_cents` | number | 服务端计价的订单总额（分） |
| `remark` | string | 备注，最多 200 字 |
| `paid_at` | string/null | 支付/发货时间（UTC） |
| `items` | array | 订单明细，发货后含 `cards` |

### cards

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | number | 自增主键 |
| `product_id` | number | 所属商品 |
| `content` | string | 卡密内容 |
| `status` | string | `available` / `sold` |
| `order_item_id` | number/null | 绑定的订单明细；未售出为 null |
| `sold_at` | string/null | 售出时间（UTC） |
