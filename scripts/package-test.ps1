# package-test.ps1 — Empacota o Sploit pra teste em outra máquina.
#
# O pacote sai com big-pickle como modelo padrão (free tier da opencode.ai) e
# sem dependências do caminho da SUA máquina: plugins, MCP e venv não viajam
# (os paths em sploit.json apontavam pra C:\Users\Hp\...).
#
# Uso:
#   .\scripts\package-test.ps1               # pacote sem chaves (recomendado)
#   .\scripts\package-test.ps1 -IncludeKeys  # inclui a chave opencode (plug-and-play)
#   .\scripts\package-test.ps1 -Out C:\Temp\pacote
#
# O que sai dentro da pasta:
#   sploit.exe     binário
#   sploit.json    config de teste (plan/build = opencode/big-pickle)
#   INSTALAR.md    passo-a-passo pro outro PC
#   setup.bat      instala a chave (se incluída) e aponta como rodar
#   auth.json      só com -IncludeKeys (apenas o provider opencode)
#
# Notas:
#   - big-pickle funciona SEM chave (free tier é por IP, janela curta). A chave
#     opencode não muda isso — o limite é do IP, não da chave.
#   - -IncludeKeys compartilha a sua chave opencode com quem for testar.

param(
    [switch]$IncludeKeys,
    [string]$Out = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$exe = "$root\sploit.exe"
$utf8 = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path -LiteralPath $exe)) {
    Write-Host "[FALHA] sploit.exe nao encontrado. Rode scripts\build-sploit.ps1 primeiro." -ForegroundColor Red
    exit 1
}

if (-not $Out) { $Out = Join-Path $root "sploit-teste" }
New-Item -ItemType Directory -Force -Path $Out | Out-Null

# ---------------------------------------------------------------------------
# sploit.json de teste (big-pickle padrão, sem paths da máquina)
# ---------------------------------------------------------------------------
$config = @{
    '$schema'    = "https://opencode.ai/config.json"
    small_model  = "opencode/gpt-5-nano"
    permission   = @{
        edit = "allow"; read = "allow"; glob = "allow"; grep = "allow"; list = "allow"
        webfetch = "allow"; websearch = "allow"; skill = "allow"; task = "allow"
        bash = @{ '*' = "allow" }; external_directory = @{ '*' = "allow" }
    }
    agent        = @{
        plan  = @{ model = "opencode/big-pickle" }
        build = @{ model = "opencode/big-pickle" }
    }
}
[System.IO.File]::WriteAllText(
    (Join-Path $Out "sploit.json"),
    ($config | ConvertTo-Json -Depth 6),
    $utf8
)

# ---------------------------------------------------------------------------
# binário
# ---------------------------------------------------------------------------
Copy-Item -LiteralPath $exe -Destination (Join-Path $Out "sploit.exe") -Force

# ---------------------------------------------------------------------------
# auth.json (opcional — só a chave opencode)
# ---------------------------------------------------------------------------
$authIncluded = $false
if ($IncludeKeys) {
    $authFile = "$env:USERPROFILE\.local\share\sploit\auth.json"
    if (Test-Path -LiteralPath $authFile) {
        $auth = Get-Content -LiteralPath $authFile -Raw | ConvertFrom-Json
        if ($auth.opencode.key) {
            $authOut = @{ opencode = @{ type = "api"; key = $auth.opencode.key } }
            [System.IO.File]::WriteAllText(
                (Join-Path $Out "auth.json"),
                ($authOut | ConvertTo-Json -Depth 4),
                $utf8
            )
            $authIncluded = $true
        }
    }
    if (-not $authIncluded) {
        Write-Host "[AVISO] auth.json nao encontrado; pacote sem chave." -ForegroundColor Yellow
    }
}

# ---------------------------------------------------------------------------
# setup.bat
# ---------------------------------------------------------------------------
$bat = @'
@echo off
chcp 65001 >nul
echo.
echo === Sploit - instalacao rapida ===
echo.
set "DEST=%USERPROFILE%\.local\share\sploit"
if exist "auth.json" (
  if not exist "%DEST%" mkdir "%DEST%"
  copy /y "auth.json" "%DEST%\auth.json" >nul
  echo Chave instalada em %DEST%.
)
echo.
echo Para testar: abra um terminal NESTA pasta e rode  sploit.exe
echo (ou de dois cliques em sploit.exe).
echo.
pause
'@
[System.IO.File]::WriteAllText((Join-Path $Out "setup.bat"), $bat, (New-Object System.Text.ASCIIEncoding))

# ---------------------------------------------------------------------------
# INSTALAR.md
# ---------------------------------------------------------------------------
$keyLine = if ($authIncluded) {
    "- Este pacote JÁ inclui uma chave opencode. Ela nao e obrigatoria (o limite do big-pickle e por IP), mas o `auth.json` ja fica instalado pelo setup.bat."
} else {
    "- Este pacote NAO inclui chave. O big-pickle funciona sem chave (free tier por IP)."
}
$md = @"
# Sploit - Teste rapido

## O que e
O Sploit e um agente de IA no terminal (build MIT, codigo aberto). Este pacote
e um binario pronto para testar, sem depender de nada da maquina de origem.

## Como rodar
1. Extraia esta pasta em qualquer lugar do PC.
2. (Opcional) Duplo clique em setup.bat - instala a chave se o pacote tiver.
3. Abra um terminal NESTA pasta e rode:
   sploit.exe
   (ou de dois cliques em sploit.exe)
4. O modelo padrao ja e o big-pickle.

## Sobre o big-pickle (importante)
- E um modelo gratuito da opencode.ai com limite POR IP e janela muito curta.
  Se aparecer "Free limit reached", aguarde ou troque de rede - nao e erro de
  instalacao.
$keyLine

## Trocar para outro modelo (opcional)
- Google Gemini (gratis, 1M de contexto): crie uma chave em
  https://aistudio.google.com/apikey e rode:
      sploit auth login
  escolha google e cole a chave. Depois edite o sploit.json desta pasta:
      "agent": { "plan": { "model": "google/gemini-2.5-flash" },
                 "build": { "model": "google/gemini-2.5-flash" } }

## O que NAO esta no pacote
- Plugins (superpowers) e MCP (graphify) foram removidos - apontavam para
  caminhos da maquina de origem.
- Sessões/dados locais do Sploit da maquina de origem.
"@
[System.IO.File]::WriteAllText((Join-Path $Out "INSTALAR.md"), $md, $utf8)

Write-Host ""
Write-Host "[OK] Pacote criado em: $Out" -ForegroundColor Green
Write-Host "     sploit.exe + sploit.json + INSTALAR.md + setup.bat" + $(if ($authIncluded) { " + auth.json" } else { "" })
Write-Host "     Envie a pasta inteira (zip) para quem vai testar."
