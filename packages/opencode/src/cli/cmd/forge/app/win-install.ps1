# FORGE — instalador de um comando pra Windows do zero (sem WSL nenhum
# ainda). Instala WSL+Ubuntu se precisar, tenta pular a etapa manual de
# criar usuário Linux (roda tudo como root direto), instala o FORGE
# (bootstrap.sh) e deixa a WSL sempre ligada (keepalive).
#
# Rode numa PowerShell comum (não precisa já estar como Administrador —
# o script eleva sozinho se precisar):
#   irm https://raw.githubusercontent.com/Sploit23/sploit/dev/packages/opencode/src/cli/cmd/forge/app/win-install.ps1 | iex
#
# Se o Windows pedir reinício no meio (só acontece se o WSL nunca foi
# usado nesse PC antes), reinicia e roda o MESMO comando de novo — ele
# continua de onde parou, é seguro repetir.

$ErrorActionPreference = "Stop"
# Windows PowerShell 5.1 usa TLS antigo por padrao em muitas instalacoes --
# GitHub recusa, e os Invoke-WebRequest abaixo falhariam silenciosamente.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$DISTRO = "Ubuntu"
$BASE_URL = "https://raw.githubusercontent.com/Sploit23/sploit/dev/packages/opencode/src/cli/cmd/forge/app"

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    (New-Object Security.Principal.WindowsPrincipal $id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
    Write-Host "==> Pedindo permissao de Administrador (vai aparecer um prompt do Windows)..."
    $self = $MyInvocation.MyCommand.Path
    if ($self) {
        Start-Process powershell -Verb RunAs -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-File", $self)
    } else {
        # rodando via `irm ... | iex` -- nao tem arquivo proprio pra reabrir elevado,
        # baixa o conteudo e relanca ele mesmo numa PowerShell admin.
        $tmp = Join-Path $env:TEMP "sploit-forge-win-install.ps1"
        Invoke-WebRequest -Uri "$BASE_URL/win-install.ps1" -OutFile $tmp -UseBasicParsing
        Start-Process powershell -Verb RunAs -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-File", $tmp)
    }
    Write-Host "Continua na janela nova (Administrador) que acabou de abrir."
    exit 0
}

# wsl.exe pode ficar pendurado pra sempre se rodado sem um console/TTY de
# verdade por trás (visto num shell automatizado) -- sem timeout, qualquer
# checagem aqui travaria o instalador inteiro em silêncio.
function Invoke-WslTimed([string[]]$WslArgs, [int]$TimeoutSec = 20) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "wsl.exe"
    $psi.Arguments = ($WslArgs -join " ")
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $proc = [System.Diagnostics.Process]::Start($psi)
    $stdoutTask = $proc.StandardOutput.ReadToEndAsync()
    $null = $proc.StandardError.ReadToEndAsync()
    if (-not $proc.WaitForExit($TimeoutSec * 1000)) {
        try { $proc.Kill($true) } catch {}
        return [pscustomobject]@{ ExitCode = -1; TimedOut = $true; StdOut = "" }
    }
    return [pscustomobject]@{ ExitCode = $proc.ExitCode; TimedOut = $false; StdOut = $stdoutTask.Result }
}

function Test-WslWorking {
    $r = Invoke-WslTimed @("-l", "-q")
    return (-not $r.TimedOut) -and ($r.ExitCode -eq 0)
}

function Test-DistroInstalled([string]$name) {
    $r = Invoke-WslTimed @("-l", "-q")
    if ($r.TimedOut) { return $false }
    $list = $r.StdOut -replace "`0", ""
    return ($list -split "`r?`n" | ForEach-Object { $_.Trim() }) -contains $name
}

if (-not (Test-WslWorking) -or -not (Test-DistroInstalled $DISTRO)) {
    Write-Host "==> Instalando WSL + $DISTRO (pode levar alguns minutos)..."
    wsl.exe --install -d $DISTRO --no-launch
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "==> O Windows provavelmente precisa reiniciar pra terminar de ativar o WSL."
        Write-Host "    Reinicia o PC e roda este MESMO comando de novo numa PowerShell:"
        Write-Host ""
        Write-Host "    irm $BASE_URL/win-install.ps1 | iex"
        Write-Host ""
        exit 0
    }
    Write-Host "==> WSL/$DISTRO instalados. Verificando se precisa reiniciar..."
    Start-Sleep -Seconds 2
    if (-not (Test-WslWorking)) {
        Write-Host ""
        Write-Host "==> Preciso que voce reinicie o PC agora pra terminar a instalacao do WSL."
        Write-Host "    Depois de reiniciar, abre uma PowerShell e roda este MESMO comando de novo:"
        Write-Host ""
        Write-Host "    irm $BASE_URL/win-install.ps1 | iex"
        Write-Host ""
        exit 0
    }
}

Write-Host "==> WSL/$DISTRO prontos."

# O instalador padrao do Ubuntu pede, na primeira abertura, pra criar um
# usuario Linux interativamente -- isso so acontece pelo launcher proprio
# da distro (ubuntu.exe/'Ubuntu' no menu iniciar). Invocar via wsl.exe
# direto com -u root passa por cima dessa etapa quando o WSL ja reconhece
# a instancia como pronta; se ainda nao passou pelo primeiro boot, falha,
# e ai sim precisa do passo manual (sem jeito de automatizar isso com
# seguranca: e uma tela interativa de criar senha).
$rootCheck = Invoke-WslTimed @("-d", $DISTRO, "-u", "root", "--", "true")
$rootOk = (-not $rootCheck.TimedOut) -and ($rootCheck.ExitCode -eq 0)

if (-not $rootOk) {
    Write-Host ""
    Write-Host "==> Falta um passo manual, uma vez so: abre o '$DISTRO' pelo Menu Iniciar,"
    Write-Host "    espera ele terminar de instalar e crie um usuario/senha Linux (pode ser"
    Write-Host "    qualquer coisa). Depois, roda este MESMO comando de novo:"
    Write-Host ""
    Write-Host "    irm $BASE_URL/win-install.ps1 | iex"
    Write-Host ""
    exit 0
}

Write-Host "==> Instalando o FORGE dentro da $DISTRO (vai pedir pra escanear um QR do Tailscale no celular)..."
Write-Host ""
& wsl.exe -d $DISTRO -u root -- bash -c "curl -fsSL $BASE_URL/bootstrap.sh | bash"

Write-Host ""
Write-Host "==> Deixando a WSL sempre ligada (sem isso ela desliga sozinha ociosa)..."
$installScript = Join-Path $env:TEMP "sploit-forge-keepalive.ps1"
Invoke-WebRequest -Uri "$BASE_URL/keepalive.ps1" -OutFile $installScript -UseBasicParsing
& powershell -ExecutionPolicy Bypass -File $installScript

Write-Host ""
Write-Host "==> Tudo pronto. Usa o link que apareceu acima pra abrir no celular."
