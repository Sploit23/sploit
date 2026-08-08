# AGENTS.md — Sploit

Guia para agentes de IA que trabalham neste repositório (o **Sploit**).

## Estrutura

- `sploit-src/` — motor do Sploit (TypeScript/Bun, monorepo). Todo o código vive aqui.
- `sploit.exe` — binário compilado (build; não commitar). Gerado por `scripts/build-sploit.ps1`.
- `sploit.json` — config do projeto (MCP do Graphify + instructions).
- `SPLOIT_STATE.md` — memória viva de auto-melhoria (lida em toda sessão).
- `venv/` — ambiente Python usado pelo Graphify (não commitar).

## Auto-melhoria (protocolo obrigatório)

- **Início de sessão**: leia `SPLOIT_STATE.md`. Se houver `# Próximo passo`, continue de lá — não recomece do zero.
- **Conclusão de passo**: atualize `SPLOIT_STATE.md` (Progresso + Próximo passo) **antes** de encerrar/reiniciar. Nunca terminar uma sessão com o estado desatualizado.
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

- Grafo local em `graphify-out/` (ignorado pelo git), gerado com o `graphifyy` (via `venv`).
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
