# Sploit

> Agente de IA para terminal, 100% local, com identidade própria.

```
  ▀^██▀ ▀^██▀ ▄      ▀^██▀ ▀^██▀ ▀^██▀
  █     █   █ █      █   █   █     █
  █████ █████ █      █   █   █     █
      █ █     █      █   █   █     █
  ▄███▄ ▀     ▄███▄  ▄███▄ ▄███▄   ▀
  ~~~~~ ~     ~~~~~  ~~~~~ ~~~~~   ~
```

O **Sploit** é um assistente de engenharia de software que roda direto no terminal. Ele abre em qualquer pasta e já inicia uma interface interativa (TUI) com tema próprio, respostas em português e memória de conhecimento local do projeto.

## Destaques

- **Interface própria**: TUI com logo/banner "SPLOIT", tema dark com a paleta do logo e dicas em PT-BR.
- **Identidade do agente**: o agente se apresenta como Sploit, com respostas em português brasileiro.
- **100% local**: o código e a memória de conhecimento ficam na sua máquina.
- **Memória de conhecimento (Graphify)**: o Sploit indexa o projeto em um grafo local e consulta antes de vasculhar o código, agilizando tarefas em bases grandes.
- **Skills poderosas**: pacote de skills "superpowers" para tarefas complexas + MCP do context7 para consultar bibliotecas reais.
- **Permissões liberadas por padrão**: roda comandos e edita arquivos sem pedir confirmação a cada ação.

## Uso

```bat
sploit
```

Abra o terminal em qualquer pasta e digite `sploit`. Sem argumentos, inicia a TUI. Também aceita subcomandos no estilo CLI:

```bat
sploit run "corrija os testes quebrados"
sploit --continue
sploit models
sploit auth login
```

## Estrutura

- `sploit-src/` — motor do Sploit (TypeScript/Bun, monorepo).
- `sploit.exe` — binário compilado (build; não versionado).
- `sploit.json` — config do projeto (MCP do Graphify).
- `scripts/build-sploit.ps1` — recompila `sploit.exe` a partir do `sploit-src/`.
- `scripts/install-sploit.ps1` — builda (opcional) e registra `sploit.exe` no PATH do usuário.
- `venv/` — ambiente Python do Graphify (não versionado).
- `graphify-out/` — grafo de conhecimento do projeto (não versionado).

## Instalação (uso do dia a dia)

Requisitos: [Bun](https://bun.sh) (via `npm install -g bun`).

```powershell
.\scripts\install-sploit.ps1
```

Compila o binário, copia pra `%LOCALAPPDATA%\Sploit\bin\sploit.exe` e adiciona essa pasta ao PATH do seu
usuário. Depois disso, abra um terminal novo e `sploit` funciona em qualquer pasta — não precisa mais rodar
nada de dentro deste repo.

Se `sploit.exe` já existe na raiz (build recente) e você só quer instalar sem recompilar:

```powershell
.\scripts\install-sploit.ps1 -SkipBuild
```

## Desenvolvimento (mexendo em `sploit-src/`)

Depois de alterar o código-fonte, recompile com:

```powershell
.\scripts\build-sploit.ps1
```

O script compila o binário para a plataforma atual e o copia para `sploit.exe` na raiz. Rode
`install-sploit.ps1 -SkipBuild` de novo pra atualizar a versão que está no PATH.

## Memória de conhecimento (Graphify)

O Sploit mantém um grafo local do código do projeto para consultas rápidas de contexto.

```bat
venv\Scripts\pip install graphifyy mcp
```

Para gerar ou reindexar o grafo: `/graphify .` dentro da TUI, ou `venv\Scripts\graphify.exe update <caminho>`.

## Tecnologias

TypeScript · Bun · Ink (TUI) · Graphify · MCP
