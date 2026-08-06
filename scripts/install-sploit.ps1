# Instala o Sploit pra uso do dia a dia: copia o sploit.exe já buildado
# para um local estável fora do repo e registra esse local no PATH do
# usuário, para que `sploit` funcione em qualquer pasta.
#
# Uso:
#   .\scripts\install-sploit.ps1              # builda do zero e instala
#   .\scripts\install-sploit.ps1 -SkipBuild    # reusa o sploit.exe já existente na raiz
param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$exePath = "$root\sploit.exe"

if (-not $SkipBuild) {
    & "$PSScriptRoot\build-sploit.ps1"
}

if (-not (Test-Path $exePath)) {
    throw "sploit.exe não encontrado em $exePath. Rode sem -SkipBuild, ou rode build-sploit.ps1 primeiro."
}

$installDir = "$env:LOCALAPPDATA\Sploit\bin"
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
Copy-Item $exePath "$installDir\sploit.exe" -Force

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ([string]::IsNullOrEmpty($userPath)) {
    $userPath = ""
}
$pathEntries = $userPath -split ";" | Where-Object { $_ -ne "" }
if ($pathEntries -notcontains $installDir) {
    $newPath = if ($userPath) { "$userPath;$installDir" } else { $installDir }
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    Write-Host "PATH do usuário atualizado com $installDir"
} else {
    Write-Host "$installDir já está no PATH do usuário"
}

# Atualiza o PATH da sessão atual, para poder testar sem abrir um terminal novo.
if (($env:Path -split ";") -notcontains $installDir) {
    $env:Path = "$env:Path;$installDir"
}

Write-Host ""
Write-Host "sploit.exe instalado em $installDir\sploit.exe"
Write-Host "Abra um terminal novo (ou use este mesmo, já atualizado) e rode 'sploit' de qualquer pasta."
