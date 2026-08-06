# Recompila o sploit.exe a partir do sploit-src (fork do opencode).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$bun = "$env:APPDATA\npm\bun.cmd"
if (-not (Test-Path $bun)) {
    $bun = "bun"
}

Push-Location "$root\sploit-src\packages\opencode"
try {
    $env:OPENCODE_VERSION = "0.1.0-sploit"
    $env:OPENCODE_CHANNEL = "sploit"
    & $bun run script/build.ts --single --skip-install --skip-embed-web-ui
    if ($LASTEXITCODE -ne 0) {
        throw "build falhou (exit $LASTEXITCODE)"
    }
    Copy-Item "dist\opencode-windows-x64\bin\opencode.exe" "$root\sploit.exe" -Force
    Write-Host "sploit.exe atualizado"
}
finally {
    Pop-Location
}
