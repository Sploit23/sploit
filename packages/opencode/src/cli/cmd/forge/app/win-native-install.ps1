# FORGE — instalador de um comando, 100% Windows nativo (sem WSL, sem Linux,
# sem nenhuma VM no meio). Idempotente: seguro rodar de novo no mesmo PC.
#
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://raw.githubusercontent.com/Sploit23/sploit/dev/packages/opencode/src/cli/cmd/forge/app/win-native-install.ps1 | iex
#
# A linha de ExecutionPolicy evita um PSSecurityException/UnauthorizedAccess
# que a política padrão de vários Windows dá no "iex" de script baixado
# (-Scope Process não muda nada permanente, só vale nesta janela). A linha
# de TLS 1.2 é necessária em PCs mais antigos -- sem ela, o PRIMEIRO
# download (deste próprio arquivo) pode falhar silenciosamente antes mesmo
# do script começar a rodar (o TLS 1.2 que o script seta lá embaixo só vale
# depois que ele já foi baixado).
#
# Pra instalar sem opencode/Claude Code (PC que só vai ser controlado
# remotamente, sem IA rodando local nele):
#   $env:FORGE_SKIP_CLI=1; Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://raw.githubusercontent.com/Sploit23/sploit/dev/packages/opencode/src/cli/cmd/forge/app/win-native-install.ps1 | iex
#
# Se faltar alguma dependência (winget, Node), o script avisa exatamente o
# que falta em vez de travar silenciosamente.

$ErrorActionPreference = "Stop"
# Windows PowerShell 5.1 usa TLS antigo por padrao em muitas instalacoes --
# GitHub recusa, e sem isso ate os Invoke-WebRequest daqui pra baixo falham
# silenciosamente. O irm inicial (fora deste arquivo) ainda precisa da mesma
# linha manualmente, já que isso aqui só vale depois que o script já baixou.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$FORGE_DIR = Join-Path $env:ProgramData "SploitForge"
$ENV_FILE = Join-Path $FORGE_DIR ".env"
# sem isso, o server.js usa os.homedir() -- que pro servico (rodando como
# LocalSystem) cai no perfil escondido do sistema em vez de um lugar obvio.
$FORGE_ROOT = Join-Path $FORGE_DIR "projects"
$PORT = 7777
$BASE_URL = "https://raw.githubusercontent.com/Sploit23/sploit/dev/packages/opencode/src/cli/cmd/forge/app"

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    (New-Object Security.Principal.WindowsPrincipal $id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
    Write-Host "==> Pedindo permissao de Administrador (vai aparecer um prompt do Windows)..."
    $self = $MyInvocation.MyCommand.Path
    if (-not $self) {
        $self = Join-Path $env:TEMP "sploit-forge-win-native-install.ps1"
        Invoke-WebRequest -Uri "$BASE_URL/win-native-install.ps1" -OutFile $self -UseBasicParsing
    }
    Start-Process powershell -Verb RunAs -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-File", $self)
    Write-Host "Continua na janela nova (Administrador) que acabou de abrir."
    exit 0
}

function Sync-PathFromRegistry {
    # winget/npm -g alteram o PATH do sistema, mas esta sessao do PowerShell
    # nao enxerga sozinha ate abrir um terminal novo -- repopula na mao pra
    # nao precisar reiniciar o script no meio.
    $machine = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machine;$user"
}

function Test-Command($name) {
    $null = Get-Command $name -ErrorAction SilentlyContinue
    return $?
}

if (-not (Test-Command "winget")) {
    Write-Host "winget não encontrado -- precisa do App Installer da Microsoft Store"
    Write-Host "(já vem em qualquer Windows 10/11 atualizado). Atualize o Windows e rode de novo."
    exit 1
}

# A sessao elevada (Administrador) as vezes nao carrega o mesmo PATH da
# sessao normal do usuario (ex: ferramentas tipo nvm4w que mexem no PATH por
# fora do registro padrao) -- sincroniza sempre no inicio, não só depois de
# instalar algo novo.
Sync-PathFromRegistry

Write-Host "==> Pasta do Sploit-Forge: $FORGE_DIR"
New-Item -ItemType Directory -Force -Path $FORGE_DIR | Out-Null

if (-not (Test-Command "node") -or -not (Test-Command "npm")) {
    # alguns gerenciadores de versao (nvm4w etc) podem deixar um node.exe sem
    # o npm junto -- exige os dois presentes antes de considerar "instalado".
    Write-Host "==> Instalando Node.js (via winget, com npm incluso)..."
    winget install -e --id OpenJS.NodeJS --accept-package-agreements --accept-source-agreements | Out-Null
    Sync-PathFromRegistry
    if (-not (Test-Command "npm")) {
        $nodeDir = "C:\Program Files\nodejs"
        if (Test-Path (Join-Path $nodeDir "npm.cmd")) { $env:Path = "$nodeDir;$env:Path" }
    }
}

