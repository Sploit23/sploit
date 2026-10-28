# FORGE — mantém a WSL ligada. Sem isso, a WSL2 desliga sozinha alguns
# segundos depois de ficar ociosa, o que derruba o tailscaled e o FORGE
# junto. Roda um `sleep infinity` detached dentro da WSL (segura o VM
# ligado) e deixa um atalho na pasta Startup do Windows pra repetir isso
# a cada login -- não precisa ser Administrador.
#
# Rode uma vez, numa PowerShell comum do Windows (fora da WSL):
#   irm https://raw.githubusercontent.com/Sploit23/sploit/dev/packages/opencode/src/cli/cmd/forge/app/keepalive.ps1 | iex

$ErrorActionPreference = "Stop"

$distros = (wsl.exe -l -q) -replace "`0", "" | Where-Object { $_.Trim() -ne "" }
$distro = $distros | Where-Object { $_ -match "Ubuntu|Debian" -and $_ -notmatch "docker-desktop" } | Select-Object -First 1
if (-not $distro) { $distro = $distros | Select-Object -First 1 }
if (-not $distro) { throw "Nenhuma distribuicao WSL encontrada. Instale com: wsl --install -d Ubuntu" }
$distro = $distro.Trim()

$startupDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
$startupScript = Join-Path $startupDir "SploitForgeKeepAlive.vbs"
$vbs = "Set objShell = CreateObject(`"WScript.Shell`")`r`nobjShell.Run `"wsl.exe -d $distro -u root -- sleep infinity`", 0, False`r`n"
Set-Content -Path $startupScript -Value $vbs -Encoding ASCII

Start-Process -FilePath "wsl.exe" -ArgumentList @("-d", $distro, "-u", "root", "--", "sleep", "infinity") -WindowStyle Hidden

Write-Host "OK -- WSL ($distro) vai ficar ligada mesmo ociosa, e volta a ligar sozinha a cada login."
