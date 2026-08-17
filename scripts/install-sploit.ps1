# install-sploit.ps1 - Instalador autonomo do Sploit (para qualquer PC).
#
# Copia o sploit.exe para um local estavel e registra no PATH do usuario,
# para que `sploit` funcione em qualquer pasta. Cria a identidade do Sploit
# em ~/.config/sploit/ (AGENTS.md, tui.json, sploit.jsonc) e instala o
# conhecimento coletivo (APRENDIZADO.md) como instruction global - assim todo
# projeto deste PC herda as licoes que o Sploit aprendeu em outras maquinas.
#
# Este instalador NAO precisa do repositorio do Sploit: funciona sozinho,
# basta estar na mesma pasta do sploit.exe (ex.: dentro do pacote de
# distribuicao). Ideal para instalar em PCs de amigos.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File install-sploit.ps1 `
#       [-BinPath <caminho do sploit.exe>] [-CloudflareURL <url> -Senha <s>]
#
# Parametros:
#   -BinPath            Caminho do sploit.exe (padrao: a pasta deste script)
#   -CloudflareURL      URL do Worker do conhecimento coletivo
#                       (ex.: https://sploit-conhecimento.<conta>.workers.dev).
#                       Se informado, o instalador baixa o APRENDIZADO.md da
#                       nuvem (GET publico) e salva a config de sincronizacao
#                       para o diagnostico enviar licoes (POST com X-Senha).
#   -Senha              Senha compartilhada (junto com -CloudflareURL).
#   -RepoConhecimento   [LEGADO] URL do repo git privado (GitHub). Use apenas
#                       se ainda nao migrou para o Cloudflare.
#   -SkipConfig         Nao cria a config global (~/.config/sploit/) se ja existir
#
# Se -CloudflareURL/-Senha nao forem informados, o instalador procura um
# arquivo "conhecimento.txt" na mesma pasta (gerado pelo pack-dist.ps1 dentro
# do pacote de distribuicao). Nesse caso o amigo nao precisa digitar nada.
#
# O Sploit sai funcionando SEM configurar nada: o modelo padrao e o
# "big-pickle", servido pelo servidor gratuito da opencode (OpenCode Zen),
# sem API key - exatamente como o opencode vem instalado. Esse default e
# gravado no sploit.jsonc gerado; para trocar depois, edite o arquivo.

param(
    [string]$BinPath = "",
    [string]$CloudflareURL = "",
    [string]$Senha = "",
    [string]$RepoConhecimento = "",
    [string]$OpenCodeKey = "",
    [switch]$SkipConfig
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

# ---------------------------------------------------------------------------
# Config embutida do conhecimento coletivo: se o pacote trouxer um
# "conhecimento.txt", usa-o automaticamente (o amigo nao digita nada).
# Formato (uma config por linha, "chave=valor"):
#   url=https://sploit-conhecimento.<conta>.workers.dev
#   senha=<senha-compartilhada>
#   modo=cloudflare
# ---------------------------------------------------------------------------
$configArquivo = Join-Path $here "conhecimento.txt"
if (-not $CloudflareURL -and (Test-Path $configArquivo)) {
    $configLinhas = Get-Content $configArquivo -ErrorAction SilentlyContinue
    foreach ($linha in $configLinhas) {
        $partes = $linha -split "=", 2
        if ($partes.Count -eq 2) {
            switch ($partes[0].Trim()) {
                "url"   { if (-not $CloudflareURL) { $CloudflareURL = $partes[1].Trim() } }
                "senha" { if (-not $Senha) { $Senha = $partes[1].Trim() } }
            }
        }
    }
    if ($CloudflareURL) {
        Write-Host "==> Config de conhecimento encontrada no pacote (conhecimento.txt)" -ForegroundColor Cyan
    }
}

if (-not $BinPath) {
    $BinPath = Join-Path $here "sploit.exe"
}
if (-not (Test-Path $BinPath)) {
    Write-Host "[ERRO] sploit.exe nao encontrado em: $BinPath" -ForegroundColor Red
    Write-Host "       Rode o instalador a partir da pasta que contem o sploit.exe,"
    Write-Host "       ou informe o caminho com -BinPath."
    exit 1
}

# O instalador pode rodar com Python ausente; o /diagnostico requer python no PATH.
$hasPython = $false
$oldEA = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$null = python --version 2>$null
$hasPython = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = $oldEA

# ---------------------------------------------------------------------------
# Helper de download. Prefere o curl.exe (confiavel, presente no Windows 10
# 1803+); o Invoke-WebRequest do PS 5.1 da timeout em alguns hosts (TLS).
# ---------------------------------------------------------------------------
function Invoke-Download([string]$Url, [string]$Destino) {
    $curlPath = (Get-Command curl.exe -ErrorAction SilentlyContinue).Source
    if ($curlPath) {
        $oldEA2 = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $httpCode = & $curlPath -sS -o $Destino -w "%{http_code}" $Url 2>$null
        $ErrorActionPreference = $oldEA2
        if ("$httpCode".Trim() -eq "200") { return "ok" }
    }
    $oldEA2 = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $res = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 30
        if ($res.StatusCode -eq 200) {
            $res.Content | Set-Content -Path $Destino -Encoding UTF8
            return "ok"
        }
    } catch {
        return "erro"
    } finally {
        $ErrorActionPreference = $oldEA2
    }
    return "erro"
}

