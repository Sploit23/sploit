# Sploit-Forge — guia de handoff / status do projeto

Documento pra qualquer agente de IA (ou pessoa) que vá continuar o
desenvolvimento a partir daqui, sem precisar reconstruir o contexto do
zero. Escrito em 2026-10-28.

## O que é isso

- **Sploit** — fork do [opencode](https://github.com/sst/opencode) (CLI de
  agente de código no terminal). Hoje **sem nenhuma modificação própria**
  pra fins de produto — o que existia (sistema `coordinator` dentro do
  CLI) foi deliberadamente revertido em 28/10 e virou uma feature do
  Sploit-Forge via MCP (ver seção "Coordenador"), justamente pra não
  precisar manter um fork remesclado pra sempre. O repo continua sendo
  esse fork só porque é onde o código-fonte do Sploit-Forge mora
  (`packages/opencode/src/cli/cmd/forge/`), não porque o CLI em si
  precise ser diferente do opencode oficial.
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
    explorer, `/api/exec`, auto-update, auto-anúncio entre PCs, servidor
    MCP do Coordenador, `opencode serve` supervisionado).
  - `mcp-coordinator.js` — servidor MCP (`list_projects`/`dispatch`/
    `transfer_project`) que `server.js` expõe em `POST /mcp`. Ver seção
    "Coordenador" abaixo.
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
    remotamente, nada visível). Captura `%USERPROFILE%` real na hora da
    instalação e passa como `FORGE_USER_PROFILE` pro Serviço — sem isso,
    `os.homedir()` dentro de qualquer sessão cairia no profile vazio do
    SYSTEM (o Serviço roda como LocalSystem), e opencode/claude nunca
    enxergariam a conta/créditos já logados da pessoa de verdade.
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
- **Coordenador** (terminal cross-PC pelo celular) — ver seção própria
  abaixo. Validado de ponta a ponta nos 3 PCs reais (listar projetos,
  transferir projeto, despachar instrução remota).

## Coordenador (terminal cross-PC, via MCP)

