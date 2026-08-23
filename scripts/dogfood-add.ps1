# dogfood-add.ps1 - traz o sploit.db de outra maquina pra avaliar as mutacoes
# G5-G9 (avalia_mutacoes.py) com amostra combinada, ja que cada maquina tem
# seu proprio banco local (o contexto nao migra entre DBs - ver SPLOIT_STATE.md).
#
# Uso: copie o sploit.db da outra maquina pra um lugar acessivel daqui
# (pendrive, pasta de rede, nuvem) e rode:
#   .\scripts\dogfood-add.ps1 -From "D:\sploit.db" -Nome maxx
#
# O arquivo e copiado (nao movido) pra docs/historico/dogfood/ (gitignored -
# e historico real de sessao, nao deve ir pro repo) com nome e timestamp, e o
# script imprime o comando pronto pra rodar a avaliacao combinada.

param(
    [Parameter(Mandatory = $true)][string]$From,
    [Parameter(Mandatory = $true)][string]$Nome
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $From)) {
    throw "Arquivo nao encontrado: $From"
}

$root = Split-Path -Parent $PSScriptRoot
$destDir = Join-Path $root "docs\historico\dogfood"
New-Item -ItemType Directory -Force -Path $destDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$destName = "$Nome-$stamp.db"
$dest = Join-Path $destDir $destName
Copy-Item $From $dest

$localDb = Join-Path $env:USERPROFILE ".local\share\sploit\sploit.db"

Write-Host "Copiado para $dest" -ForegroundColor Green
Write-Host ""
Write-Host "Para avaliar as mutacoes combinando com este PC:" -ForegroundColor Cyan
Write-Host "  python scripts/avalia_mutacoes.py --db `"$localDb`" --db `"$dest`""