# ---------------------------------------------------------------------------
# 1. Copia o binario para um local estavel fora do repo
# ---------------------------------------------------------------------------
$installDir = Join-Path $env:LOCALAPPDATA "Sploit\bin"
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
$targetExe = Join-Path $installDir "sploit.exe"
$resolvedBin = (Resolve-Path $BinPath).Path
$resolvedTarget = (Resolve-Path $installDir -ErrorAction SilentlyContinue)
if ($resolvedTarget) { $resolvedTarget = Join-Path $resolvedTarget.Path "sploit.exe" }
if ($resolvedBin -ne $resolvedTarget) {
    Copy-Item $BinPath $targetExe -Force
}
Write-Host "[1/3] sploit.exe instalado em $installDir\sploit.exe" -ForegroundColor Green

# ---------------------------------------------------------------------------
# 2. Registra no PATH do usuario (funciona de qualquer pasta)
# ---------------------------------------------------------------------------
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ([string]::IsNullOrEmpty($userPath)) {
    $userPath = ""
}
$pathEntries = $userPath -split ";" | Where-Object { $_ -ne "" }
if ($pathEntries -notcontains $installDir) {
    $newPath = if ($userPath) { "$userPath;$installDir" } else { $installDir }
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    Write-Host "[2/3] PATH do usuario atualizado com $installDir" -ForegroundColor Green
} else {
    Write-Host "[2/3] $installDir ja esta no PATH do usuario" -ForegroundColor Gray
}
if (($env:Path -split ";") -notcontains $installDir) {
    $env:Path = "$env:Path;$installDir"
}

# ---------------------------------------------------------------------------
# 3. Config global (identidade do Sploit) - cria so se nao existir
# ---------------------------------------------------------------------------
$configDir = Join-Path $env:USERPROFILE ".config\sploit"
$aprendizadoPath = ""