Pedido original do usuário: um terminal fixo (tipo "fica no começo da
tela") onde ele digita `opencode`/`claude` e conversa com um agente que
consegue trocar de contexto entre projetos e disparar ações **cross-PC**
em linguagem natural ("manda o projeto do Escritório pro Servidor",
"ajusta o código do servidor").

**Primeira versão (manhã de 28/10) foi via fork** — um agente customizado
(`.opencode/agent/coordinator.md`) + ferramentas TypeScript dentro do
próprio Sploit. Funcionou, mas pra ativar precisou compilar o Sploit e
substituir o `opencode.exe` global de verdade na máquina — ou seja,
manter essa feature significaria remesclar o fork pra sempre a cada
atualização real do opencode/Claude Code. **Foi inteiramente revertido**
no mesmo dia (`tool/coordinator.ts`, `coordinator/registry.ts` e o
`.opencode/agent/coordinator.md` foram apagados).

**Versão atual (a que vale): o Coordenador é só um servidor MCP que o
próprio FORGE expõe**, não precisa de nenhuma modificação no CLI:

- `server.js` roda `POST /mcp` (autenticado com o Bearer de sempre),
  implementado em `mcp-coordinator.js` com
  `@modelcontextprotocol/sdk` (`server/mcp` + `server/streamableHttp`,
  modo *stateless*). Três ferramentas: `list_projects` (descoberta ao
  vivo via `/api/projects` local + `/api/known-devices` + `/api/projects`
  de cada device conhecido), `dispatch` (manda instrução pra outro
  projeto, local ou remoto) e `transfer_project` (move os arquivos de um
  projeto inteiro entre máquinas, reaproveitando `/api/relay-send` — veja
  a ressalva de memória abaixo).
- `server.js` também supervisiona um `opencode serve` local (porta fixa
  127.0.0.1:4097, Basic Auth via `OPENCODE_SERVER_PASSWORD`, sempre o
  binário oficial via `OPENCODE_BIN`) — é o motor que de fato executa a
  instrução num projeto (`promptProject()`: `POST /session` +
  `POST /session/:id/message` com header `x-opencode-directory`). Rota
  `POST /api/coordinator/prompt` (autenticada) é a ponte que outra
  máquina bate quando o `dispatch` resolve um projeto remoto.
- Pra qualquer CLI oficial (opencode **ou** Claude Code) ganhar essas
  ferramentas, só precisa ter esse MCP configurado — `server.js` grava
  isso sozinho (`ensureCoordinatorMcpConfig`) em
  `.coordinator/opencode.json` e `.coordinator/.mcp.json`, uma pasta
  fixa dentro de `FORGE_ROOT` (não é um projeto normal, não aparece no
  Explorer). A pessoa escolhe qual dos dois CLIs quer no terminal do
  Coordenador via `coordinator-cli.txt`/`PUT /api/coordinator-cli`
  (seletor na UI) — isso só decide o que ela digita; o motor que executa
  a instrução no projeto-alvo continua sempre sendo `opencode serve`.
- Tela "Coordenador" (`index.html`, ícone 🧭) só aparece quando
  `/api/stats` diz `desktop:true` (`isDesktopInstalled()` — detecta o
  app de bandeja, instalação de produção OU modo dev via
  `AppData\Roaming\forge-tray`, ver comentário no código). No celular,
  esconde a barra de abas (terminal/preview/tela) e os botões de teclado
  que só servem pra shell — sobra mais tela pra ler a conversa.

**Armadilhas reais encontradas e corrigidas** (documentadas no código,
vale ler antes de tocar de novo):
- `spawn('opencode', ...)` sem shell dá `EFTYPE` no Windows (é um
  wrapper `.cmd`/`.ps1`, não um `.exe` puro) — vai via
  `powershell.exe -Command "& '...'"`, igual `sessions-native.js` já
  fazia pros outros modos.
- `claude --continue` falha com exit code != 0 ("no conversation to
  continue") quando não existe sessão prévia — ao contrário do opencode,
  que começa do zero sozinho. `winCommand()` tenta `--continue` e cai
  pra uma sessão nova se o exit code vier diferente de zero.
- Trocar o CLI no seletor não tinha efeito nenhum sozinho — a sessão do
  coordenador fica viva em background mesmo depois que a pessoa "sai" da
  tela. `PUT /api/coordinator-cli` agora mata a sessão atual
  (`sessions.killAll('coordinator')`) pra forçar reconectar com o CLI
  novo.
- O Serviço roda como LocalSystem — sem `FORGE_USER_PROFILE` (ver bullet
  do `win-native-install.ps1` acima), nenhuma sessão (nem só o
  Coordenador) via o perfil/conta real da pessoa.
- `/api/relay-send` (usado pelo `transfer_project`) empacotava a pasta
  inteira com `tar` e **bufferizava tudo em memória** (`Buffer.concat`)
  antes de mandar — pra um projeto JS real (com `node_modules`), isso
  sozinho podia derrubar o processo por falta de memória. Corrigido:
  `--exclude=node_modules` no `tar` (de longe o maior vilão de tamanho,
  reproduzível com `npm install` no destino) + streaming direto
  (`Readable.toWeb(tar.stdout)` como body do `fetch`, `duplex:'half'`)
  em vez de acumular chunks -- nada fica na memória de uma vez, não
  importa o tamanho da pasta.

**Pendências conhecidas, não resolvidas de propósito:**
- `coordinator_register_project`/registro manual de projeto fora do
  FORGE foi cortado deliberadamente desta rodada (`CoordinatorRegistry`
  foi apagado) — hoje só existe descoberta ao vivo via `/api/projects`.
  Se precisar de projeto fora de qualquer FORGE, é um reopen, não um bug.

## Workflow de deploy (pros 3 PCs reais)

1. Commitar + dar `git push myfork dev` (sempre rodar com
   `export PATH="/c/Users/Hp/AppData/Roaming/npm:$PATH"` antes no bash, ou
   o hook de pre-push reclama de versão do bun errada).
2. Pra cada PC: baixar o(s) arquivo(s) mudado(s) via `/api/exec`
   (`Invoke-WebRequest` nos raw URLs do GitHub), **verificar** com
   `Select-String` que o arquivo baixado tem a mudança esperada (o CDN do
   GitHub às vezes serve uma versão em cache por bem mais que ~20s depois
   do push — se acontecer, usar a URL fixada no commit exato,
   `raw.githubusercontent.com/Sploit23/sploit/<sha>/...`, resolve sempre)
   — só depois disso disparar o restart.
   - `C:\ProgramData\SploitForge\*` só aceita escrita de
     SYSTEM/Administradores (ACL) — `/api/exec` funciona porque roda como
     SYSTEM; sem o token, precisa de um PowerShell **admin** de verdade
     na máquina (não um comum) pra sobrescrever `server.js` etc.
3. Se mudou `server.js`/`sessions-native.js`/`win-service.js`: `node
   win-service.js safe-restart` (Task Scheduler, não `Restart-Service`
   direto) — ou, de um PowerShell admin externo (RDP/físico, não uma
   sessão hospedada pelo próprio FORGE), `Restart-Service sploitforge.exe`
   direto é seguro (`Start-Service` se o status já estiver `Stopped`). Se
   mudou só `index.html`: não precisa reiniciar nada, é servido fresco do
   disco a cada request.
4. `node --check` nos `.js`, `bunx oxlint` nos arquivos tocados,
   regenerar `assets.ts`, `bun run --cwd packages/opencode typecheck`
   **antes** de commitar — sempre.