# `node` sozinho pode resolver pro executavel errado quando tem mais de um
# node.exe instalado (ex: nvm4w deixando uma versao sem npm na frente do
# PATH) -- node-windows grava no servico qualquer node.exe que rodou o
# `install`, entao usa-se sempre o caminho completo e verificado daqui pra
# frente em vez de confiar em resolução de PATH.
$nodeExe = "C:\Program Files\nodejs\node.exe"
if (-not (Test-Path $nodeExe)) {
    if (-not (Test-Command "node")) { throw "Node.js não foi instalado corretamente (winget falhou?). Verifique a conexão e rode de novo." }
    $nodeExe = (Get-Command node).Source
}
if (-not (Test-Command "npm")) { throw "npm não encontrado mesmo após instalar o Node. Verifique a conexão e rode de novo." }
Write-Host "==> Usando node.exe: $nodeExe ($(& $nodeExe --version))"

if (-not (Test-Command "tailscale")) {
    Write-Host "==> Instalando Tailscale..."
    winget install -e --id Tailscale.Tailscale --accept-package-agreements --accept-source-agreements | Out-Null
    Sync-PathFromRegistry
    Start-Sleep -Seconds 3
}
$tailscaleExe = "C:\Program Files\Tailscale\tailscale.exe"
if (-not (Test-Path $tailscaleExe)) { $tailscaleExe = "tailscale" }
if (-not (Test-Path $tailscaleExe) -and -not (Test-Command "tailscale")) {
    throw "Tailscale não foi instalado corretamente (winget falhou?). Verifique a conexão e rode de novo."
}

# opencode/claude code são opcionais: só fazem falta se alguém for abrir uma
# sessão de IA *direto nesse PC* pelo app (botão "opencode"/"claude" num
# projeto). Pra um PC que só existe pra ser controlado remotamente (shell/
# /api/exec), o FORGE funciona 100% sem nenhum dos dois -- então uma falha
# aqui (rede instável, npm sem conseguir falar com o registry etc) não pode
# derrubar o instalador inteiro. $env:FORGE_SKIP_CLI=1 antes do irm pula os
# dois de propósito, pra instalações "só de bandeja".
if ($env:FORGE_SKIP_CLI) {
    Write-Host "==> FORGE_SKIP_CLI definido -- pulando opencode/Claude Code (só shell remoto nesta máquina)."
} else {
    if (-not (Test-Command "opencode")) {
        Write-Host "==> Instalando o opencode (CLI que roda dentro de cada sessão)..."
        npm install -g opencode-ai@latest
        if ($LASTEXITCODE -ne 0) { Write-Host "AVISO: instalação do opencode falhou (código $LASTEXITCODE) -- seguindo sem ele. O resto do FORGE funciona normal; só o botão 'opencode' num projeto não vai funcionar nesta máquina até rodar 'npm install -g opencode-ai' manualmente." }
        else { Sync-PathFromRegistry }
    }
    if (-not (Test-Command "claude")) {
        Write-Host "==> Instalando o Claude Code (segunda opção de CLI dentro de cada sessão)..."
        npm install -g @anthropic-ai/claude-code
        if ($LASTEXITCODE -ne 0) { Write-Host "AVISO: instalação do Claude Code falhou (código $LASTEXITCODE) -- seguindo sem ele. O resto do FORGE funciona normal; só o botão 'claude' num projeto não vai funcionar nesta máquina até rodar 'npm install -g @anthropic-ai/claude-code' manualmente." }
        else { Sync-PathFromRegistry }
    }
}

# `npm install -g`/winget instalam no perfil de QUEM roda o script -- o
# Serviço do Windows roda como LocalSystem (outra conta, outro profile) e
# não enxerga esses caminhos. Resolve agora, enquanto ainda estão visíveis
# nesta sessão, e passa pro serviço via env (ver sessions-native.js).
$opencodeBin = (Get-Command opencode -ErrorAction SilentlyContinue).Source
$claudeBin = (Get-Command claude -ErrorAction SilentlyContinue).Source
if (-not $opencodeBin) { Write-Host "AVISO: não achei o caminho do opencode -- o botão 'opencode' pode não funcionar." }
if (-not $claudeBin) { Write-Host "AVISO: não achei o caminho do claude -- o botão 'claude' pode não funcionar." }

$selfDir = $null
$selfPath = $MyInvocation.MyCommand.Path
if ($selfPath) { $selfDir = Split-Path $selfPath -Parent }

