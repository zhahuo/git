# 闲鱼发卡桥接（模块7）

独立适配服务：把闲鱼侧订单触发（消息 / 拍下 / 付款）转换为卡网
`POST /api/integration/cards/claim` 领卡调用，再把卡密按模板发给买家。

## 目录

- `config/mapping.json`：闲鱼 `item_id` / 标题关键词 → 卡网 `product_id`、数量
- `config/settings.json`：卡网地址、令牌环境变量、消息模板、发送回调、重试参数
- `lib/`：状态库（SQLite）、日志、领卡客户端、模板、发送器、核心发货流程
- `server.mjs`：HTTP 触发服务（`POST /trigger`、`GET /health`）
- `deliver.mjs`：命令行单次触发
- `test/`：mock 测试与真实卡网接口验证

## 启动

```powershell
$env:INTEGRATION_API_TOKEN = '卡网集成令牌'
$env:BRIDGE_TRIGGER_TOKEN = '桥接服务令牌'   # 生产必须设置
node server.mjs                                # 默认 127.0.0.1:8787
```

触发示例：

```bash
curl -X POST http://127.0.0.1:8787/trigger \
  -H "Authorization: Bearer 桥接服务令牌" \
  -H "Content-Type: application/json" \
  -d '{"external_order_no":"XIANYU-20260816-001","item_id":"123456789012","buyer_id":"taobao_123","trigger":"order_paid"}'
```

CLI 示例：

```powershell
node deliver.mjs --event '{"external_order_no":"XIANYU-20260816-002","item_id":"123456789012","buyer_id":"taobao_123","trigger":"order_paid"}'
```

## 与模块6 的接入点

模块6 后端在「消息、拍下、付款」节点把订单事件转发到本桥接 `POST /trigger`
（或直接调用 `deliver.mjs`）。本桥接按 `external_order_no` 幂等，卡网接口二次
幂等兜底。发卡成功后调用 `config.settings.json -> sender.http.url` 把消息推回
模块6 的回复接口；未配置时仅写日志，便于联调。

## 测试

```powershell
node test/test-bridge.mjs                 # mock 200/401/409/重试/逐条发送
node test/test-bridge.mjs --real          # 需要本地卡网运行且已配置令牌
```

真实接口测试会消耗卡密，完成后恢复种子库：

```powershell
pnpm db:reset
node src/lib/db.ts
```
