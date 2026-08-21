# AGENTS.md — Sploit

Guia para agentes de IA que trabalham neste repositório (o **Sploit**).

## Estrutura

- `sploit-src/` — motor do Sploit (TypeScript/Bun, monorepo). Todo o código vive aqui.
- `sploit.exe` — binário compilado (build; não commitar). Gerado por `scripts/build-sploit.ps1`.
- `sploit.json` — config do projeto (MCP do Graphify + instructions).
- `SPLOIT_STATE.md` — memória viva de auto-melhoria (lida em toda sessão).
- `APRENDIZADO.md` — memória coletiva de lições (lida em toda sessão; viaja no git
  para todas as instâncias do Sploit). Alimentada AUTOMATICAMENTE pelo diagnóstico,
  sem comando do usuário.
- `DECISOES.md` — memória de decisões de arquitetura (o porquê). Consultar antes
  de decisões relevantes; registrar com `/decisao`.
- `NOTAS.md` — memória temporal de trabalho (o quê/histórico por sessão). Registrada
  AUTOMATICAMENTE pelo Sploit ao concluir tarefas (nota de evolução, reforço positivo);
  indexada no Graphify para retomar contexto por referência. `/resumo` é legado.
- `SQUAD.md` — blueprint do **modo squad** (agentes persistentes por área com
  nome, memória própria e quadro de conversa). A skill global `squad`
  (`~/.config/sploit/skills/squad/SKILL.md`) define o fluxo de criação e
  orquestração; a CLI de apoio é `scripts/squad.py`.
- `venv/` — ambiente Python usado pelo Graphify (não commitar).
- `scripts/sploit-web.ps1` — servidor web do Sploit acessível pela rede local
  (celular), com senha em `sploit-web.secret` (gitignored). Subir com
  `.\scripts\sploit-web.ps1`; encerrar com `-Stop`.

## Auto-melhoria (protocolo obrigatório)

- **Auto-melhoria é invisível ao usuário**: nunca pedir comando slash para o usuário
  aprovar lições — quando uma falha de disciplina ocorre e a lição já está no harness,
  o diagnóstico grava automaticamente em `APRENDIZADO.md`. Se uma melhoria de motor
  for descoberta, pergunte em linguagem natural ("posso aplicar?") em vez de exigir
  `/melhorar`. Slash fica para intenção do usuário (ex.: `/status`, `/ajuda`).
- **Início de sessão**: leia `SPLOIT_STATE.md`. Se houver `# Próximo passo`, continue de lá — não recomece do zero.
- **Conclusão de passo**: atualize `SPLOIT_STATE.md` (Progresso + Próximo passo) **antes** de encerrar/reiniciar. Nunca terminar uma sessão com o estado desatualizado.
- **Nota de evolução (Constituição, art. 4)**: ao concluir uma tarefa, registre em `NOTAS.md` *"como raciocinei e o que valeu a pena"* — reforço positivo, sem pedir comando do usuário (nunca `/resumo`; é legado). O objetivo é formar o estilo de raciocínio próprio do Sploit.
- **Decisões**: antes de decisões relevantes, consulte `DECISOES.md`; ao decidir, registre com `/decisao`.
- **Modo contínuo (autonomia — sem slash)**: quando o usuário indicar que vai se
  ausentar e quiser que o Sploit continue trabalhando até ele voltar — ex.: "vou
  sair, trabalha em X até eu voltar", "fica trabalhando até eu chegar", "pode ir
  fazendo", "quero que você termine isso" — o Sploit ATIVA o modo contínuo
  automaticamente, sem pedir comando nem confirmação. Protocolo: ler
  `PLANO_CONTINUO.md`; se o usuário deu um alvo específico (projeto/feature/
  tarefa), esse é o alvo do ciclo (registrar no plano); senão, seguir a fila do
  plano. Trabalhar UM passo por ciclo com verificação (typecheck/testes/build),
  commit atômico, nota em `NOTAS.md` e, ao fim de cada ciclo, disparar
  `scripts/self-restart.ps1 -ResumePrompt "<próximo passo>"` para continuar
  sozinho. Parar quando o alvo estiver concluído, a fila vazia ou um passo
  falhar 2x; deixar o relato em `NOTAS.md` ("Relato do modo contínuo") e o
  `SPLOIT_STATE.md` atualizado. O acionamento NUNCA é um slash — é a fala do
  usuário.
