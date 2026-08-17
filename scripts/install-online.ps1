# install-online.ps1 - Instala o Sploit em 1 comando (a partir do GitHub).
#
# Uso (em qualquer PC dos amigos):
#   powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/Sploit23/sploit/master/scripts/install-online.ps1 | iex"
#
# Baixa a ultima release do Sploit, descompacta em um diretorio temporario e
# chama o install-sploit.ps1 embutido (instala em %LOCALAPPDATA%\Sploit\bin,
# registra no PATH do usuario e cria a config global). Depois e so abrir um
# terminal novo e rodar: sploit
#
# Parametros opcionais:
#   -CloudflareURL   URL do Worker do conhecimento coletivo
#   -Senha           Senha compartilhada do conhecimento coletivo
#   -Version         Versao especifica (padrao: ultima release)
#   -OpenCodeKey     API key da opencode para autenticar (cota propria)
#
# Tambem le de env vars: SPLOIT_CLOUDFLARE_URL, SPLOIT_SENHA, SPLOIT_VERSION, SPLOIT_OPENCODE_KEY.
# Sem URL/senha o Sploit instala sem o conhecimento coletivo (a senha da nuvem
# NAO viaja em release publica; passe os parametros se quiser ativar).
# Sem API key usa a chave "public" (cota compartilhada, rate limit mais apertado).

param(
    [string]$Version = "",
    [string]$CloudflareURL = "",
    [string]$Senha = "",
    [string]$OpenCodeKey = ""
)

$ErrorActionPreference = "Stop"
$repo = "Sploit23/sploit"

if (-not $CloudflareURL) { $CloudflareURL = $env:SPLOIT_CLOUDFLARE_URL }
if (-not $Senha) { $Senha = $env:SPLOIT_SENHA }
if (-not $Version) { $Version = $env:SPLOIT_VERSION }
if (-not $OpenCodeKey) { $OpenCodeKey = $env:SPLOIT_OPENCODE_KEY }

function Invoke-Download([string]$Url, [string]$Destino) {
    $curlPath = (Get-Command curl.exe -ErrorAction SilentlyContinue).Source
    if ($curlPath) {
        $oldEA = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $httpCode = & $curlPath -sSL -o $Destino -w "%{http_code}" $Url 2>$null
        $ErrorActionPreference = $oldEA
        if ("$httpCode".Trim() -eq "200") { return $true }
    }
    $oldEA = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 120 -OutFile $Destino
        return $true
    } catch {
        return $false
    } finally {
        $ErrorActionPreference = $oldEA
    }
}

Write-Host "==> Instalador online do Sploit" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# 1. Descobre a versao (padrao: ultima release)
# ---------------------------------------------------------------------------
if (-not $Version) {
    Write-Host "==> Consultando ultima release do GitHub ..." -ForegroundColor Yellow
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -Headers @{ "User-Agent" = "sploit-installer" }
    $Version = $release.tag_name.TrimStart("v")
    Write-Host "    Ultima versao: $Version" -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# 2. Baixa e descompacta a release
# ---------------------------------------------------------------------------
$zipUrl = "https://github.com/$repo/releases/download/v$Version/sploit-$Version.zip"
$tmpDir = Join-Path $env:TEMP "sploit-online-$Version"
$zipPath = Join-Path $tmpDir "sploit-$Version.zip"

New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
if (-not (Test-Path $zipPath)) {
    Write-Host "==> Baixando $zipUrl ..." -ForegroundColor Yellow
    if (-not (Invoke-Download $zipUrl $zipPath)) {
        Write-Host "[ERRO] Falha no download da release." -ForegroundColor Red
        exit 1
    }
}

Write-Host "==> Descompactando ..." -ForegroundColor Yellow
Expand-Archive -LiteralPath $zipPath -DestinationPath $tmpDir -Force

$exePath = Join-Path $tmpDir "sploit.exe"
if (-not (Test-Path $exePath)) {
    Write-Host "[ERRO] sploit.exe nao encontrado na release baixada." -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------------------
# 3. Roda o instalador embutido (copia para %LOCALAPPDATA%, PATH, config)
# ---------------------------------------------------------------------------
$installScript = Join-Path $tmpDir "install-sploit.ps1"
$installArgs = @("-BinPath", $exePath)
if ($CloudflareURL) { $installArgs += @("-CloudflareURL", $CloudflareURL) }
if ($Senha) { $installArgs += @("-Senha", $Senha) }
if ($OpenCodeKey) { $installArgs += @("-OpenCodeKey", $OpenCodeKey) }

Write-Host "==> Instalando ..." -ForegroundColor Yellow
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installScript @installArgs
$installCode = $LASTEXITCODE

Remove-Item -LiteralPath $tmpDir -Recurse -Force -ErrorAction SilentlyContinue

if ($installCode -ne 0) {
    Write-Host "[ERRO] Instalacao falhou (exit $installCode)." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Instalacao concluida!" -ForegroundColor Green
Write-Host ""
Write-Host "  1. Feche e abra um terminal novo (o PATH muda so ao reabrir)."
Write-Host "  2. Va ate a pasta de um projeto e rode:  sploit"
if ($OpenCodeKey) {
    Write-Host "  3. Ja abre autenticado com API key propria (cota completa)." -ForegroundColor Green
} else {
    Write-Host "  3. Ja abre usando o big-pickle (servidor gratuito da opencode)."
    Write-Host "     Sem API key: cota compartilhada com rate limit."
    Write-Host "     Para melhor performance, rode: sploit auth login"
}
Write-Host "  4. O Sploit busca atualizacoes sozinho quando abre."
Write-Host ""
if ($CloudflareURL) {
    Write-Host "Conhecimento coletivo ativo (Cloudflare)!" -ForegroundColor Green
}
