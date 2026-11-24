# FORGE — instalador de um comando, 100% Windows nativo (sem WSL, sem Linux,
# sem nenhuma VM no meio). Idempotente: seguro rodar de novo no mesmo PC.
#
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://github.com/Sploit23/sploit/raw/refs/heads/dev/packages/opencode/src/cli/cmd/forge/app/win-native-install.ps1 | iex
#
# A linha de ExecutionPolicy evita um PSSecurityException/UnauthorizedAccess
# que a política padrão de vários Windows dá no "iex" de script baixado
# (-Scope Process não muda nada permanente, só vale nesta janela). A linha
# de TLS 1.2 é necessária em PCs mais antigos -- sem ela, o PRIMEIRO
# download (deste próprio arquivo) pode falhar silenciosamente antes mesmo
# do script começar a rodar (o TLS 1.2 que o script seta lá embaixo só vale
# depois que ele já foi baixado).
#
# Pra instalar sem opencode/Claude Code e sem app de bandeja (PC que só vai
# ser controlado remotamente, sem IA rodando local nele): use -Headless.
# -Headless sobrevive ao re-lançamento elevado (UAC); só setar $env:FORGE_HEADLESS
# numa linha separada é frágil e já causou bot com tray instalado.
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; & ([scriptblock]::Create((irm https://github.com/Sploit23/sploit/raw/refs/heads/dev/packages/opencode/src/cli/cmd/forge/app/win-native-install.ps1))) -Headless
#
# Se faltar alguma dependência (winget, Node), o script avisa exatamente o
# que falta em vez de travar silenciosamente.

param([switch]$Headless)
$HEADLESS = $Headless -or [bool]$env:FORGE_HEADLESS
if ($HEADLESS) {
    Write-Host "==> Modo BOT ativo: só serviço + shell remoto (sem IA local, bandeja, UI web, MCP ou push)."
}

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
$BASE_URL = "https://github.com/Sploit23/sploit/raw/refs/heads/dev/packages/opencode/src/cli/cmd/forge/app"

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
    $elevArgs = @("-NoExit", "-ExecutionPolicy", "Bypass", "-File", $self)
    if ($HEADLESS) { $elevArgs += "-Headless" }
    Start-Process powershell -Verb RunAs -ArgumentList $elevArgs
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

if ((-not (Test-Command "winget")) -and ((-not (Test-Command "node")) -or (-not (Test-Command "npm")) -or (-not (Test-Command "tailscale")))) {
    Write-Host "winget não encontrado e falta node/npm/tailscale -- precisa do App Installer da Microsoft Store"
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
# derrubar o instalador inteiro. -Headless (ou $env:FORGE_HEADLESS=1) pula os
# dois de propósito -- junto com o app de bandeja mais abaixo -- pra
# instalações 100% headless, controladas só por fora.
if ($HEADLESS) {
    Write-Host "==> Modo BOT -- pulando opencode/Claude Code (só shell remoto nesta máquina)."
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
if (-not $HEADLESS) {
    if (-not $opencodeBin) { Write-Host "AVISO: não achei o caminho do opencode -- o botão 'opencode' pode não funcionar." }
    if (-not $claudeBin) { Write-Host "AVISO: não achei o caminho do claude -- o botão 'claude' pode não funcionar." }
}

$selfDir = $null
$selfPath = $MyInvocation.MyCommand.Path
if ($selfPath) { $selfDir = Split-Path $selfPath -Parent }

function Get-Asset($name, $dest) {
    if ($selfDir -and (Test-Path (Join-Path $selfDir $name))) {
        Copy-Item (Join-Path $selfDir $name) $dest -Force
    } else {
        # cache-bust: achado em 24/11 que o CDN do GitHub às vezes serve
        # versão velha pra essa mesma URL (confirmado na mão -- só um
        # query param novo forçou o conteúdo certo a aparecer). Sem isso,
        # rodar o instalador de novo podia "funcionar" sem erro nenhum e
        # ainda assim instalar código de horas atrás.
        $cacheBust = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        Invoke-WebRequest -Uri "$BASE_URL/${name}?v=$cacheBust" -OutFile $dest -UseBasicParsing -Headers @{ 'Cache-Control' = 'no-cache' }
    }
}
$assets = @("server.js", "sessions-native.js", "win-service.js")
if (-not $HEADLESS) { $assets += @("sessions-tmux.js", "index.html", "mcp-coordinator.js") }
Write-Host "==> Baixando $($assets -join ', ')..."
foreach ($f in $assets) { Get-Asset $f (Join-Path $FORGE_DIR $f) }
if (-not $HEADLESS) {
    New-Item -ItemType Directory -Force -Path (Join-Path $FORGE_DIR "vendor") | Out-Null
    foreach ($f in @("xterm.min.js", "xterm.min.css", "xterm-addon-fit.min.js", "qrcode.min.js")) {
        Get-Asset "vendor/$f" (Join-Path $FORGE_DIR "vendor\$f")
    }
}

Push-Location $FORGE_DIR
try {
    $npmDeps = @("ws", "node-pty", "node-windows")
    if (-not $HEADLESS) { $npmDeps += @("web-push", "@modelcontextprotocol/sdk", "zod") }
    Write-Host "==> Instalando dependências node ($($npmDeps -join ', '))..."
    npm install @npmDeps --silent
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "Falha instalando as dependências node. node-pty normalmente já vem com"
        Write-Host "binário pronto pro Windows (não deveria precisar compilar) -- se o erro"
        Write-Host "for de compilação mesmo assim, instale as 'Build Tools for Visual Studio'"
        Write-Host "com o workload C++ e rode o script de novo."
        throw "npm install falhou (código $LASTEXITCODE)"
    }
    # instalacao antiga pode ter deixado esses pacotes no package.json/node_modules
    # -- remova pra bot ficar minimo tambem em disco, nao so no download.
    if ($HEADLESS) {
        npm uninstall web-push @modelcontextprotocol/sdk zod --silent
        if ($LASTEXITCODE -ne 0) { Write-Host "AVISO: não consegui remover dependências npm extras do bot (código $LASTEXITCODE) -- o server.js em modo BOT não as carrega de qualquer forma." }
    }
} finally {
    Pop-Location
}

if ($HEADLESS) {
    Write-Host "==> Modo BOT -- removendo restos de UI/bandeja de instalação anterior..."
    Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.ExecutablePath -like "*$env:LOCALAPPDATA\SploitForgeTray*" } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    foreach ($p in @(
        (Join-Path $env:USERPROFILE "Desktop\Sploit-Forge.lnk"),
        (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\Sploit-Forge.lnk"),
        (Join-Path $env:LOCALAPPDATA "SploitForgeTray")
    )) {
        if (Test-Path $p) { Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue }
    }
    foreach ($f in @("index.html", "mcp-coordinator.js", "sessions-tmux.js", ".push-vapid.json", "push-subscriptions.json")) {
        $p = Join-Path $FORGE_DIR $f
        if (Test-Path $p) { Remove-Item $p -Force -ErrorAction SilentlyContinue }
    }
    $vendorDir = Join-Path $FORGE_DIR "vendor"
    if (Test-Path $vendorDir) { Remove-Item $vendorDir -Recurse -Force -ErrorAction SilentlyContinue }
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

if ($HEADLESS) {
    if ((Test-Path $ENV_FILE) -and (Select-String -Path $ENV_FILE -Pattern "^FORGE_HEADLESS=" -Quiet)) {
        Write-Host "==> FORGE_HEADLESS já presente no .env."
    } else {
        Add-Content -Path $ENV_FILE -Value "FORGE_HEADLESS=1" -Encoding ASCII
        Write-Host "==> FORGE_HEADLESS=1 gravado no .env (o server.js lê direto dele no boot)."
    }
}

New-Item -ItemType Directory -Force -Path $FORGE_ROOT | Out-Null

Write-Host "==> Registrando o Serviço do Windows..."
$env:FORGE_TOKEN = $TOKEN
$env:PORT = $PORT
$env:FORGE_ROOT = $FORGE_ROOT
if ($opencodeBin) { $env:OPENCODE_BIN = $opencodeBin }
if ($claudeBin) { $env:CLAUDE_BIN = $claudeBin }
# o Serviço roda como LocalSystem -- sem isso, os.homedir() dentro de
# qualquer sessão de terminal cairia no profile vazio do SYSTEM, não no
# da pessoa instalando agora (quebra conta/créditos do opencode/claude,
# que guardam tudo sob ~/.config e ~/.local/share). Captura o %USERPROFILE%
# real aqui, enquanto ainda roda como ela, igual já faz com OPENCODE_BIN.
$env:FORGE_USER_PROFILE = $env:USERPROFILE
Push-Location $FORGE_DIR
try {
    & $nodeExe win-service.js install
} finally {
    Pop-Location
}
Start-Sleep -Seconds 2

# --- App de bandeja (ícone + janela nativa) -- roda como o usuário logado,
# não como o Serviço (LocalSystem não tem sessão de desktop pra mostrar
# ícone nenhum). -Headless pula isso de propósito, pra PCs que só
# vão ser controlados remotamente (shell/`/api/exec`), sem nada visível.
if ($HEADLESS) {
    Write-Host "==> Modo BOT -- pulando o app de bandeja (só o serviço, controlado remotamente)."
} else {
    Write-Host ""
    Write-Host "==> Instalando o app de bandeja..."
    $TRAY_DIR = Join-Path $env:LOCALAPPDATA "SploitForgeTray"
    New-Item -ItemType Directory -Force -Path (Join-Path $TRAY_DIR "src") | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $TRAY_DIR "assets") | Out-Null
    $trayBase = "https://github.com/Sploit23/sploit/raw/refs/heads/dev/packages/forge-tray/dist"
    $trayOk = $true
    try {
        foreach ($f in @("package.json", "src/main.js", "src/pairing.js", "launch-tray.vbs", "assets/tray-icon-16.png", "assets/tray-icon-32.png", "assets/tray-icon-64.png", "assets/tray-icon-128.png", "assets/forge-tray.ico")) {
            Invoke-WebRequest -Uri "$trayBase/$f" -OutFile (Join-Path $TRAY_DIR $f) -UseBasicParsing
        }
        # electron.exe vem do zip oficial direto, não via `npm install electron`
        # -- confirmado nesta mesma sessão de testes que a extração via
        # node_modules/extract-zip trava em silêncio (sem erro, sem completar,
        # exit 0) nesta máquina; Expand-Archive nativo do Windows extrai o
        # mesmo zip sem problema nenhum. Menos uma dependência (npm) também.
        if (-not (Test-Path (Join-Path $TRAY_DIR "electron\electron.exe"))) {
            Write-Host "==> Baixando o runtime do Electron (~115MB, só na primeira vez)..."
            $electronZip = Join-Path $env:TEMP "sploit-forge-electron.zip"
            Invoke-WebRequest -Uri "https://github.com/electron/electron/releases/download/v33.2.1/electron-v33.2.1-win32-x64.zip" -OutFile $electronZip -UseBasicParsing
            Expand-Archive -Path $electronZip -DestinationPath (Join-Path $TRAY_DIR "electron") -Force
            Remove-Item $electronZip -Force
        }
    } catch {
        $trayOk = $false
        Write-Host "AVISO: instalação do app de bandeja falhou ($($_.Exception.Message)) -- o FORGE continua funcionando normal, só sem o ícone na bandeja nesta máquina. Rode o script de novo pra tentar de novo só essa parte."
    }

    if ($trayOk -and (Test-Path (Join-Path $TRAY_DIR "electron\electron.exe"))) {
        $WshShell = New-Object -ComObject WScript.Shell
        $desktop = [Environment]::GetFolderPath("Desktop")
        $startupDir = [Environment]::GetFolderPath("Startup")
        $shortcutPath = Join-Path $desktop "Sploit-Forge.lnk"
        $Shortcut = $WshShell.CreateShortcut($shortcutPath)
        $Shortcut.TargetPath = "$env:WINDIR\System32\wscript.exe"
        $Shortcut.Arguments = "`"$(Join-Path $TRAY_DIR 'launch-tray.vbs')`""
        $Shortcut.IconLocation = Join-Path $TRAY_DIR "assets\forge-tray.ico"
        $Shortcut.WorkingDirectory = $TRAY_DIR
        $Shortcut.Description = "Abre o app de bandeja do Sploit-Forge"
        $Shortcut.Save()
        # Área de Trabalho pra abrir na hora + Startup pra abrir sozinho no login
        # seguinte (sem precisar de admin -- é a pasta Startup do usuário, não a
        # de todo mundo).
        Copy-Item $shortcutPath (Join-Path $startupDir "Sploit-Forge.lnk") -Force
        Write-Host "==> App de bandeja instalado -- ícone 'Sploit-Forge' na Área de Trabalho, abre sozinho no próximo login."
    }
}

Write-Host ""
Write-Host "==> Tailscale..."
function Get-TsStatus {
    try { (& $tailscaleExe status --json 2>$null | Out-String) | ConvertFrom-Json } catch { $null }
}
function Get-TsTextAuthUrl {
    # o status em texto imprime "Log in at: https://login.tailscale.com/a/..."
    # mesmo quando o AuthURL do --json vem vazio entao essa e a fonte confiavel.
    $txt = ''
    try { $txt = (& $tailscaleExe status 2>&1 | Out-String) } catch { return '' }
    $m = [regex]::Match($txt, 'https://login\.tailscale\.com/[^\s]+')
    if ($m.Success) { return $m.Value.TrimEnd('.', ')', ',') }
    return ''
}
function Show-TsAuthUrl($st) {
    $url = ''
    if ($st -and $st.AuthURL) { $url = $st.AuthURL }
    if (-not $url) { $url = Get-TsTextAuthUrl }
    if ($url) {
        Write-Host ""
        Write-Host "  ------------------------------------------------------------" -ForegroundColor Yellow
        Write-Host "  ABRA ESTE LINK (ou escaneie o QR) com a conta do Tailscale:" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "    $url" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "  ------------------------------------------------------------" -ForegroundColor Yellow
        return $true
    }
    return $false
}
$st = $null
for ($i = 0; $i -lt 10; $i++) {
    $st = Get-TsStatus
    if ($st -and $st.BackendState) { break }
    Start-Sleep -Seconds 2
}
function Start-TsUp($extraArgs) {
    $argList = @('up','--qr=false','--accept-routes=false') + $extraArgs
    try { Start-Process -FilePath $tailscaleExe -ArgumentList $argList -WindowStyle Hidden -ErrorAction Stop | Out-Null } catch { return $false }
    return $true
}
# Backend travado (NoState/Stopped/status mudo): tailscaled antigo depois do
# update do winget. Reinicia o servico; se continuar travado, tira o estado do
# caminho (com backup) e reinicia de novo -- e o que destrava em PC de loja.
$tsBroken = (-not $st) -or ($st.BackendState -in @('NoState','Stopped',''))
if ($tsBroken) {
    Write-Host "  Backend do Tailscale travado -- reiniciando o servico..."
    try { Restart-Service Tailscale -Force -ErrorAction Stop } catch { Write-Host "  (restart falhou: $($_.Exception.Message))" }
    Start-Sleep -Seconds 8
    $st = Get-TsStatus
    $tsBroken = (-not $st) -or ($st.BackendState -in @('NoState','Stopped',''))
}
if ($tsBroken) {
    $stateFile = 'C:\ProgramData\Tailscale\server-state.conf'
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    Write-Host "  Estado do Tailscale corrompido -- backup em server-state.conf.bak-$stamp"
    try {
        Stop-Service Tailscale -Force -ErrorAction Stop
        Start-Sleep -Seconds 3
        if (Test-Path $stateFile) { Move-Item $stateFile "$stateFile.bak-$stamp" -Force }
        Start-Service Tailscale -ErrorAction Stop
    } catch { Write-Host "  (falha ao limpar o estado: $($_.Exception.Message))" }
    Start-Sleep -Seconds 10
    $st = Get-TsStatus
}
if (-not $st -or $st.BackendState -ne 'Running') {
    Write-Host "  Maquina fora do tailnet -- gerando link de login..."
    $shown = $false
    try { Start-Process -FilePath $tailscaleExe -ArgumentList 'login' -WindowStyle Hidden -ErrorAction Stop | Out-Null } catch {}
    for ($i = 0; $i -lt 12; $i++) {
        Start-Sleep -Seconds 2
        $st = Get-TsStatus
        if ($st -and $st.BackendState -eq 'Running') { break }
        if (-not $shown) { $shown = Show-TsAuthUrl $st }
    }
    if (-not $shown) {
        Write-Host "  'tailscale login' sem link -- tentando 'up'..."
        [void](Start-TsUp @())
        for ($i = 0; $i -lt 12; $i++) {
            Start-Sleep -Seconds 2
            $st = Get-TsStatus
            if ($st -and $st.BackendState -eq 'Running') { break }
            if (-not $shown) { $shown = Show-TsAuthUrl $st }
        }
    }
    if (-not $shown) {
        Write-Host "  'up' sem link -- tentando 'up --reset'..."
        [void](Start-TsUp @('--reset','--force-reauth'))
        for ($i = 0; $i -lt 12; $i++) {
            Start-Sleep -Seconds 2
            $st = Get-TsStatus
            if ($st -and $st.BackendState -eq 'Running') { break }
            if (-not $shown) { $shown = Show-TsAuthUrl $st }
        }
    }
    if (-not $shown) {
        Write-Host "  Ainda sem link. Status atual do Tailscale:"
        & $tailscaleExe status 2>&1 | Out-String | Write-Host
        Write-Host "  Tentando 'up --qr' no console (se o QR nao couber, use o link acima):"
        & $tailscaleExe up --qr --accept-routes=false
        $st = Get-TsStatus
    }
    if (-not $st -or $st.BackendState -ne 'Running') {
        Write-Host ""
        Write-Host "  Aguardando a autorizacao no navegador (ate 10 min)..."
        for ($i = 0; $i -lt 200; $i++) {
            Start-Sleep -Seconds 3
            $st = Get-TsStatus
            if ($st -and $st.BackendState -eq 'Running') { break }
            if (-not $shown) { $shown = Show-TsAuthUrl $st }
        }
    }
}
if (-not $st -or $st.BackendState -ne 'Running') {
    Write-Host ""
    Write-Host "ATENCAO: Tailscale nao conectou (estado: $($st.BackendState))." -ForegroundColor Red
    Write-Host "O FORGE ja esta instalado e funciona na LAN; para acesso remoto rode:"
    Write-Host "  `"$tailscaleExe`" login"
    Write-Host "abra o link mostrado e depois rode este script de novo."
    Write-Host ""
    Write-Host "--- diagnostico (manda um print pro suporte) ---"
    & $tailscaleExe version 2>&1 | Out-String | Write-Host
    & $tailscaleExe status 2>&1 | Out-String | Write-Host
    Get-Service Tailscale -ErrorAction SilentlyContinue | Select-Object Name,Status | Format-Table -AutoSize | Out-String | Write-Host
    Read-Host 'Enter para fechar'
} else {
    Write-Host "  Tailscale conectado: $((($st.Self.DNSName) -replace '\.$',''))"
}

Write-Host "==> Habilitando Tailscale Serve na porta $PORT..."
$serveOut = ''
if ($st -and $st.BackendState -eq 'Running') {
    $serveOut = & $tailscaleExe serve --bg $PORT 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        Start-Sleep -Seconds 4
        $serveOut = & $tailscaleExe serve --bg $PORT 2>&1 | Out-String
    }
} else {
    $serveOut = 'Tailscale offline -- Serve nao habilitado.'
    $global:LASTEXITCODE = 1
}
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
