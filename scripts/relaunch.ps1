# relaunch.ps1 — Relançamento desanexado do Sploit (sobrevive à morte do processo atual).
#
# Por que existe: quando o self-restart.ps1 mata o processo do Sploit, o console que
# hospedava o comando (e o próprio script) morre junto — às vezes antes do relançamento.
# Este script roda num processo PowerShell independente (lançado via Start-Process,
# janela oculta), então ele sobrevive à morte do Sploit e garante a troca + relaunch.
#
# Uso:
#   powershell -NoProfile -ExecutionPolicy Bypass -File relaunch.ps1 `
#       -OldPid <pid do processo atual> -Root <caminho raiz> [-NeedsCopy] [-ResumePrompt "texto"]
#
# Fluxo:
#   1. Aguarda o processo antigo (OldPid) sair de cena (poll a cada 500ms, máx 60s).
#   2. Se -NeedsCopy, copia o binário novo do dist/ para sploit.exe.
#   3. Relança `sploit.exe --continue` em janela nova (console visível para a TUI).
#      Se -ResumePrompt for informado, o prompt é enviado junto (--prompt) para o
#      agente retomar o trabalho automaticamente em vez de esperar input.
#   4. Verifica sobrevivência e escreve o resultado em logs/relaunch.log.

param(
    [Parameter(Mandatory = $true)][int]$OldPid,
    [Parameter(Mandatory = $true)][string]$Root,
    [switch]$NeedsCopy,
    [string]$ResumePrompt = ""
)

$ErrorActionPreference = "Continue"
$logDir = "$Root\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = "$logDir\relaunch.log"

function Log([string]$msg) {
    $line = "$(Get-Date -Format 'HH:mm:ss')  $msg"
    Add-Content -Path $log -Value $line -Encoding UTF8
    Write-Host $line
}

Log "=== relaunch.ps1 iniciado (OldPid=$OldPid, NeedsCopy=$NeedsCopy) ==="

# --- 1. Aguarda o processo antigo sair --------------------------------------
$deadline = (Get-Date).AddSeconds(60)
while (Get-Process -Id $OldPid -ErrorAction SilentlyContinue) {
    if ((Get-Date) -gt $deadline) {
        Log "[FALHA] Processo $OldPid nao saiu em 60s. Abortando relaunch."
        exit 1
    }
    Start-Sleep -Milliseconds 500
}
Log "Processo antigo $OldPid encerrado."

# --- 2. Troca o binário (se preciso) -----------------------------------------
$exePath = "$Root\sploit.exe"
if ($NeedsCopy) {
    $distExe = "$Root\sploit-src\packages\opencode\dist\opencode-windows-x64\bin\opencode.exe"
    if (Test-Path $distExe) {
        Copy-Item $distExe $exePath -Force
        Log "sploit.exe atualizado (do dist/)."
    } else {
        Log "[AVISO] dist nao encontrado: $distExe — mantendo binario atual."
    }
}

# --- 3. Relança em janela nova ----------------------------------------------
$argsList = @("--continue")
if ($ResumePrompt) {
    $argsList += "--prompt"
    $argsList += $ResumePrompt
    Log "Prompt de retomada enviado: $ResumePrompt"
}
$p = Start-Process -FilePath $exePath -ArgumentList $argsList -WorkingDirectory $Root -PassThru
Log "Relancado sploit.exe --continue (PID $($p.Id))."
Start-Sleep -Seconds 8

# --- 4. Verifica sobrevivência ----------------------------------------------
if (Get-Process -Id $p.Id -ErrorAction SilentlyContinue) {
    Log "[OK] Sploit novo vivo (PID $($p.Id))."
    exit 0
}
Log "[FALHA] Sploit novo morreu apos relaunch."

$bakPath = "$Root\sploit.exe.bak"
if (Test-Path $bakPath) {
    Copy-Item $bakPath $exePath -Force
    Log "[ROLLBACK] sploit.exe.bak restaurado."
    $p2 = Start-Process -FilePath $exePath -ArgumentList $argsList -WorkingDirectory $Root -PassThru
    Log "[ROLLBACK] Relancado com binario antigo (PID $($p2.Id))."
    exit 2
}
Log "[FALHA] Nenhum backup disponivel para rollback."
exit 1
