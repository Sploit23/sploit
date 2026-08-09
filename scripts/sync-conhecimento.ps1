# sync-conhecimento.ps1 - Sincroniza o conhecimento coletivo (APRENDIZADO.md)
# entre os PCs.
#
# Dois modos:
#   -Mode cloudflare (padrao): o conhecimento mora num Worker do Cloudflare com
#       KV persistente. Baixar = GET /aprendizado.md (sem senha). Enviar = POST
#       com header X-Senha. Nenhum login, nenhum git, nenhum prompt.
#   -Mode git: o conhecimento mora num repo git privado (GitHub). Clona/pull/push.
#
# Uso (cloudflare):
#   powershell -ExecutionPolicy Bypass -File sync-conhecimento.ps1 -URL https://...workers.dev -Senha <s> -Action pull
#   powershell -ExecutionPolicy Bypass -File sync-conhecimento.ps1 -URL https://...workers.dev -Senha <s> -Action push
#
# Uso (git):
#   powershell -ExecutionPolicy Bypass -File sync-conhecimento.ps1 -Mode git -Repo <url> -Action pull
#
# Acoes:
#   pull   - recebe as licoes dos outros PCs (diario no PC do amigo)
#   push   - envia o APRENDIZADO.md local (chamado pelo diagnostico ao gravar licao)
#   status - mostra o estado local
#
# Parametros:
#   -URL     URL do Worker (cloudflare): https://sploit-conhecimento.<conta>.workers.dev
#   -Senha   Senha compartilhada (cloudflare; usada apenas em push)
#   -Mode    cloudflare (padrao) | git
#   -Repo    URL do repo git (somente no modo git)
#   -Dir     Diretorio local do conhecimento (padrao: ~/.config/sploit/conhecimento)
#   -Action  pull | push | status

param(
    [string]$URL = "",
    [string]$Senha = "",
    [ValidateSet("cloudflare", "git")]
    [string]$Mode = "cloudflare",
    [string]$Repo = "",
    [string]$Dir = "",
    [ValidateSet("pull", "push", "status")]
    [string]$Action = ""
)

$ErrorActionPreference = "Stop"
$configDir = Join-Path $env:USERPROFILE ".config\sploit"
if (-not $Dir) {
    $Dir = Join-Path $configDir "conhecimento"
}
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
$arquivo = Join-Path $Dir "APRENDIZADO.md"

if (-not $Action) { $Action = "status" }

# ---------------------------------------------------------------------------
# Modo Cloudflare (HTTP — sem git, sem login)
# ---------------------------------------------------------------------------
if ($Mode -eq "cloudflare") {
    if (-not $URL) {
        Write-Host "[ERRO] No modo cloudflare, informe -URL (ex.: https://sploit-conhecimento.algo.workers.dev)" -ForegroundColor Red
        exit 1
    }
    $urlBase = $URL.TrimEnd("/")

    switch ($Action) {
        "pull" {
            Write-Host "==> Baixando conhecimento de $urlBase ..." -ForegroundColor Yellow
            $curlPath = (Get-Command curl.exe -ErrorAction SilentlyContinue).Source
            $ok = $false
            if ($curlPath) {
                $oldEA = $ErrorActionPreference
                $ErrorActionPreference = "Continue"
                $httpCode = & $curlPath -sS -o $arquivo -w "%{http_code}" "$urlBase/aprendizado.md" 2>$null
                $ErrorActionPreference = $oldEA
                if ("$httpCode".Trim() -eq "200") { $ok = $true }
            }
            if (-not $ok) {
                try {
                    $res = Invoke-WebRequest -Uri "$urlBase/aprendizado.md" -UseBasicParsing -TimeoutSec 30
                    if ($res.StatusCode -eq 200) {
                        $res.Content | Set-Content -Path $arquivo -Encoding UTF8
                        $ok = $true
                    }
                } catch {
                    $ok = $false
                }
            }
            if ($ok) {
                $tam = (Get-Item $arquivo).Length
                Write-Host "==> Conhecimento atualizado ($tam bytes)." -ForegroundColor Green
            } else {
                Write-Host "[AVISO] Falha ao baixar (rede?). Mantendo a versao local." -ForegroundColor Yellow
            }
        }
        "push" {
            if (-not $Senha) {
                Write-Host "[ERRO] No modo cloudflare, push precisa de -Senha." -ForegroundColor Red
                exit 1
            }
            if (-not (Test-Path $arquivo)) {
                Write-Host "==> APRENDIZADO.md local nao existe; nada para enviar." -ForegroundColor Gray
                return
            }
            Write-Host "==> Enviando conhecimento para $urlBase ..." -ForegroundColor Yellow
            $conteudo = Get-Content $arquivo -Raw -Encoding UTF8
            $curlPath = (Get-Command curl.exe -ErrorAction SilentlyContinue).Source
            $ok = $false
            if ($curlPath) {
                $oldEA = $ErrorActionPreference
                $ErrorActionPreference = "Continue"
                $httpCode = & $curlPath -sS -X POST -o NUL -H "X-Senha: $Senha" --data-binary "@$arquivo" -w "%{http_code}" "$urlBase/aprendizado.md" 2>$null
                $ErrorActionPreference = $oldEA
                if ("$httpCode".Trim() -eq "200") { $ok = $true }
            }
            if (-not $ok) {
                try {
                    $res = Invoke-WebRequest -Uri "$urlBase/aprendizado.md" -Method Post -Body $conteudo -Headers @{ "X-Senha" = $Senha } -UseBasicParsing -TimeoutSec 30
                    if ($res.StatusCode -eq 200) { $ok = $true }
                } catch {
                    $ok = $false
                }
            }
            if ($ok) {
                Write-Host "==> Conhecimento enviado para a nuvem." -ForegroundColor Green
            } else {
                Write-Host "[AVISO] Push falhou. As licoes ficam locais ate o proximo sync." -ForegroundColor Yellow
            }
        }
        "status" {
            Write-Host "==> Conhecimento local em $arquivo" -ForegroundColor Green
            if (Test-Path $arquivo) {
                $tam = (Get-Item $arquivo).Length
                Write-Host "    Arquivo local: $tam bytes"
            } else {
                Write-Host "    Arquivo local: (nao existe ainda)"
            }
            Write-Host "    Para baixar:  sync-conhecimento.ps1 -URL <url> -Action pull"
            Write-Host "    Para enviar:  sync-conhecimento.ps1 -URL <url> -Senha <s> -Action push"
        }
    }
    exit 0
}

