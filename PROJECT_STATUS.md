# Sploit-Forge — guia de handoff / status do projeto

Documento pra qualquer agente de IA (ou pessoa) que vá continuar o
desenvolvimento a partir daqui, sem precisar reconstruir o contexto do
zero. Escrito em 2026-10-28.

## O que é isso

- **Sploit** — fork do [opencode](https://github.com/sst/opencode) (CLI de
  agente de código no terminal), com um subsistema `coordinator` que roteia
  instruções entre sessões de projetos diferentes.
- **Sploit-Forge** (código ainda com nome interno "FORGE" em vários
  lugares) — sistema de controle remoto multi-PC: um servidor Node roda em
  cada máquina como Serviço do Windows, acessível via PWA (celular/
  navegador) e um app desktop (Electron, ícone na bandeja + janela
  nativa). É o produto real sendo construído/usado agora.

## Onde está hospedado

- Repo: **`github.com/Sploit23/sploit`** — é um **fork próprio**, não o
  `sst/opencode` original (esse continua existindo como remote `origin`,
  mas não é onde o trabalho acontece).
- Branch de trabalho e **default branch do repo**: `dev`.
- O histórico de commits foi **reescrito/squashed** recentemente — só tem
  o histórico do Sploit-Forge a partir de um commit raiz único, sem os
  ~15.868 commits herdados do `opencode` original (decisão deliberada, pra
  tirar os 1000+ "contribuidores" que não eram deste projeto).

## Arquitetura — onde mexer

- `packages/opencode/src/cli/cmd/forge/app/` — **código-fonte canônico**
  do servidor FORGE:
  - `server.js` — servidor HTTP+WS principal (projetos, terminal,
    explorer, `/api/exec`, auto-update, auto-anúncio entre PCs).
  - `index.html` — o app inteiro (PWA + conteúdo das janelas do Electron)
    num arquivo só. Visual: paleta azul/roxo (`#4F7CFF`/`#A855F7`/
    `#D946EF`/`#22C55E`), fonte Inter/Segoe UI, sidebar fixa (desktop) ou
    barra inferior (celular).
  - `sessions-native.js` — motor de sessão de terminal pro Windows nativo
    (ConPTY via `node-pty`, sem tmux).
  - `sessions-tmux.js` — equivalente pro Linux/WSL (via tmux).
  - `win-service.js` — registra o server.js como Serviço do Windows
    (`node-windows`), tem uma ação `safe-restart` que reinicia via Task
    Scheduler (nunca usar `Restart-Service` direto de dentro de uma sessão
    hospedada pelo próprio FORGE — mata o processo no meio do restart).
  - `win-native-install.ps1` — instalador de um comando. Variáveis de
    ambiente que mudam o comportamento: `FORGE_HEADLESS=1` pula
    opencode/Claude Code *e* o app de bandeja (PC só controlado
    remotamente, nada visível).
- `packages/opencode/src/cli/cmd/forge/assets.ts` — **gerado**, não editar
  na mão. Depois de qualquer mudança em `app/`, rodar:
  ```
  bun run packages/opencode/script/gen-forge-assets.ts
  bunx prettier --write packages/opencode/src/cli/cmd/forge/assets.ts
  ```
- `packages/forge-tray/` — app Electron de bandeja.
  - `src/main.ts`/`src/pairing.ts` — fonte (TypeScript).
  - `dist/` — **artefato commitado** (main.js/pairing.js pré-compilados,
    ícones, `launch-tray.vbs`, `package.json` mínimo) — é daqui que o
    instalador baixa, porque a máquina alvo não tem `bun`, só `node`/`npm`.
    Depois de mudar `src/*.ts`, rebuildar com `bun run build:main` dentro
    de `packages/forge-tray/` e copiar os `.js` pra `dist/src/`.
- `README.md` — **comando de instalação canônico**. Sempre atualizar aqui
  primeiro; não repassar o comando de cabeça numa conversa (já causou um
  comando incompleto indo pro usuário uma vez).

## Máquinas reais rodando isso hoje

Três PCs instalados nativamente (Serviço do Windows, sem WSL), todos na
mesma rede Tailscale, todos se enxergando e se controlando mutuamente:

1. **Casa** — a máquina onde a maior parte deste trabalho foi feita.
2. **Escritório** (`DESKTOP-6NUJJFD`).
3. **Servidor** (`DESKTOP-VAA7RPI`) — o PC "antigo", instalado mais
   recentemente.

