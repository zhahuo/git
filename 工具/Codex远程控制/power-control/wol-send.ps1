param(
  [string]$Mac = "B0-25-AA-93-0F-C7",
  [string]$Broadcast = "192.168.1.255",
  [int]$Port = 9
)

$clean = $Mac -replace "[^0-9A-Fa-f]", ""
if ($clean.Length -ne 12) {
  throw "Invalid MAC address: $Mac"
}

# 魔术包 = 6 个 0xFF + 目标 MAC 重复 16 次，共 102 字节。
$packet = New-Object byte[] 102
for ($i = 0; $i -lt 6; $i++) {
  $packet[$i] = 0xFF
}
for ($i = 1; $i -le 16; $i++) {
  for ($j = 0; $j -lt 6; $j++) {
    $packet[$i * 6 + $j] = [Convert]::ToByte($clean.Substring($j * 2, 2), 16)
  }
}

$udp = New-Object System.Net.Sockets.UdpClient
$udp.Connect($Broadcast, $Port)
$udp.Send($packet, $packet.Length) | Out-Null
$udp.Close()

Write-Output "WOL sent to $Mac via $Broadcast:$Port"
