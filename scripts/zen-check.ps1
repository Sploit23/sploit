# zen-check.ps1 — Diagnóstico do limite free tier da opencode.ai (big-pickle).
#
# Responde em segundos: o "Free limit reached" é problema do SEU IP/rede ou do
# Sploit/chave?
#
# Uso:
#   .\scripts\zen-check.ps1             # diagnóstico completo (IP + chave + sem chave)
#   .\scripts\zen-check.ps1 -NoKey      # só o teste sem chave (não toca na chave)
#   .\scripts\zen-check.ps1 -Quiet      # só o veredito, sem banner
#
# Como interpretar:
#   - Com chave 429  +  Sem chave 429  => limite é POR IP/rede (troque de rede ou aguarde reset).
#   - Com chave 200  +  Sem chave 429  => seu IP está limitado agora, mas com chave passa.
#   - Com chave 200  +  Sem chave 401  => normal: anônimo precisa de chave; limite OK.
#   - Com chave 401  => a chave em auth.json é inválida/rejeitada.
#
# Dica de teste da hipótese IP: rode no PC, depois rode de novo do CELULAR (hotspot).
# IP diferente + sem erro => confirmado que o bloqueio acompanha o IP.

param(
    [switch]$NoKey,
    [switch]$Quiet
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$authCandidates = @(
    "$env:LOCALAPPDATA\sploit\auth.json",
    "$env:APPDATA\sploit\auth.json",
    "$env:USERPROFILE\.local\share\sploit\auth.json"
)
$authFile = $authCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$zen = "https://opencode.ai/zen/v1"
$model = "big-pickle"
$bodyFile = Join-Path $env:TEMP "zen-check-body.json"
'{"model":"big-pickle","messages":[{"role":"user","content":"responda apenas: ok"}]}' |
    Set-Content -LiteralPath $bodyFile -Encoding ascii

function Get-JsonField {
    param([string]$Json, [string]$Path)
    try {
        $obj = $Json | ConvertFrom-Json
        foreach ($part in $Path.Split(".")) { $obj = $obj.$part }
        return $obj
    } catch { return $null }
}

function Test-Endpoint {
    param([string]$Label, [string]$Bearer, [switch]$Anonymous)
    if (-not $Quiet) {
        Write-Host ""
        Write-Host "  > $Label"
    }
    $authArg = if ($Anonymous) { @() } else { @("-H", "Authorization: Bearer $Bearer") }
    $tmpBody = Join-Path $env:TEMP "zen-check-out-$(Get-Random).txt"
    $tmpHeaders = "$tmpBody.headers"
    $code = (& curl.exe -s -o $tmpBody -D $tmpHeaders -w "%{http_code}" -X POST "$zen/chat/completions" `
        @authArg `
        -H "Content-Type: application/json" `
        --data "@$bodyFile" --max-time 60 2>$null) | Out-String
    $resp = ""
    if (Test-Path $tmpBody) { $resp = Get-Content -LiteralPath $tmpBody -Raw -ErrorAction SilentlyContinue }
    Remove-Item -LiteralPath $tmpBody, $tmpHeaders -Force -ErrorAction SilentlyContinue
    if ("$code".Trim() -match "^\d+$") { return [pscustomobject]@{ Code = [int]("$code".Trim()); Body = $resp } }
    return [pscustomobject]@{ Code = 0; Body = "sem resposta" }
}

function Get-EgressIP {
    try {
        return (Invoke-RestMethod -Uri "https://api.ipify.org?format=json" -TimeoutSec 15).ip
    } catch {
        try { return (Invoke-RestMethod -Uri "https://ipinfo.io/json" -TimeoutSec 15).ip } catch { return "desconhecido" }
    }
}

if (-not $Quiet) {
    Write-Host ""
    Write-Host "=== zen-check: diagnostico do limite free tier (opencode.ai) ==="
}

$ip = Get-EgressIP
Write-Host "  IP de saida atual: $ip"

$key = $null
if (-not $NoKey -and (Test-Path -LiteralPath $authFile)) {
    $key = (Get-Content -LiteralPath $authFile -Raw | ConvertFrom-Json).opencode.key
    if (-not $Quiet) {
        $masked = if ($key) { $key.Substring(0, [Math]::Min(10, $key.Length)) + "..." } else { "(sem chave)" }
        Write-Host "  Chave (auth.json, provider opencode): $masked"
    }
}

if ($NoKey) {
    $anon = Test-Endpoint -Label "POST /chat/completions (big-pickle) SEM chave" -Anonymous
    Write-Host ""
    if ($anon.Code -eq 429) {
        Write-Host "  VEREDITO: 429 sem chave => limite POR IP. Troque de rede/VPN ou aguarde o reset." -ForegroundColor Yellow
    } else {
        Write-Host "  VEREDITO: sem chave retornou $($anon.Code) => limite nao esta ativo agora." -ForegroundColor Green
    }
    return
}

if (-not $key) {
    Write-Host "  [AVISO] auth.json nao encontrado em $authFile (ou sem provider opencode)." -ForegroundColor Yellow
    $anon = Test-Endpoint -Label "POST /chat/completions (big-pickle) SEM chave" -Anonymous
    if ($anon.Code -eq 429) {
        Write-Host ""
        Write-Host "  VEREDITO: 429 sem chave => limite POR IP/rede." -ForegroundColor Yellow
    }
    return
}

$models = Test-Endpoint -Label "POST /chat/completions (big-pickle) COM chave" -Bearer $key
$anon = Test-Endpoint -Label "POST /chat/completions (big-pickle) SEM chave" -Anonymous

Write-Host ""
Write-Host "  Resumo:"
Write-Host "    com chave : HTTP $($models.Code)"
Write-Host "    sem chave : HTTP $($anon.Code)"
$modelsErr = Get-JsonField -Json $models.Body -Path "error.error.type"
if ($modelsErr) { Write-Host "    erro com chave: $modelsErr" }
if ($anon.Code -eq 429 -and $models.Code -eq 429) {
    Write-Host "  VEREDITO: 429 com E sem chave => limite POR IP/rede (nao e o Sploit nem a chave)." -ForegroundColor Yellow
} elseif ($models.Code -eq 200 -or ($models.Body -match "choices")) {
    Write-Host "  VEREDITO: com chave FUNCIONOU (HTTP $($models.Code)). Sem chave limitado => sua rede esta no limite agora; aguarde o reset." -ForegroundColor Green
} elseif ($models.Code -eq 429) {
    Write-Host "  VEREDITO: com chave 429 mas sem chave $($anon.Code). Confirme rodando do CELULAR (hotspot)." -ForegroundColor Cyan
} elseif ($models.Code -eq 401) {
    Write-Host "  VEREDITO: chave REJEITADA (401). Confira a chave em auth.json (provider opencode)." -ForegroundColor Red
} else {
    Write-Host "  VEREDITO: com chave HTTP $($models.Code). Imprevisto — rode .\scripts\zen-check.ps1 e mostre a saida." -ForegroundColor Red
}

Remove-Item -LiteralPath $bodyFile -Force -ErrorAction SilentlyContinue
