# deploy-conhecimento.ps1 - Publica o Worker sploit-conhecimento no Cloudflare.
#
# Faz login (1x), cria o KV namespace, define a senha compartilhada e faz o
# deploy. Depois deste script, o conhecimento fica disponivel em:
#   https://sploit-conhecimento.<conta>.workers.dev/aprendizado.md
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-conhecimento.ps1
#
# Parametros:
#   -Senha    Senha compartilhada para enviar/consultar licoes (pede se nao informar)
#   -SkipLogin  Pula o login (use se ja fez `wrangler login` antes)

param(
    [string]$Senha = "",
    [switch]$SkipLogin
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$cfDir = Join-Path $root "scripts\cloudflare"
$tomlPath = Join-Path $cfDir "wrangler.toml"

if (-not (Test-Path $cfDir)) {
    Write-Host "[ERRO] Pasta do worker nao encontrada: $cfDir" -ForegroundColor Red
    exit 1
}

# npx no Windows pode ser npx.cmd; usamos via cmd para evitar problema de PATH
function Invoke-Wrangler([string]$args, [string]$input = "") {
    $oldEA = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    if ($input) {
        $out = $input | & npx --yes wrangler @args 2>&1
    } else {
        $out = & npx --yes wrangler @args 2>&1
    }
    $code = $LASTEXITCODE
    $ErrorActionPreference = $oldEA
    return @{ Code = $code; Out = $out }
}

Write-Host "==> Publicando Worker sploit-conhecimento no Cloudflare" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# 1. Login (1x; abre o navegador)
# ---------------------------------------------------------------------------
if (-not $SkipLogin) {
    Write-Host "==> Login no Cloudflare (abre o navegador; autorize uma vez)" -ForegroundColor Yellow
    $r = Invoke-Wrangler "login"
    if ($r.Code -ne 0) {
        Write-Host "[ERRO] Login falhou. Rode manualmente: npx wrangler login" -ForegroundColor Red
        $r.Out | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
        exit 1
    }
    Write-Host "==> Login OK" -ForegroundColor Green
} else {
    Write-Host "==> Login pulado (usando sessao existente)" -ForegroundColor Gray
}

# ---------------------------------------------------------------------------
# 2. Cria o KV namespace (idempotente: se ja tem id no toml, usa ele)
# ---------------------------------------------------------------------------
$toml = Get-Content $tomlPath -Raw
$match = [regex]::Match($toml, 'id\s*=\s*"([^"]+)"')
$hasId = $match.Success -and $match.Groups[1].Value -ne "SUBSTITUA_PELO_ID_DO_NAMESPACE"

if (-not $hasId) {
    Write-Host "==> Criando KV namespace CONHECIMENTO..." -ForegroundColor Yellow
    $r = Invoke-Wrangler "kv namespace create CONHECIMENTO"
    if ($r.Code -ne 0) {
        Write-Host "[ERRO] Falha ao criar o KV namespace:" -ForegroundColor Red
        $r.Out | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
        exit 1
    }
    $idLine = ($r.Out | Select-String 'id\s*:\s*"([^"]+)"' | Select-Object -First 1).Line
    if (-not $idLine) {
        Write-Host "[ERRO] Nao consegui extrair o id do KV namespace. Saida:" -ForegroundColor Red
        $r.Out | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
        Write-Host "  Edite $tomlPath manualmente com o id do namespace." -ForegroundColor Yellow
        exit 1
    }
    $kvId = [regex]::Match($idLine, 'id\s*:\s*"([^"]+)"').Groups[1].Value
    $toml = $toml -replace 'id\s*=\s*"SUBSTITUA_PELO_ID_DO_NAMESPACE"', "id = `"$kvId`""
    Set-Content -Path $tomlPath -Value $toml -Encoding UTF8
    Write-Host "==> KV namespace criado: $kvId" -ForegroundColor Green
} else {
    $kvId = $match.Groups[1].Value
    Write-Host "==> KV namespace ja configurado: $kvId" -ForegroundColor Gray
}

# ---------------------------------------------------------------------------
# 3. Define a senha compartilhada (secret SENHA)
# ---------------------------------------------------------------------------
if (-not $Senha) {
    $Senha = Read-Host "Defina a senha compartilhada (use em todos os PCs)"
}
if (-not $Senha) {
    Write-Host "[ERRO] Senha vazia." -ForegroundColor Red
    exit 1
}
Write-Host "==> Definindo secret SENHA..." -ForegroundColor Yellow
$r = Invoke-Wrangler "secret put SENHA" $Senha
if ($r.Code -ne 0) {
    Write-Host "[ERRO] Falha ao definir a secret SENHA:" -ForegroundColor Red
    $r.Out | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    exit 1
}
Write-Host "==> Secret SENHA definida" -ForegroundColor Green

# ---------------------------------------------------------------------------
# 4. Deploy
# ---------------------------------------------------------------------------
Write-Host "==> Deploy do Worker..." -ForegroundColor Yellow
$r = Invoke-Wrangler "deploy"
if ($r.Code -ne 0) {
    Write-Host "[ERRO] Deploy falhou:" -ForegroundColor Red
    $r.Out | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    exit 1
}

# Extrai a URL workers.dev da saida
$urlLine = ($r.Out | Select-String 'https://[a-z0-9-]+\.\w+\.workers\.dev' | Select-Object -First 1).Line
if ($urlLine) {
    $url = [regex]::Match($urlLine, 'https://[a-z0-9-]+\.\w+\.workers\.dev').Value
} else {
    $url = "https://sploit-conhecimento.<sua-conta>.workers.dev"
}

Write-Host ""
Write-Host "==> Conhecimento coletivo no ar!" -ForegroundColor Green
Write-Host "    URL: $url/aprendizado.md"
Write-Host ""
Write-Host "No PC de cada amigo, rode o instalador com:"
Write-Host "  install-sploit.ps1 -CloudflareURL $url -Senha $Senha"
Write-Host ""
Write-Host "Guarde a senha: $Senha" -ForegroundColor Cyan
