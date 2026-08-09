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
    # Backup do binário atual (known-good) antes de sobrescrever.
    # O self-restart.ps1 usa esse backup para rollback automático.
    if (Test-Path "$root\sploit.exe") {
        Copy-Item "$root\sploit.exe" "$root\sploit.exe.bak" -Force
        Write-Host "backup criado: sploit.exe.bak"
    }
    Copy-Item "dist\sploit-windows-x64\bin\sploit.exe" "$root\sploit.exe" -Force
    Write-Host "sploit.exe atualizado"
}
finally {
    Pop-Location
}
