# self-restart.ps1 — Reinício seguro do Sploit com rollback automático.
#
# Ciclo de auto-melhoria:
#   1. build-sploit.ps1 recompila o binário (dist/opencode-windows-x64) e cria
#      sploit.exe.bak (known-good). Quando o Sploit está em execução, o build
#      NÃO consegue sobrescrever sploit.exe (arquivo em uso) — a troca fica
#      para este script (passo 2.5), depois do processo ser encerrado.
#   2. Este script faz um SMOKE TEST do binário novo (sploit doctor) ANTES de
#      tocar no processo atual. Se o binário novo não abrir/config falhar, ele
#      aborta e o Sploit atual continua rodando intacto.
#   3. Se o smoke test passa: mata o processo atual, troca o binário (se o
#      dist for mais novo) e relança `sploit --continue` numa janela nova.
#   4. Após o relaunch, verifica se o processo novo sobreviveu alguns segundos.
#      Se morreu (erro em runtime que o doctor não pega), restaura o backup
#      sploit.exe.bak e relança com o binário antigo — nunca fica "sem abrir".
#
# Uso:
#   .\scripts\self-restart.ps1            # smoke test + reinício
#   .\scripts\self-restart.ps1 -SkipSmoke # pula o doctor (ex.: já testado)
#
# Para retomar a conversa: `sploit --continue`.

param(
    [switch]$SkipSmoke
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$exePath = "$root\sploit.exe"
$bakPath = "$root\sploit.exe.bak"
$logDir = "$root\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$smokeLog = "$logDir\smoke-test.log"

# O binário recém-compilado pelo build-sploit.ps1. Quando o Sploit está em
# execução, o build não consegue sobrescrever sploit.exe (arquivo em uso) —
# por isso a troca é feita AQUI, depois do processo ser encerrado.
$distExe = "$root\sploit-src\packages\opencode\dist\opencode-windows-x64\bin\opencode.exe"

Write-Host ""
Write-Host "=== self-restart: ciclo de auto-melhoria do Sploit ==="

if (-not (Test-Path $exePath)) {
    Write-Host "[FALHA] sploit.exe nao encontrado em $exePath" -ForegroundColor Red
    exit 1
}

# Decide qual binário é o "novo": o do dist (build recente) se existir e for
# mais novo que o sploit.exe corrente. O smoke test roda sobre esse binário.
$newExe = $exePath
$needsCopy = $false
if (Test-Path $distExe) {
    $distTime = (Get-Item $distExe).LastWriteTime
    $exeTime = (Get-Item $exePath).LastWriteTime
    if ($distTime -gt $exeTime) {
        $newExe = $distExe
        $needsCopy = $true
    }
}
Write-Host "Binario novo: $newExe"

# ---------------------------------------------------------------------------
# 1. SMOKE TEST do binário novo (antes de matar qualquer coisa)
# ---------------------------------------------------------------------------
if (-not $SkipSmoke) {
    Write-Host "[1/4] Smoke test do binario novo (sploit doctor)..."
    # PowerShell 5.1 trata a saída do binário no stderr como NativeCommandError.
    # Com $ErrorActionPreference = "Stop" isso aborta o script mesmo com exit 0.
    # Temporariamente volta para "Continue" durante o doctor.
    $oldEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & $newExe doctor *> $smokeLog
    $doctorExit = $LASTEXITCODE
    $ErrorActionPreference = $oldEap
    if ($doctorExit -ne 0) {
        Write-Host "[ABORTADO] O binario novo falhou no smoke test (exit $doctorExit)." -ForegroundColor Red
        Write-Host "O Sploit atual continua rodando intacto. Veja $smokeLog" -ForegroundColor Yellow
        Get-Content $smokeLog -Tail 30 | ForEach-Object { Write-Host "  $_" }
        exit 1
    }
    Write-Host "[1/4] Smoke test OK — binario novo valido." -ForegroundColor Green
} else {
    Write-Host "[1/4] Smoke test pulado (-SkipSmoke)."
}

# ---------------------------------------------------------------------------
# 2. Encerra o processo atual
# ---------------------------------------------------------------------------
Write-Host "[2/4] Encerrando processo atual do Sploit..."
$current = Get-Process sploit -ErrorAction SilentlyContinue
if ($current) {
    $current | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Write-Host "      processo(s) encerrado(s): $($current.Id -join ', ')"
} else {
    Write-Host "      nenhum processo sploit ativo."
}

# ---------------------------------------------------------------------------
# 2.5 Troca o binário (só agora que o arquivo está livre)
# ---------------------------------------------------------------------------
if ($needsCopy) {
    Write-Host "[2.5/4] Copiando binario novo para sploit.exe..."
    Copy-Item $distExe $exePath -Force
    Write-Host "      sploit.exe atualizado."
}

# ---------------------------------------------------------------------------
# 3. Relança com --continue em uma janela nova
# ---------------------------------------------------------------------------
Write-Host "[3/4] Relancando sploit.exe (--continue) em janela nova..."
$started = Start-Process -FilePath $exePath -ArgumentList "--continue" -WorkingDirectory $root -PassThru
Start-Sleep -Seconds 8

# ---------------------------------------------------------------------------
# 4. Verifica sobrevivência; rollback se o processo novo morreu
# ---------------------------------------------------------------------------
$alive = Get-Process -Id $started.Id -ErrorAction SilentlyContinue
if ($alive) {
    Write-Host "[4/4] Sploit novo rodando (PID $($started.Id)). Sucesso!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Se a janela nova nao apareceu, rode manualmente: sploit --continue"
    exit 0
}

Write-Host "[4/4] O processo novo MORREU apos o relaunch." -ForegroundColor Red

if (Test-Path $bakPath) {
    Write-Host "[ROLLBACK] Restaurando sploit.exe.bak (known-good)..."
    Copy-Item $bakPath $exePath -Force
    Write-Host "[ROLLBACK] Relancando com o binario antigo..."
    Start-Process -FilePath $exePath -ArgumentList "--continue" -WorkingDirectory $root
    Write-Host "[ROLLBACK] Binario antigo restaurado e relancado. O Sploit volta a abrir." -ForegroundColor Green
    exit 2
}

Write-Host "[FALHA] Nao ha backup (sploit.exe.bak) para rollback. Rode build-sploit.ps1 para regenerar." -ForegroundColor Red
exit 1