Cada instância **se anuncia automaticamente** pras outras (`POST
/api/announce`, sem token — mesmo nível de confiança que `/health` já
tinha) e guarda quem já se anunciou (`GET /api/known-devices`,
autenticado). Resultado: tendo o token de **uma** máquina, dá pra
descobrir e controlar todas as outras sem precisar relayar token na mão —
nem entre PCs, nem entre o usuário e o agente.

## O que já funciona

- Instalação nativa Windows de um comando só (`win-native-install.ps1`),
  idempotente, com TLS 1.2 + bypass de Execution Policy já resolvidos no
  comando documentado no README.
- Auto-update diário do `server.js` (compara com o `dev` do GitHub, valida
  sintaxe com `node --check` antes de aplicar, reinicia com segurança).
- App de bandeja com janela nativa de verdade por PC (não um popup
  pequeno) — clicar num PC abre uma janela real carregando o app inteiro,
  landing na tela "Dispositivos". Navegação entre PCs dentro do Electron
  abre uma janela nova por PC (não troca a atual).
- Explorer de arquivos em tabela (Nome/Tipo/Modificado) com atalhos fixos
  (Área de trabalho, Documentos, Downloads etc).
- Nomes de dispositivo editáveis (apelido cosmético, não mexe no
  hostname real usado pra rede).
- PWA instalável no celular, usa o mesmo registro automático de
  dispositivos — "Outros dispositivos" já aparece com token preenchido
  sozinho.

## Em andamento / próximo passo: "Coordenador"

Pedido do usuário: um terminal fixo (tipo "fica no começo da tela") onde
ele digita `opencode` e conversa com um agente que consegue:
- Trocar de contexto entre projetos ("vamos continuar o projeto X").
- Disparar ações **cross-PC** em linguagem natural ("manda o projeto do
  Escritório pro Servidor", "ajusta o código do servidor").
- Só aparecer/funcionar em PCs com app desktop (não em instalações
  `FORGE_HEADLESS`).

**Descoberta importante**: o Sploit já tem metade disso pronto —
`packages/opencode/src/tool/coordinator.ts` + `src/coordinator/registry.ts`
implementam `coordinator_register_project`/`coordinator_list_projects`/
`coordinator_dispatch`, mas só funcionam **na mesma máquina** (via
`InstanceStore.provide({directory})`, sem conceito de rede).

Também existe uma **API HTTP completa do opencode** (`opencode serve`,
`packages/opencode/src/cli/cmd/serve.ts`) — `POST /session` +
`POST /session/:id/message` devolve a resposta em JSON sincronamente. É
melhor caminho pro dispatch remoto do que fazer `/api/exec` rodar
`opencode run` e parsear stdout.

Plano (ainda não implementado, ver conversa pra detalhes): rodar
`opencode serve` localmente em cada PC desktop-capable, FORGE expõe um
endpoint autenticado que faz a ponte (`/api/coordinator/prompt` ou
similar) pra essa API local, e o `coordinator_dispatch` passa a saber
quando um projeto está em outro PC (via `/api/known-devices`) e rotear
pra lá em vez de rodar local. Falta também escrever
`.opencode/agent/coordinator.md` ensinando o agente a operar nesse
contexto (hoje não existe esse arquivo).

## Workflow de deploy (pros 3 PCs reais)

1. Commitar + dar `git push myfork dev` (sempre rodar com
   `export PATH="/c/Users/Hp/AppData/Roaming/npm:$PATH"` antes no bash, ou
   o hook de pre-push reclama de versão do bun errada).
2. Pra cada PC: baixar o(s) arquivo(s) mudado(s) via `/api/exec`
   (`Invoke-WebRequest` nos raw URLs do GitHub), **verificar** com
   `Select-String` que o arquivo baixado tem a mudança esperada (o CDN do
   GitHub às vezes serve uma versão em cache por ~20s depois do push) —
   só depois disso disparar o restart.
3. Se mudou `server.js`/`sessions-native.js`/`win-service.js`: `node
   win-service.js safe-restart` (Task Scheduler, não `Restart-Service`
   direto). Se mudou só `index.html`: não precisa reiniciar nada, é
   servido fresco do disco a cada request.
4. `node --check` nos `.js`, `bunx oxlint` nos arquivos tocados,
   regenerar `assets.ts`, `bun run --cwd packages/opencode typecheck`
   **antes** de commitar — sempre.