# ---------------------------------------------------------------------------
# Modo Git (repo privado — para quem preferir GitHub)
# ---------------------------------------------------------------------------
function Invoke-Git([string]$gitArgs) {
    $oldEA = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $out = & git $gitArgs 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = $oldEA
    return @{ Code = $code; Output = $out }
}

$null = Get-Command git -ErrorAction SilentlyContinue
if (-not $?) {
    Write-Host "[ERRO] git nao encontrado. Instale o Git for Windows: https://git-scm.com" -ForegroundColor Red
    exit 1
}
if (-not $Repo) {
    Write-Host "[ERRO] No modo git, informe -Repo (URL do repo privado)." -ForegroundColor Red
    exit 1
}

switch ($Action) {
    "pull" {
        if (-not (Test-Path (Join-Path $Dir ".git"))) {
            Write-Host "==> Clonando repo de conhecimento..." -ForegroundColor Yellow
            $r = Invoke-Git "clone $Repo `"$Dir`""
            if ($r.Code -ne 0) {
                Write-Host "[ERRO] Falha ao clonar:" -ForegroundColor Red
                $r.Output | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
                return
            }
            Write-Host "==> Clonado para $Dir" -ForegroundColor Green
            return
        }
        $r = Invoke-Git "-C `"$Dir`" pull --ff-only"
        if ($r.Code -ne 0) {
            Write-Host "[AVISO] Pull falhou:" -ForegroundColor Yellow
            $r.Output | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
        } else {
            Write-Host "==> Licoes atualizadas." -ForegroundColor Green
        }
    }
    "push" {
        if (-not (Test-Path (Join-Path $Dir ".git"))) {
            Write-Host "[ERRO] Repo nao clonado. Rode -Action pull primeiro." -ForegroundColor Red
            return
        }
        $r = Invoke-Git "-C `"$Dir`" add -A"
        if ($r.Code -eq 0) {
            $r = Invoke-Git "-C `"$Dir`" commit -m `"aprendizado: novas licoes coletivas`""
            if ($r.Code -eq 0) {
                $r = Invoke-Git "-C `"$Dir`" push"
                if ($r.Code -eq 0) {
                    Write-Host "==> Licoes enviadas para o repo coletivo." -ForegroundColor Green
                } else {
                    Write-Host "[ERRO] Push falhou:" -ForegroundColor Red
                    $r.Output | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
                }
            } else {
                Write-Host "[AVISO] Commit vazio ou falhou:" -ForegroundColor Yellow
                $r.Output | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
            }
        }
    }
    "status" {
        if (Test-Path (Join-Path $Dir ".git")) {
            $r = Invoke-Git "-C `"$Dir`" status -sb"
            $r.Output | ForEach-Object { Write-Host "  $_" }
        } else {
            Write-Host "    Repo ainda nao clonado. Rode -Action pull."
        }
        Write-Host "==> Conhecimento local em $Dir" -ForegroundColor Green
    }
}