- **Mudanças no motor**: rode `bun typecheck` (em `sploit-src/packages/opencode`) e `scripts/build-sploit.ps1` antes de reiniciar o binário; registre o resultado na seção `# Verificação`.
- **Mudanças de config/skills/plugins**: lembre o usuário de reiniciar (config não é hot-reloaded).
- **Escopo**: cada alteração em `sploit-src/` é um commit atômico em separado; nunca misturar com mudanças de config.
- **Reindexar Graphify** após mudanças relevantes de código (`/graphify .`).
- Para retomar manualmente: `/retomar`.

## Idioma

- Responda **sempre em português brasileiro (PT-BR)** (ver `~/.config/sploit/AGENTS.md`).

## Convenções de commit

- Mensagens em **PT-BR**.
- Prefixo com o escopo: `sploit: <tipo>: <descrição>` (ex.: `sploit: feat: ...`, `sploit: chore: ...`).
- Descrever o que foi feito de forma curta e direta.
- `git config user.name/email` já estão definidos; não alterar.
- Comitar apenas quando solicitado explicitamente.

## Segredos (nunca commitar)

- `venv/`, `graphify-out/`, `sploit.exe` e `APIKEY.txt` são ignorados pelo `.gitignore`.

## Build do binário

- Recompilar após mudanças no `sploit-src`: `scripts/build-sploit.ps1`.
- O build usa Bun (`bun run script/build.ts --single --skip-install --skip-embed-web-ui` em `sploit-src/packages/opencode`) e copia o resultado para `sploit.exe` na raiz.
- Se `bun` não estiver no PATH: `C:\Users\Hp\AppData\Roaming\npm\bun.cmd`.
- Pra instalar de fato (registrar no PATH do usuário, uso de qualquer pasta): `scripts/install-sploit.ps1`.

## Memória de conhecimento (Graphify)

- Grafo local em `graphify-out/` (ignorado pelo git), gerado com o `graphifyy` (via
  `venv`; pin `0.9.32`). Neste PC: `.\venv\Scripts\graphify.exe` (e `graphify-mcp.exe`,
  apontado pelo MCP no `sploit.json`).
- Indexar com `--code-only --no-viz` (AST determinístico, sem LLM/key; docs .md já
  entram estruturalmente). Atualizar incremental: `graphify update .`.
- Exposição ao agente: servidor MCP `graphify` (registrado em `sploit.json`) + skill oficial em `~/.config/sploit/skills/graphify/` + plugin `.sploit/plugins/graphify.js`.
- Reindexar após mudanças relevantes de código: `/graphify .` (ou `venv\Scripts\graphify.exe update <caminho>`).
- Consultar o grafo com `graphify query`/`path`/`explain` antes de grep/read em bases grandes.

## Windows

- `core.autocrlf=true`: avisos "LF will be replaced by CRLF" são normais.
- PowerShell trata stderr como erro; mensagens vermelhas nem sempre indicam falha.
- `bun install` em `sploit-src/` falha sem Visual Studio Build Tools porque `tree-sitter-powershell`,
  `tree-sitter-bash` e `tree-sitter` tentam compilar um binding nativo via `node-gyp` no postinstall. O
  código só usa a versão `.wasm` desses pacotes (ver `packages/opencode/src/tool/shell.ts`), nunca o binding
  nativo — por isso os três foram removidos de `trustedDependencies` no `sploit-src/package.json`. Não
  devolver pra lá sem instalar Build Tools antes.
