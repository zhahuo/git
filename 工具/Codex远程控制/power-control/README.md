# 电源控制

手机网页电源控制服务，支持关机、重启、睡眠、休眠。

## 启动

双击 `start-power-control.cmd`，然后手机访问：

- 局域网：`http://192.168.1.26:3740`
- Tailscale：`http://100.88.57.10:3740`

密码与 OpenCodex 网页相同，保存在 `config.json`。

## 接口

- `GET /`：控制页面
- `GET /api/health`：健康检查
- `POST /api/power`：执行电源操作，JSON 为 `{ "action": "shutdown|restart|sleep|hibernate", "password": "..." }`

## 开机说明

电脑完全关机后，这个网页无法连接电脑，所以开机需要用 Wake-on-LAN：

1. 插上网线并保持电源适配器连接，Wi-Fi 无法在完全关机后唤醒。
2. 开机进 BIOS，开启 Wake on LAN / Power On by PCI-E。
3. 以管理员身份运行 `disable-fast-startup.cmd`，关闭 Windows 快速启动，然后重启一次电脑。
4. 在路由器里把电脑 IP 固定为 `192.168.1.26`。
5. 手机和电脑连接同一个局域网，安装支持 Wake on LAN 的 App：
   - 目标 MAC：`B0-25-AA-93-0F-C7`
   - 广播地址：`192.168.1.255`
   - 端口：`9`

如果只使用睡眠而不是完全关机，可以用 Wi-Fi MAC：`C0-A8-10-DA-AD-B3`，但手机必须和电脑在同一个局域网。

通过 Tailscale 从外网唤醒时，需要一台和电脑在同一局域网、且已接入 Tailscale 的常开设备，在那台设备上运行：

```powershell
.\wol-send.ps1 -Mac "B0-25-AA-93-0F-C7" -Broadcast "192.168.1.255"
```

否则 Tailscale 不转发局域网广播，手机直接发魔术包无法唤醒电脑。
