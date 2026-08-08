# sploit-web.ps1 — Sobe o servidor web do Sploit acessível pela rede local (celular).
#
# Uso:
#   .\scripts\sploit-web.ps1              # inicia o servidor web (com senha)
#   .\scripts\sploit-web.ps1 -Port 8080   # porta personalizada
#   .\scripts\sploit-web.ps1 -Stop        # encerra o servidor que estiver rodando
#
# Segurança:
#   - A senha fica em sploit-web.secret (gitignored), gerada aleatoriamente na
#     primeira execução. Qualquer pessoa na rede só acessa com a senha.
#   - Para ver a senha depois: Get-Content sploit-web.secret
#
# Do celular (mesma rede Wi-Fi): abra http://<IP-do-PC>:4096
# Com mDNS: http://sploit.local:4096 (se o roteador/celular suportarem mDNS).

param(
    [int]$Port = 4096,
    [switch]$Stop
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$exe = "$root\sploit.exe"
$secretFile = "$root\sploit-web.secret"

if ($Stop) {
    $proc = Get-Process sploit -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match "sploit-web" } | Select-Object -First 1
    if (-not $proc) {
        $proc = Get-Process sploit -ErrorAction SilentlyContinue |
            Where-Object { $_.MainWindowTitle -match "sploit" } | Select-Object -First 1
    }
    if ($proc) {
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        Write-Host "Servidor web encerrado (PID $($proc.Id))."
    } else {
        Write-Host "Nenhum servidor web do Sploit em execucao."
    }
    exit 0
}

if (-not (Test-Path $exe)) {
    Write-Host "[ERRO] sploit.exe nao encontrado em $exe" -ForegroundColor Red
    exit 1
}

# --- Senha ------------------------------------------------------------------
if (Test-Path $secretFile) {
    $password = (Get-Content $secretFile -Raw).Trim()
} else {
    $password = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 16 | ForEach-Object { [char]$_ })
    Set-Content -Path $secretFile -Value $password -NoNewline -Encoding UTF8
    Write-Host "[AVISO] Senha nova gerada e salva em sploit-web.secret (gitignored)." -ForegroundColor Yellow
}

# --- Sobe o servidor ---------------------------------------------------------
$env:OPENCODE_SERVER_PASSWORD = $password
$env:SPLOIT_WEB_MARKER = "sploit-web"

$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.*" }
$ip = $ips | Select-Object -First 1 -ExpandProperty IPAddress

Write-Host ""
Write-Host "=== Sploit web server ===" -ForegroundColor Green
Write-Host "  Local:      http://localhost:$Port"
Write-Host "  Rede local: http://$ip`:$Port"
Write-Host "  mDNS:       http://sploit.local:$Port"
Write-Host "  Senha:      $password"
Write-Host ""
Write-Host "Do celular (mesma rede): abra a URL de 'Rede local' e digite a senha."
Write-Host "Para encerrar depois: .\scripts\sploit-web.ps1 -Stop"
Write-Host ""
Write-Host "Ctrl+C encerra o servidor." -ForegroundColor DarkGray
Write-Host ""

& $exe web --hostname 0.0.0.0 --port $Port --mdns
