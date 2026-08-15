$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $root

& "$root\.venv\Scripts\python.exe" -c "from litellm import run_server; run_server()" --config config.yaml --host 127.0.0.1 --port 4000
