
# scripts/propose-squad-agents.ps1
# Este script analisa a estrutura do projeto e propõe agentes para o modo squad.

Write-Host "Analisando a estrutura do projeto para propor agentes..."

$packagesPath = "sploit-src/packages/"
$packageDirs = Get-ChildItem -Path $packagesPath -Directory | Select-Object -ExpandProperty Name

$proposedAgents = @()

# Lógica para mapear pacotes para tipos de agentes
# Exemplo inicial:
if ($packageDirs -contains "ui" -or $packageDirs -contains "web" -or $packageDirs -contains "tui") {
    $proposedAgents += @{
        Name = "AgenteFrontend"
        Description = "Desenvolve e mantém interfaces de usuário (UI, Web, TUI)."
        FocusAreas = @(
            ($packageDirs -contains "ui" ? "sploit-src/packages/ui" : $null),
            ($packageDirs -contains "web" ? "sploit-src/packages/web" : $null),
            ($packageDirs -contains "tui" ? "sploit-src/packages/tui" : $null),
            ($packageDirs -contains "app" ? "sploit-src/packages/app" : $null),
            ($packageDirs -contains "client" ? "sploit-src/packages/client" : $null),
            ($packageDirs -contains "desktop" ? "sploit-src/packages/desktop" : $null),
            ($packageDirs -contains "session-ui" ? "sploit-src/packages/session-ui" : $null),
            ($packageDirs -contains "storybook" ? "sploit-src/packages/storybook" : $null)
        ) | Where-Object { $_ }

    }
}

if ($packageDirs -contains "server" -or $packageDirs -contains "httpapi-codegen") {
    $proposedAgents += @{
        Name = "AgenteBackend"
        Description = "Responsável pela lógica de negócios, APIs e serviços de servidor."
        FocusAreas = @(
            ($packageDirs -contains "server" ? "sploit-src/packages/server" : $null),
            ($packageDirs -contains "httpapi-codegen" ? "sploit-src/packages/httpapi-codegen" : $null)
        ) | Where-Object { $_ }

    }
}

if ($packageDirs -contains "core" -or $packageDirs -contains "protocol" -or $packageDirs -contains "schema" -or $packageDirs -contains "sdk" -or $packageDirs -contains "cli" -or $packageDirs -contains "llm") {
    $proposedAgents += @{
        Name = "AgenteCore"
        Description = "Componentes fundamentais, protocolos, SDKs, CLI e LLM."
        FocusAreas = @(
            (if ($packageDirs -contains "core") {"sploit-src/packages/core"} else { $null }),
            (if ($packageDirs -contains "protocol") {"sploit-src/packages/protocol"} else { $null }),
            (if ($packageDirs -contains "schema") {"sploit-src/packages/schema"} else { $null }),
            (if ($packageDirs -contains "sdk") {"sploit-src/packages/sdk"} else { $null }),
            (if ($packageDirs -contains "sdk-next") {"sploit-src/packages/sdk-next"} else { $null }),
            (if ($packageDirs -contains "cli") {"sploit-src/packages/cli"} else { $null }),
            (if ($packageDirs -contains "llm") {"sploit-src/packages/llm"} else { $null })
        ) | Where-Object { $_ -ne $null }
    }
}

if ($packageDirs -contains "docs") {
    $proposedAgents += @{
        Name = "AgenteDocs"
        Description = "Geração e manutenção da documentação do projeto."
        FocusAreas = @("sploit-src/packages/docs")
    }
}

# Saída formatada para o usuário
Write-Host "`nProposta de Agentes para o Squad:`n"

foreach ($agent in $proposedAgents) {
    Write-Host "  Nome: $($agent.Name)"
    Write-Host "  Descrição: $($agent.Description)"
    Write-Host "  Áreas de Foco: $($agent.FocusAreas -join ', ')"
    Write-Host ""
}

# Retorna os dados como JSON para que o Sploit possa processar (em uma etapa futura)
# ConvertTo-Json $proposedAgents -Compress
