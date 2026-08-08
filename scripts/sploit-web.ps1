# sploit-web.ps1 — Sobe o acesso web do Sploit pela rede local (celular).
#
# Uso:
#   .\scripts\sploit-web.ps1              # inicia (servidor web + proxy de auth + QR code)
#   .\scripts\sploit-web.ps1 -Port 4096   # porta personalizada
#   .\scripts\sploit-web.ps1 -Detached    # servidor web em segundo plano (retorna na hora)
#   .\scripts\sploit-web.ps1 -Stop        # encerra tudo que o script subiu
#
# -Detached e o modo recomendado quando o SPLOIT (agente) inicia o servidor:
# o modo normal bloqueia o terminal (Ctrl+C encerra) e estoura o timeout da
# ferramenta bash (Tool execution aborted). Em detached, o script sobe o
# servidor em background e retorna imediatamente.
#
# Como funciona:
#   - Sobe o servidor web nativo (sploit web, porta 4096) com senha.
#   - Sobe o proxy de autenticação (scripts/sploit-web-proxy.py, porta 4097):
#     o QR code aponta para ele com o token embutido (?auth_token=...), o proxy
#     valida o token, emite cookie de sessão e injeta o header de login em toda
#     requisição. Quem escanear o QR entra na interface JÁ autenticado, sem
#     digitar nada.
#   - Abre a imagem do QR (PNG) na tela para escanear com o celular.
#   - Imprime a URL autenticada por garantia.
#
# Segurança:
#   - A senha fica em sploit-web.secret (gitignored), gerada aleatoriamente na
#     primeira execução.
#   - O proxy não aceita acesso sem o token do QR (401).
#   - Para ver a senha depois: Get-Content sploit-web.secret

param(
    [int]$Port = 4096,
    [switch]$Detached,
    [switch]$Stop
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$exe = "$root\sploit.exe"
$proxyScript = "$root\scripts\sploit-web-proxy.py"
$qrScript = "$root\scripts\web-qr.py"
$secretFile = "$root\sploit-web.secret"
$proxyPort = $Port + 1

function Get-WebProcesses {
    $all = @(Get-Process sploit, python -ErrorAction SilentlyContinue)
    foreach ($p in $all) {
        try {
            $cmd = $p.CommandLine
            if ($cmd -match "sploit-web" -or $cmd -match "sploit-web-proxy.py") { $p; continue }
        } catch { $null }
    }
    # servidor web detached: dono da porta em escuta
    try {
        $owner = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
            Select-Object -First 1 -ExpandProperty OwningProcess
        if ($owner) {
            $proc = Get-Process -Id $owner -ErrorAction SilentlyContinue
            if ($proc -and $proc.ProcessName -match "sploit") { $proc }
        }
    } catch { $null }
}

if ($Stop) {
    $procs = @(Get-WebProcesses)
    if ($procs) {
        $procs | Select-Object -Unique | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
        Write-Host "Acesso web encerrado ($($procs.Count) processo(s))."
    } else {
        Write-Host "Nenhum processo do acesso web em execucao."
    }
    exit 0
}

if (-not (Test-Path $exe)) {
    Write-Host "[ERRO] sploit.exe nao encontrado em $exe" -ForegroundColor Red
    exit 1
}

if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
    Write-Host "[ERRO] Porta $Port ja esta em uso. Encerre antes: .\scripts\sploit-web.ps1 -Stop" -ForegroundColor Red
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

# --- URLs -------------------------------------------------------------------
$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.*" }
$ip = $ips | Select-Object -First 1 -ExpandProperty IPAddress

# Token = base64("sploit:senha") — o proxy valida e emite cookie de sessão.
$credential = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("sploit:$password"))
$authUrl = "http://$ip`:$proxyPort/?auth_token=$credential"

Write-Host ""
Write-Host "=== Sploit acesso web ===" -ForegroundColor Green
Write-Host "  Senha:         $password"
Write-Host "  URL autenticada: $authUrl" -ForegroundColor DarkGray
Write-Host ""

# --- QR code (imagem PNG, abre no visualizador de imagens) -------------------
$qrPng = Join-Path $env:TEMP "sploit-qr.png"
try {
    $qrOut = & python $qrScript $authUrl $qrPng
    if ($LASTEXITCODE -eq 0 -and (Test-Path $qrPng)) {
        Write-Host "  ESCANEIE O QR CODE COM A CAMERA DO CELULAR" -ForegroundColor Cyan
        Write-Host "  (o celular precisa estar no MESMO Wi-Fi do PC)" -ForegroundColor DarkGray
        Write-Host ""
        Start-Process $qrPng
    } else {
        throw "falha ao gerar o QR"
    }
} catch {
    Write-Host "  [AVISO] Nao foi possivel abrir o QR — abra no celular esta URL:" -ForegroundColor Yellow
    Write-Host "  $authUrl" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "Para encerrar depois: .\scripts\sploit-web.ps1 -Stop" -ForegroundColor DarkGray
Write-Host ""

# --- Proxy de autenticação (inicia em segundo plano) --------------------------
$env:OPENCODE_SERVER_PASSWORD = $password
$env:SPLOIT_WEB_MARKER = "sploit-web"

$proxyLog = Join-Path $env:TEMP "sploit-web-proxy.log"
$proxyProc = Start-Process python -ArgumentList $proxyScript, "--port", $proxyPort, "--upstream-port", $Port, "--password", $password -WindowStyle Hidden -RedirectStandardError $proxyLog -PassThru
Write-Host "Proxy de autenticacao: porta $proxyPort (PID $($proxyProc.Id))" -ForegroundColor DarkGray
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "Iniciando servidor web..." -ForegroundColor DarkGray
Write-Host ""

$webLog = Join-Path $env:TEMP "sploit-web-server.log"
if ($Detached) {
    $env:SPLOIT_WEB_MARKER = "sploit-web"
    $webProc = Start-Process $exe -ArgumentList "web", "--hostname", "0.0.0.0", "--port", "$Port", "--mdns" -WindowStyle Hidden -RedirectStandardError $webLog -PassThru
    Write-Host "Servidor web em segundo plano (PID $($webProc.Id)). Log: $webLog" -ForegroundColor DarkGray
    Write-Host "Para encerrar depois: .\scripts\sploit-web.ps1 -Stop" -ForegroundColor DarkGray
    Write-Host ""
    exit 0
}

& $exe web --hostname 0.0.0.0 --port $Port --mdns