if (-not $SkipConfig) {
    New-Item -ItemType Directory -Force -Path $configDir | Out-Null

    $tuiPath = Join-Path $configDir "tui.json"
    if (-not (Test-Path $tuiPath)) {
        @"
{"`$schema": "https://opencode.ai/tui.json", "theme": "sploit"}
"@ | Set-Content -Path $tuiPath -Encoding UTF8
    }

    $globalAgents = Join-Path $configDir "AGENTS.md"
    if (-not (Test-Path $globalAgents)) {
        @'
# AGENTS.md global - Sploit

Instrucoes de identidade que valem em qualquer pasta, independente de haver um `AGENTS.md` de projeto.

## Identidade

- Voce e o **Sploit**, um agente de engenharia de software que roda no terminal. Nao se refira a si mesmo
  como "opencode" - Sploit e seu proprio projeto, derivado do opencode mas com identidade e UX proprias.

## Idioma

- Responda **sempre em portugues brasileiro (PT-BR)**, independente do idioma da pergunta do usuario.
'@ | Set-Content -Path $globalAgents -Encoding UTF8
    }

    # -----------------------------------------------------------------------
    # Conhecimento coletivo:
    #   - Modo cloudflare (padrao novo): baixa APRENDIZADO.md da nuvem e
    #     salva a config de sync (url+senha) para o diagnostico subir licoes.
    #   - Modo git (legado): clona o repo privado.
    #   - Senao: usa o APRENDIZADO.md que vier no pacote.
    # -----------------------------------------------------------------------
    $conhecDir = Join-Path $configDir "conhecimento"
    if ($CloudflareURL) {
        Write-Host "==> Conectando conhecimento coletivo (Cloudflare): $CloudflareURL" -ForegroundColor Cyan
        $cfUrl = $CloudflareURL.TrimEnd("/")
        # Salva a config de sync para o diagnostico.py usar no push de licoes
        $cfConfig = Join-Path $configDir "conhecimento.json"
        @{ url = $cfUrl; senha = $Senha; modo = "cloudflare" } |
            ConvertTo-Json | Set-Content -Path $cfConfig -Encoding UTF8

        New-Item -ItemType Directory -Force -Path $conhecDir | Out-Null
        $aprendizadoPath = Join-Path $conhecDir "APRENDIZADO.md"
        $result = Invoke-Download "$cfUrl/aprendizado.md" $aprendizadoPath
        if ($result -eq "ok") {
            Write-Host "==> Conhecimento coletivo baixado da nuvem." -ForegroundColor Green
        } else {
            Write-Host "[AVISO] Nao consegui baixar da nuvem agora (rede)." -ForegroundColor Yellow
            Write-Host "        O conhecimento sera baixado na primeira sincronizacao." -ForegroundColor Yellow
        }
    } elseif ($RepoConhecimento) {
        Write-Host "==> Conectando conhecimento coletivo em $RepoConhecimento (git)" -ForegroundColor Cyan
        if (-not (Test-Path $conhecDir)) {
            $oldEA = $ErrorActionPreference
            $ErrorActionPreference = "Continue"
            $clone = & git clone $RepoConhecimento $conhecDir 2>&1
            $cloneCode = $LASTEXITCODE
            $ErrorActionPreference = $oldEA
            if ($cloneCode -ne 0) {
                Write-Host "[ERRO] Nao foi possivel clonar o repo de conhecimento:" -ForegroundColor Red
                $clone | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
                Write-Host "       O GitHub pede login 1x pelo navegador (Git Credential Manager)."
                exit 1
            }
            Write-Host "==> Repo de conhecimento clonado em $conhecDir" -ForegroundColor Green
        } else {
            Write-Host "==> Repo de conhecimento ja existe em $conhecDir (pulando clone)" -ForegroundColor Gray
        }
        $aprendizadoPath = Join-Path $conhecDir "APRENDIZADO.md"
        if (-not (Test-Path $aprendizadoPath)) {
            Write-Host "[AVISO] APRENDIZADO.md nao encontrado no repo de conhecimento." -ForegroundColor Yellow
        }
    } else {
        $aprendizadoPkg = Join-Path $here "APRENDIZADO.md"
        if (Test-Path $aprendizadoPkg) {
            $aprendizadoPath = Join-Path $configDir "APRENDIZADO.md"
            Copy-Item $aprendizadoPkg $aprendizadoPath -Force
            Write-Host "     Conhecimento coletivo (APRENDIZADO.md) instalado do pacote." -ForegroundColor Cyan
        }
    }

    # -----------------------------------------------------------------------
    # sploit.jsonc global: instructions com CAMINHO ABSOLUTO (caminhos
    # relativos resolvem a partir do projeto e nao acham a config global).
    # -----------------------------------------------------------------------
    $sploitJsonc = Join-Path $configDir "sploit.jsonc"
    $config = @{}
    if (Test-Path $sploitJsonc) {
        try {
            $config = Get-Content $sploitJsonc -Raw -Encoding UTF8 | ConvertFrom-Json
        } catch {
            $config = @{}
        }
    }
    $instructions = @()
    if ($config.instructions) {
        $instructions = @($config.instructions | Where-Object { $_ })
    }
    if ($aprendizadoPath) {
        $abs = [System.IO.Path]::GetFullPath($aprendizadoPath)
        if ($instructions -notcontains $abs) {
            $instructions += $abs
        }
    }
    $config | Add-Member -NotePropertyName instructions -NotePropertyValue $instructions -Force
    if (-not $config.'$schema') {
        $config | Add-Member -NotePropertyName '$schema' -NotePropertyValue "https://opencode.ai/sploit.json" -Force
    }
    # Modelo padrao "out of the box": big-pickle via OpenCode Zen (servidor da
    # opencode, gratuito, SEM API key). Gravado explicito no sploit.jsonc para
    # garantir o mesmo comportamento em qualquer PC, independente de mudancas
    # no catalogo de modelos. Quando o dono tiver a propria IA, e so editar
    # este arquivo (ou este bloco) e apontar para o provider/modelo proprio.
    $modeloPadrao = "opencode/big-pickle"
    if (-not $config.agent) {
        $config | Add-Member -NotePropertyName agent -NotePropertyValue ([pscustomobject]@{}) -Force
    }
    $agent = $config.agent
    if (-not $agent.plan)  { $agent | Add-Member -NotePropertyName plan  -NotePropertyValue ([pscustomobject]@{}) -Force }
    if (-not $agent.build) { $agent | Add-Member -NotePropertyName build -NotePropertyValue ([pscustomobject]@{}) -Force }
    if (-not $agent.plan.model)  { $agent.plan  | Add-Member -NotePropertyName model  -NotePropertyValue $modeloPadrao -Force }
    if (-not $agent.build.model) { $agent.build | Add-Member -NotePropertyName model  -NotePropertyValue $modeloPadrao -Force }
    if (-not $config.small_model) { $config | Add-Member -NotePropertyName small_model -NotePropertyValue $modeloPadrao -Force }
    $config | ConvertTo-Json -Depth 8 | Set-Content -Path $sploitJsonc -Encoding UTF8

    Write-Host "[3/3] Config global do Sploit criada em $configDir" -ForegroundColor Green

    # -----------------------------------------------------------------------
    # 3b. Auth da opencode: se o amigo tem uma API key, grava auth.json
    #     para usar cota propria em vez da chave "public" compartilhada.
    #     Tambem le de arquivo "opencode-key.txt" no pacote (padrao
    #     conhecimento.txt pattern) ou env var SPLOIT_OPENCODE_KEY.
    # -----------------------------------------------------------------------
    if (-not $OpenCodeKey) { $OpenCodeKey = $env:SPLOIT_OPENCODE_KEY }
    if (-not $OpenCodeKey) {
        $keyFile = Join-Path $here "opencode-key.txt"
        if (Test-Path $keyFile) {
            $OpenCodeKey = (Get-Content $keyFile -ErrorAction SilentlyContinue | Where-Object { $_.Trim() -ne "" } | Select-Object -First 1).Trim()
            if ($OpenCodeKey) {
                Write-Host "==> Chave opencode encontrada no pacote (opencode-key.txt)" -ForegroundColor Cyan
            }
        }
    }
    if ($OpenCodeKey) {
        $authDir = Join-Path $env:LOCALAPPDATA "sploit"
        New-Item -ItemType Directory -Force -Path $authDir | Out-Null
        $authPath = Join-Path $authDir "auth.json"
        # Merge: preserva auth existente de outros providers
        $auth = @{}
        if (Test-Path $authPath) {
            try {
                $existing = Get-Content $authPath -Raw -Encoding UTF8 | ConvertFrom-Json
                foreach ($prop in $existing.PSObject.Properties) {
                    $auth[$prop.Name] = $prop.Value
                }
            } catch {}
        }
        $auth["opencode"] = @{ type = "api"; key = $OpenCodeKey }
        $auth | ConvertTo-Json -Depth 4 | Set-Content -Path $authPath -Encoding UTF8
        Write-Host "     Auth opencode configurada (cota propria, sem rate limit)." -ForegroundColor Green
    } else {
        Write-Host "     Sem API key: usando chave publica (cota compartilhada)." -ForegroundColor Yellow
        Write-Host "     Para melhor performance, rode: sploit auth login" -ForegroundColor Yellow
    }

    # -----------------------------------------------------------------------
    # 4. /diagnostico global: script auxiliar + comando markdown.
    #    Sem isso o usuario deste PC nao tem como gerar/subir licoes proprias.
    # -----------------------------------------------------------------------
    $pkgDiag = Join-Path $here "diagnostico.py"
    if (Test-Path $pkgDiag) {
        if (-not $hasPython) {
            Write-Host "[AVISO] Python nao encontrado no PATH. /diagnostico sera instalado," -ForegroundColor Yellow
            Write-Host "        mas precisa de Python para rodar (https://python.org)." -ForegroundColor Yellow
        }
        $scriptsDir = Join-Path $installDir "..\scripts"
        $scriptsDir = [System.IO.Path]::GetFullPath($scriptsDir)
        New-Item -ItemType Directory -Force -Path $scriptsDir | Out-Null
        Copy-Item $pkgDiag (Join-Path $scriptsDir "diagnostico.py") -Force

        $cmdDir = Join-Path $configDir "command"
        New-Item -ItemType Directory -Force -Path $cmdDir | Out-Null
        $cmdPath = Join-Path $cmdDir "diagnostico.md"
        if (-not (Test-Path $cmdPath)) {
            $diagPy = (Join-Path $scriptsDir "diagnostico.py") -replace "\\", "/"
            @"
---
description: Diagnostico do harness do Sploit (falhas de ferramenta, turnos caros, licoes)
---

Reporte o diagnostico do harness do Sploit em PT-BR:

1. Rode `python "$diagPy"` para coletar os dados do banco local.
2. Apresente ao usuario um resumo em PT-BR, destacando:
   - **Falhas de ferramenta**: quais falharam, quantas vezes, arquivos envolvidos.
   - **Turnos mais caros**: o que o turno fez (tools usadas) que custou tanto contexto.
   - **Licoes coletivas**: se novas licoes foram gravadas e enviadas para o repo coletivo.
3. Fechamento: aponte UMA acao concreta mais valiosa para o harness.
"@ | Set-Content -Path $cmdPath -Encoding UTF8
        }
        Write-Host "[4/4] /diagnostico instalado (script + comando global)" -ForegroundColor Green
    }
} else {
    Write-Host "[3/3] Config global mantida (nada a criar)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Instalacao concluida." -ForegroundColor Green
Write-Host ""
Write-Host "Agora:"
Write-Host "  1. Feche e abra um terminal novo (para o PATH valer)."
Write-Host "  2. Va ate a pasta de um projeto e rode: sploit"
Write-Host "  3. Pronto: ja abre usando o big-pickle (servidor gratuito da opencode,"
Write-Host "     sem API key). Se a cota gratuita acabar, troque para o plano pago"
Write-Host "     da opencode (sploit auth login) ou edite o sploit.jsonc."
Write-Host ""
if ($CloudflareURL) {
    Write-Host "Conhecimento coletivo ativo (Cloudflare)! As licoes dos outros PCs"
    Write-Host "chegam sozinhas e as suas saem sozinhas."
    Write-Host "Para sincronizar agora:"
    Write-Host "  powershell -ExecutionPolicy Bypass -File `"$here\sync-conhecimento.ps1`" -URL `"$($CloudflareURL.TrimEnd('/'))`" -Senha `"$Senha`" -Action pull"
} elseif ($RepoConhecimento) {
    Write-Host "Conhecimento coletivo ativo! As licoes dos outros PCs chegam"
    Write-Host "sozinhas e as suas saem sozinhas (via repo git privado)."
    Write-Host "Para sincronizar agora:"
    Write-Host "  powershell -ExecutionPolicy Bypass -File `"$here\sync-conhecimento.ps1`" -Repo `"$RepoConhecimento`" -Action pull"
} else {
    Write-Host "Para ativar o conhecimento coletivo (compartilhar licoes entre PCs):"
    Write-Host "  Rode o instalador de novo informando a URL do Cloudflare:"
    Write-Host "  powershell -ExecutionPolicy Bypass -File `"$here\install-sploit.ps1`" -CloudflareURL <url-do-worker> -Senha <senha>"
}
Write-Host ""
Write-Host "Dica: no arquivo $configDir\AGENTS.md voce pode adicionar"
Write-Host "instrucoes globais que valem para qualquer pasta deste PC."
