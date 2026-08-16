# release.ps1 - Publica uma release do Sploit no GitHub (Sploit23/sploit).
#
# Fluxo: build -> pacote (zip publico SEM conhecimento.txt) -> tag v<ver> ->
# push -> GitHub Release com o asset.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File release.ps1 [-Version <x.y.z-sploit>]
#
# Parametros:
#   -Version   Versao da release (ex.: 0.1.1-sploit). Padrao: incrementa o
#              patch da ultima tag (v0.1.0-sploit -> 0.1.1-sploit).
#
# Autenticacao para criar a release (uma das duas):
#   1. gh CLI instalado e logado (gh auth login) - preferido.
#   2. Env GITHUB_TOKEN com scope repos (Personal Access Token).
#
# O zip gerado e PUBLICO e NUNCA contem a senha do conhecimento coletivo
# (pack-dist.ps1 roda com -SkipConhecimento).

param(
    [string]$Version = "",
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$repo = "Sploit23/sploit"

# ---------------------------------------------------------------------------
# 1. Versao
# ---------------------------------------------------------------------------
if (-not $Version) {
    $lastTag = (& git describe --tags --abbrev=0 2>$null).Trim()
    if ($lastTag) {
        if ($lastTag -match "v(\d+)\.(\d+)\.(\d+)") {
            $Version = "$($matches[1]).$($matches[2]).$([int]$matches[3] + 1)-sploit"
        } else {
            Write-Host "[ERRO] Ultima tag nao segue o padrao vX.Y.Z-sploit: $lastTag" -ForegroundColor Red
            exit 1
        }
    } else {
        $Version = "0.1.1-sploit"
    }
}
if ($Version -notmatch "^\d+\.\d+\.\d+-sploit$") {
    Write-Host "[ERRO] Versao deve seguir o padrao X.Y.Z-sploit (ex.: 0.1.1-sploit). Recebi: $Version" -ForegroundColor Red
    exit 1
}

Write-Host "==> Release Sploit v$Version" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# 2. Build + pacote
# ---------------------------------------------------------------------------
$zipPath = Join-Path $root "dist\sploit-$Version.zip"
if ((Test-Path $zipPath) -and -not $Force) {
    Write-Host "==> Zip de v$Version ja existe; pulando build/pack (-Force para refazer)." -ForegroundColor Gray
} else {
    Write-Host "==> Compilando binario v$Version ..." -ForegroundColor Yellow
    & (Join-Path $root "scripts\build-sploit.ps1") -Version $Version
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERRO] Build falhou." -ForegroundColor Red
        exit 1
    }

    Write-Host "==> Empacotando dist/sploit-$Version.zip (publico, sem conhecimento) ..." -ForegroundColor Yellow
    & (Join-Path $root "scripts\pack-dist.ps1") -Version $Version -SkipBuild -SkipConhecimento
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERRO] Pack falhou." -ForegroundColor Red
        exit 1
    }
}
if (-not (Test-Path $zipPath)) {
    Write-Host "[ERRO] Zip nao encontrado: $zipPath" -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------------------
# 3. Tag + push do codigo
# ---------------------------------------------------------------------------
Write-Host "==> Commit/abertura pendentes? Verifique o git antes de continuar." -ForegroundColor Yellow
$oldEA = $ErrorActionPreference
$ErrorActionPreference = "Continue"
git add -A 2>$null
$dirty = (git status --porcelain 2>$null | Out-String).Trim()
git push origin master --tags 2>&1 | ForEach-Object { Write-Host "    $_" }
$ErrorActionPreference = $oldEA
if ($dirty) {
    Write-Host "==> Ha mudancas pendentes. Elas precisam ser commitadas antes do release." -ForegroundColor Yellow
}

$tag = "v$Version"
$oldEA = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$hasTag = (git tag -l "$tag" 2>$null | Out-String).Trim()
if (-not $hasTag) {
    git tag "$tag"
    Write-Host "==> Tag criada: $tag" -ForegroundColor Green
} else {
    Write-Host "==> Tag $tag ja existe (reutilizando)." -ForegroundColor Gray
}
git push origin "$tag" 2>&1 | ForEach-Object { Write-Host "    $_" }
$ErrorActionPreference = $oldEA

# ---------------------------------------------------------------------------
# 4. GitHub Release + asset
# ---------------------------------------------------------------------------
$gh = Get-Command gh -ErrorAction SilentlyContinue
if ($gh) {
    Write-Host "==> Publicando release via gh CLI ..." -ForegroundColor Cyan
    gh release create "$tag" "$zipPath" --repo "$repo" --title "Sploit v$Version" --notes "Sploit v$Version"
    if ($LASTEXITCODE -ne 0) {
        # Pode ser que a release ja exista (retry); entao so sobe o asset.
        gh release upload "$tag" "$zipPath" --repo "$repo" --clobber
    }
} elseif ($env:GITHUB_TOKEN) {
    Write-Host "==> Publicando release via API (GITHUB_TOKEN) ..." -ForegroundColor Cyan
    $headers = @{ Authorization = "Bearer $env:GITHUB_TOKEN"; Accept = "application/vnd.github+json" }
    $release = $null
    try {
        $release = Invoke-RestMethod -Method Get -Uri "https://api.github.com/repos/$repo/releases/tags/$tag" -Headers $headers
    } catch {
        $release = $null
    }
    if (-not $release -or -not $release.id) {
        $body = @{ tag_name = $tag; name = "Sploit v$Version"; body = "Sploit v$Version" } | ConvertTo-Json
        $release = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/releases" -Headers $headers -Body $body
    }
    $assetName = "sploit-$Version.zip"
    $asset = $null
    try {
        $asset = Invoke-RestMethod -Method Post -Uri "https://uploads.github.com/repos/$repo/releases/$($release.id)/assets?name=$assetName" -Headers $headers -ContentType "application/zip" -InFile $zipPath
    } catch {
        $asset = $null
    }
    if (-not $asset -or -not $asset.id) {
        Write-Host "==> Asset pode ja existir; conferindo ..." -ForegroundColor Yellow
        $existing = Invoke-RestMethod -Method Get -Uri "https://api.github.com/repos/$repo/releases/$($release.id)/assets" -Headers $headers
        $asset = $existing | Where-Object { $_.name -eq $assetName } | Select-Object -First 1
    }
    Write-Host "==> Asset publicado: $($asset.browser_download_url)" -ForegroundColor Green
} else {
    Write-Host "[ERRO] Sem autenticacao para o GitHub Releases." -ForegroundColor Red
    Write-Host "       Instale e logue o gh CLI (gh auth login) OU defina GITHUB_TOKEN (scope repos)." -ForegroundColor Red
    Write-Host "       O build e o zip ja foram gerados; rode esta autenticacao e o script de novo." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "==> Release publicada! Os amigos atualizam com:" -ForegroundColor Green
Write-Host "    powershell -ExecutionPolicy Bypass -c `"irm https://raw.githubusercontent.com/$repo/master/scripts/install-online.ps1 | iex`""