function Get-Asset($name, $dest) {
    if ($selfDir -and (Test-Path (Join-Path $selfDir $name))) {
        Copy-Item (Join-Path $selfDir $name) $dest -Force
    } else {
        Invoke-WebRequest -Uri "$BASE_URL/$name" -OutFile $dest -UseBasicParsing
    }
}
Write-Host "==> Baixando server.js, index.html, sessions-*.js, win-service.js e vendor/..."
Get-Asset "server.js" (Join-Path $FORGE_DIR "server.js")
Get-Asset "sessions-native.js" (Join-Path $FORGE_DIR "sessions-native.js")
Get-Asset "sessions-tmux.js" (Join-Path $FORGE_DIR "sessions-tmux.js")
Get-Asset "index.html" (Join-Path $FORGE_DIR "index.html")
Get-Asset "win-service.js" (Join-Path $FORGE_DIR "win-service.js")
New-Item -ItemType Directory -Force -Path (Join-Path $FORGE_DIR "vendor") | Out-Null
foreach ($f in @("xterm.min.js", "xterm.min.css", "xterm-addon-fit.min.js", "qrcode.min.js")) {
    Get-Asset "vendor/$f" (Join-Path $FORGE_DIR "vendor\$f")
}

Push-Location $FORGE_DIR
try {
    Write-Host "==> Instalando dependências node (ws, node-pty, node-windows, web-push)..."
    npm install ws node-pty node-windows web-push --silent
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "Falha instalando as dependências node. node-pty normalmente já vem com"
        Write-Host "binário pronto pro Windows (não deveria precisar compilar) -- se o erro"
        Write-Host "for de compilação mesmo assim, instale as 'Build Tools for Visual Studio'"
        Write-Host "com o workload C++ e rode o script de novo."
        throw "npm install falhou (código $LASTEXITCODE)"
    }
} finally {
    Pop-Location
}

if ((Test-Path $ENV_FILE) -and (Select-String -Path $ENV_FILE -Pattern "^FORGE_TOKEN=" -Quiet)) {
    Write-Host "==> Token existente mantido (evita invalidar o app já pareado no celular)."
    $TOKEN = (Select-String -Path $ENV_FILE -Pattern "^FORGE_TOKEN=(.*)$").Matches[0].Groups[1].Value
} else {
    # RandomNumberGenerator::Fill (estático) é .NET Core+ e não existe no
    # .NET Framework que o Windows PowerShell 5.1 usa -- RNGCryptoServiceProvider
    # é a forma clássica, compatível com qualquer versão.
    $bytes = New-Object byte[] 16
    $rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
    $rng.GetBytes($bytes)
    $TOKEN = ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
    Set-Content -Path $ENV_FILE -Value "FORGE_TOKEN=$TOKEN" -Encoding ASCII
    Write-Host "==> Novo token gerado."
}

New-Item -ItemType Directory -Force -Path $FORGE_ROOT | Out-Null

Write-Host "==> Registrando o Serviço do Windows..."
$env:FORGE_TOKEN = $TOKEN
$env:PORT = $PORT
$env:FORGE_ROOT = $FORGE_ROOT
if ($opencodeBin) { $env:OPENCODE_BIN = $opencodeBin }
if ($claudeBin) { $env:CLAUDE_BIN = $claudeBin }
Push-Location $FORGE_DIR
try {
    & $nodeExe win-service.js install
} finally {
    Pop-Location
}
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "==> Tailscale..."
$status = & $tailscaleExe status --json 2>&1 | Out-String
if ($status -notmatch '"BackendState"\s*:\s*"Running"') {
    Write-Host ""
    Write-Host "Escaneie o QR com o app do Tailscale no celular (mesma conta dos outros Sploit-Forge):"
    Write-Host ""
    & $tailscaleExe up --qr --accept-routes=false
}

Write-Host "==> Habilitando Tailscale Serve na porta $PORT..."
$serveOut = & $tailscaleExe serve --bg $PORT 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) {
    Write-Host $serveOut
    Write-Host ""
    Write-Host "O recurso Serve ainda não está habilitado nesta conta Tailscale (só precisa uma vez)."
    Write-Host "Abra o link acima no navegador pra habilitar, depois rode este script de novo."
    exit 0
}

$statusJson = & $tailscaleExe status --json 2>&1 | Out-String
$dnsName = $null
try { $dnsName = ((ConvertFrom-Json $statusJson).Self.DNSName) -replace '\.$', '' } catch {}

Write-Host ""
Write-Host "==================================================================="
Write-Host " Sploit-Forge instalado e rodando em: $FORGE_DIR (Serviço do Windows: SploitForge)"
if ($dnsName) {
    Write-Host ""
    Write-Host " Abra no celular (mesma conta Tailscale):"
    Write-Host ""
    Write-Host "   https://$dnsName/#t=$TOKEN"
} else {
    Write-Host " Rode 'tailscale status' pra pegar o endereço e monte o link:"
    Write-Host "   https://SEU-DNSNAME/#t=$TOKEN"
}
Write-Host ""
Write-Host " Serviço nativo do Windows -- liga sozinho no boot, reinicia sozinho se"
Write-Host " cair. Sem WSL, sem VM, nada pra manter ligado manualmente."
Write-Host "==================================================================="
