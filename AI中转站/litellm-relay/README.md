# LiteLLM 本地中转站

基于 LiteLLM 的 OpenAI 兼容中转服务，默认把请求转发到本机
`http://127.0.0.1:15721/v1` 代理。

## 启动

```powershell
.\start-relay.ps1
```

服务地址：`http://127.0.0.1:4000/v1`

访问密钥：`sk-local-relay`

## 测试

```powershell
$body = @{
  model = "deepseek-v4-flash"
  messages = @(@{ role = "user"; content = "你好" })
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "http://127.0.0.1:4000/v1/chat/completions" `
  -Method Post `
  -Headers @{ Authorization = "Bearer sk-local-relay" } `
  -ContentType "application/json" `
  -Body $body
```
