# pack-dist.ps1 - Empacotador do Sploit para distribuicao.
#
# Gera um pacote portatil (pasta + zip) pronto para instalar em outros PCs:
# binario + instalador + conhecimento coletivo. NAO inclui codigo-fonte,
# segredos, venv, grafo ou DB - o amigo nao precisa de nada disso.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File pack-dist.ps1 [-SkipBuild] [-Version <tag>]
#
# Parametros:
#   -SkipBuild          Nao recompilar (usa o sploit.exe atual da raiz)
#   -Version            Etiqueta do pacote (padrao: data-hora). Vira nome do zip.
#   -SkipConhecimento   Nao embutir a config do conhecimento coletivo
#                       (conhecimento.txt). Use em release PUBLICO do GitHub,
#                       onde a senha da nuvem NAO pode vazar.
#
# Saida:
#   dist/sploit-<version>/   pasta do pacote
#   dist/sploit-<version>.zip  pacote pronto para enviar

param(
    [switch]$SkipBuild,
    [string]$Version = "",
    [switch]$SkipConhecimento
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$distDir = Join-Path $root "dist"

if (-not $Version) {
    $Version = Get-Date -Format "yyyyMMdd-HHmm"
}

Write-Host "==> Empacotando Sploit v$Version" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# 1. Binario: builda se pedir, senao usa o atual
# ---------------------------------------------------------------------------
$binSource = Join-Path $root "sploit.exe"
if (-not $SkipBuild) {
    Write-Host "==> Compilando binario..." -ForegroundColor Yellow
    & (Join-Path $root "scripts\build-sploit.ps1")
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERRO] build falhou." -ForegroundColor Red
        exit 1
    }
    $built = Join-Path $root "sploit-src\packages\opencode\dist\sploit-windows-x64\bin\sploit.exe"
    if (Test-Path $built) {
        Copy-Item $built $binSource -Force
    }
}
if (-not (Test-Path $binSource)) {
    Write-Host "[ERRO] sploit.exe nao encontrado. Compile primeiro ou use -SkipBuild com um binario na raiz." -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------------------
# 2. Monta a pasta do pacote
# ---------------------------------------------------------------------------
$pkgDir = Join-Path $distDir "sploit-$Version"
if (Test-Path $pkgDir) { Remove-Item $pkgDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $pkgDir | Out-Null

$configDir = Join-Path $env:USERPROFILE ".config\sploit"

# Binario
Copy-Item $binSource (Join-Path $pkgDir "sploit.exe") -Force

# Instalador
Copy-Item (Join-Path $root "scripts\install-sploit.ps1") (Join-Path $pkgDir "install-sploit.ps1") -Force

# Instalador com duplo clique (chama o install-sploit.ps1 automaticamente)
Copy-Item (Join-Path $root "scripts\INSTALAR.cmd") (Join-Path $pkgDir "INSTALAR.cmd") -Force

# Config do conhecimento coletivo embutida: se o dono ja tem a config da nuvem
# (~/.config/sploit/conhecimento.json), grava um "conhecimento.txt" no pacote
# para o amigo instalar sem digitar nada (install-sploit.ps1 detecta sozinho).
# Ignorada em release publico (-SkipConhecimento): a senha da nuvem NAO pode
# ir para o GitHub.
$cfJson = Join-Path $configDir "conhecimento.json"
if (-not $SkipConhecimento -and (Test-Path $cfJson)) {
    $cf = Get-Content $cfJson -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($cf.url) {
        $cfTxt = "url=$($cf.url)`n"
        if ($cf.senha) { $cfTxt += "senha=$($cf.senha)`n" }
        if ($cf.modo) { $cfTxt += "modo=$($cf.modo)`n" }
        $cfTxt | Set-Content -Path (Join-Path $pkgDir "conhecimento.txt") -Encoding UTF8
        Write-Host "==> Conhecimento coletivo embutido no pacote (conhecimento.txt)" -ForegroundColor Green
    }
} elseif ($SkipConhecimento) {
    Write-Host "==> Config do conhecimento coletivo NAO embutida (release publico)." -ForegroundColor Yellow
    Write-Host "        O amigo instala sem conhecimento coletivo ou digita a URL/senha depois." -ForegroundColor Yellow
} else {
    Write-Host "==> [AVISO] Sem config de nuvem em $cfJson - o pacote nao embute a config do conhecimento." -ForegroundColor Yellow
    Write-Host "        Para embutir, rode o install-sploit.ps1 -CloudflareURL <url> -Senha <senha> no seu PC primeiro." -ForegroundColor Yellow
}

# Sync do conhecimento coletivo (ativo quando o instalador recebe -CloudflareURL/-RepoConhecimento)
Copy-Item (Join-Path $root "scripts\sync-conhecimento.ps1") (Join-Path $pkgDir "sync-conhecimento.ps1") -Force

# Deploy do Worker do conhecimento (Cloudflare) - so para quem administra a nuvem
$cfSrc = Join-Path $root "scripts\cloudflare"
if (Test-Path $cfSrc) {
    $cfDst = Join-Path $pkgDir "cloudflare"
    New-Item -ItemType Directory -Force -Path $cfDst | Out-Null
    Copy-Item (Join-Path $cfSrc "worker.js") (Join-Path $cfDst "worker.js") -Force
    Copy-Item (Join-Path $cfSrc "wrangler.toml") (Join-Path $cfDst "wrangler.toml") -Force
}
Copy-Item (Join-Path $root "scripts\deploy-conhecimento.ps1") (Join-Path $pkgDir "deploy-conhecimento.ps1") -Force

# Diagnostico do harness (para o usuario deste PC gerar/subir licoes coletivas)
Copy-Item (Join-Path $root "scripts\diagnostico.py") (Join-Path $pkgDir "diagnostico.py") -Force

# Conhecimento coletivo (viaja para o PC do amigo)
if (Test-Path (Join-Path $root "APRENDIZADO.md")) {
    Copy-Item (Join-Path $root "APRENDIZADO.md") (Join-Path $pkgDir "APRENDIZADO.md") -Force
}

# Config global de identidade (copiada da config do PC atual, se existir)
if (Test-Path (Join-Path $configDir "tui.json")) {
    Copy-Item (Join-Path $configDir "tui.json") (Join-Path $pkgDir "tui.json") -Force
}
if (Test-Path (Join-Path $configDir "AGENTS.md")) {
    Copy-Item (Join-Path $configDir "AGENTS.md") (Join-Path $pkgDir "AGENTS.md") -Force
}

# Instrucoes do amigo
$readme = @"
# Sploit - instalacao rapida

1. Descompacte esta pasta em qualquer lugar (ex.: Documentos).
2. De um duplo clique em ``INSTALAR.cmd`` (instala tudo sozinho).
   - Se preferir, rode no terminal:
       powershell -ExecutionPolicy Bypass -File install-sploit.ps1
3. Feche e abra um terminal novo.
4. Va ate a pasta do seu projeto e rode:
       sploit
5. Na primeira vez, o Sploit pergunta qual modelo/provider usar.

Depois disso, ``sploit`` funciona em qualquer pasta.

## Conhecimento coletivo

Este pacote ja vem com a config do conhecimento coletivo embutida
(arquivo ``conhecimento.txt``, gerado pelo dono): as licoes que o Sploit
aprende em qualquer PC deste grupo chegam sozinhas neste PC, e as suas
saem sozinhas quando voce roda ``/diagnostico``. Nada para digitar.

- Nao compartilhe este pacote com quem nao e do grupo: ele contem a
  senha da nuvem do conhecimento.
- Rode ``/diagnostico`` dentro do Sploit para gerar e subir as suas licoes (push).

## Publicar a nuvem do conhecimento (apenas o dono)

Na pasta ``cloudflare/`` ou pelo script ``deploy-conhecimento.ps1`` (exige conta
Cloudflare gratuita):

    powershell -ExecutionPolicy Bypass -File deploy-conhecimento.ps1

Isso faz login 1x no navegador, cria o KV namespace, define a senha e publica
o Worker. A partir dai, o ``/diagnostico`` do seu PC (rodando com a config de
nuvem) sobe as licoes automaticamente e os outros PCs as recebem.

## Atualizar

- Para receber conhecimento novo e novas versoes do binario, substitua os
  arquivos desta pasta pelos da versao mais recente e rode o install-sploit.ps1
  (ou o INSTALAR.cmd) de novo.

## Duvidas

- ``sploit`` nao encontrado? Abra um terminal novo (o PATH muda so ao reabrir).
- Primeira tela perguntando modelo? Escolha o provider e cole a sua API key.
"@
$readme | Set-Content -Path (Join-Path $pkgDir "LEIA-ME.txt") -Encoding UTF8

# ---------------------------------------------------------------------------
# 3. Zipa
# ---------------------------------------------------------------------------
$zipPath = Join-Path $distDir "sploit-$Version.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $pkgDir "*") -DestinationPath $zipPath -CompressionLevel Optimal

$sizeMB = [Math]::Round((Get-Item $zipPath).Length / 1MB, 1)
Write-Host ""
Write-Host "==> Pronto!" -ForegroundColor Green
Write-Host "    Pasta:  $pkgDir"
Write-Host "    Zip:    $zipPath  ($sizeMB MB)"
Write-Host ""
Write-Host "Envie o zip para o amigo. Ele descompacta e roda install-sploit.ps1."
