# Sploit-Forge — guia de handoff / status do projeto

Documento pra qualquer agente de IA (ou pessoa) que vá continuar o
desenvolvimento a partir daqui, sem precisar reconstruir o contexto do
zero. Escrito em 2026-10-28, atualizado em 2026-10-30.

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
  lugares) — sistema de controle remoto multi-PC/multi-plataforma: um
  servidor Node roda em cada máquina (Serviço do Windows OU `systemd` no
  Linux/ARM), acessível via PWA (celular/navegador) e, opcionalmente, um
  app desktop (Electron, ícone na bandeja + janela nativa). É o produto
  real sendo construído/usado agora.

## Arquitetura recomendada: 1 PC gráfico + N bots

Não existe servidor central — cada máquina roda seu próprio FORGE
independente (mesh via Tailscale, cada um com seu token). O padrão
adotado na prática: **um PC "base"** com a instalação gráfica completa
(é o link que a pessoa realmente abre no celular/PWA pra ver e
gerenciar tudo) e **os demais como "bots"** (`FORGE_HEADLESS=1`, Windows
ou Linux/ARM) — nenhum ícone/atalho/app visível, só o serviço rodando em
segundo plano, controlado inteiramente pela malha. Gerenciar projeto,
mover/apagar, navegar e transferir arquivo, checar atualização e ver
estatística já funcionam em qualquer PC bot **sem abrir o link dele** —
tudo repassado pela malha usando o token de cada device (mesmo padrão de
proxy em várias rotas de `server.js`: resolve `KNOWN.find(dnsName)`,
repassa com o token do dono). A única coisa que ainda exige trocar pro
link de um PC específico é abrir um terminal de verdade
(opencode/claude/shell) nele — depende de WebSocket preso à origem
daquele PC; um relay de WebSocket entre PCs resolveria isso de vez, não
construído ainda.

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
    explorer/arquivos cross-device, `/api/exec`, auto-update (5 em 5 min),
    auto-anúncio entre PCs (reciproco e imediato pra device novo),
    servidor MCP do Coordenador, `opencode serve` supervisionado, motor
    FMM de triagem via `/api/triagem`).
  - `mcp-coordinator.js` — servidor MCP (`list_projects`/`dispatch`/
    `transfer_project`/`ask_local_model`) que `server.js` expõe em
    `POST /mcp`. Ver seção "Coordenador" abaixo.
  - `index.html` — o app inteiro (PWA + conteúdo das janelas do Electron)
    num arquivo só. Visual (reformado em 29/10): paleta void/cyan/violeta
    (`--bg:#05070d` `--blue:#3ef0d8` `--purple:#a855f7` `--pink:#ef4fd8`
    `--ok:#2dd4a5`), scanline sutil de fundo, toques monospace em
    status/terminal/Coordenador, fonte Inter/Segoe UI, sidebar fixa
    (desktop) ou barra inferior (celular). Telas: Dispositivos (stats +
    troca de PC sem navegar, ver abaixo), Projetos (ícones cross-PC,
    filtro por device), Arquivos (ícones, cross-device, arrastar pra
    outro PC), Pareamento (só QR/link agora — gerenciar device é em
    Dispositivos), Coordenador (terminal cross-PC).
  - `sessions-native.js` — motor de sessão de terminal pro Windows nativo
    (ConPTY via `node-pty`, sem tmux).
  - `sessions-tmux.js` — equivalente pro Linux/WSL/ARM (via tmux).
  - `win-service.js` — registra o server.js como Serviço do Windows
    (`node-windows`), tem uma ação `safe-restart` que reinicia via Task
    Scheduler (nunca usar `Restart-Service` direto de dentro de uma sessão
    hospedada pelo próprio FORGE — mata o processo no meio do restart).
    **Importante**: só registra um conjunto FIXO de env vars no Serviço na
    hora do `install` (`FORGE_TOKEN`/`FORGE_ROOT`/`PORT`/`HOST`/
    `OPENCODE_BIN`/`CLAUDE_BIN`/`FORGE_USER_PROFILE`) — qualquer variável
    nova no `.env` não chegaria lá só reiniciando. Corrigido em 30/10:
    `server.js` agora lê o `.env` direto do arquivo no boot, então um
    restart normal já basta pra qualquer variável nova, sem precisar
    tocar neste arquivo a cada uma.
  - `win-native-install.ps1` — instalador Windows de um comando.
    `FORGE_HEADLESS=1` pula opencode/Claude Code *e* o app de bandeja.
  - `bootstrap.sh` — instalador Linux/ARM de um comando (`systemd`,
    idempotente — seguro rodar de novo pra atualizar, já que esse path
    não tem auto-update). Também suporta `FORGE_HEADLESS=1` (adicionado
    em 30/10, mesma lógica do lado Windows) — essencial em Raspberry
    Pi/ARM, onde nem sempre tem build oficial de opencode/Claude Code.
- `packages/opencode/src/cli/cmd/forge/assets.ts` — **gerado**, não editar
  na mão. Depois de qualquer mudança em `app/`, rodar:
  ```
  bun run packages/opencode/script/gen-forge-assets.ts
  bunx prettier --write packages/opencode/src/cli/cmd/forge/assets.ts
  ```
  Não embute `bootstrap.sh`/`win-native-install.ps1`/`*.ps1` — esses são
  buscados em tempo real do GitHub raw pelos próprios instaladores.
- `packages/forge-tray/` — app Electron de bandeja (só Windows).
- `README.md` — **comando de instalação canônico**. Sempre atualizar aqui
  primeiro; não repassar o comando de cabeça numa conversa.

## Máquinas reais rodando isso hoje

Quatro dispositivos, todos na mesma rede Tailscale, todos se enxergando e
se controlando mutuamente:

1. **Casa** — o PC "base": instalação gráfica completa, é o link que a
   pessoa realmente usa.
2. **Escritório** (apelido "Nitro", pela GPU) — bot (sem app de bandeja,
   removido manualmente em 30/10; serviço continua rodando normal). Tem
   um projeto separado de LLM própria (ver seção abaixo) e hospeda o
   motor de triagem local.
3. **Servidor** — bot (idem, sem app de bandeja).
4. **raspberrypi** — Linux/ARM, instalado via `bootstrap.sh
   FORGE_HEADLESS=1` em 30/10. Always-on (plano do usuário: powerbank +
   fonte na tomada, sobrevive queda de luz se o roteador também estiver
   protegido). Candidato natural a âncora da malha (check-in proativo,
   serviços expostos via Cloudflare Tunnel que precisam de uptime).

Cada instância **se anuncia automaticamente** pras outras (`POST
/api/announce`, sem token) e guarda quem já se anunciou (`GET
/api/known-devices`, autenticado). Desde 30/10, o anúncio é **recíproco e
imediato**: ao receber o anúncio de um device genuinamente novo, o
servidor já se anuncia de volta na hora (em vez de esperar o próximo
ciclo periódico, que também caiu de 1h pra 5min) — sem isso, um PC novo
podia demorar até 1h pra aparecer nos dois sentidos.

**Projeto externo relevante**: `D:\FMM_MASTER_STABLE_V5.4_SLIM` no
Escritório — motor de inferência CUDA próprio (não é llama.cpp/Ollama),
roda Qwen2.5-3B com quantização 4-bit customizada, incluindo um
checkpoint `model_3b_uncensored.fmm_bin`. 4 modos de arquitetura
(Transformer/FIELD/KDA/Hybrid) — achado de revisão de código: o modo
FIELD roda com pesos **aleatórios, nunca treinados** no motor de
produção (baixa expressividade estrutural, soma de operadores rank-1 —
explica o resultado do próprio experimento do usuário onde Transformer
ganhou 23x em val_loss num teste controlado). Ligado na malha do
Sploit-Forge em 30/10 (ver seção "Motor de IA local").

## O que já funciona

- Instalação de um comando só, idempotente, Windows (`win-native-install.ps1`)
  ou Linux/ARM (`bootstrap.sh`) — ambos com `FORGE_HEADLESS=1` pra virar
  um bot sem nenhuma presença visual/CLI de IA local.
- Auto-update frequente (5 em 5 min, não mais 24h) do `server.js` e
  arquivos relacionados — compara com o `dev` do GitHub, valida sintaxe
  com `node --check` antes de aplicar, reinicia com segurança
  (`win-service.js safe-restart`). Só no Windows por enquanto (Linux
  ainda depende de rerodar o `bootstrap.sh` na mão — idempotente, seguro).
  Falhas ficam registradas em `update.log` (`GET /api/update-log`) —
  antes só dava pra diagnosticar entrando na máquina via `/api/exec`.
  **Nota**: já houve uma falha silenciosa não totalmente diagnosticada
  numa máquina real (o endpoint disse "ok" mas não aplicou nada) — causa
  raiz não confirmada, só contornada manualmente; o log novo existe
  justamente pra isso não ficar invisível de novo.
- Botão **"🔄 atualizar agora"** (tela Dispositivos e no menu de segurar
  de cada device) força `checkForUpdates()` fora do ciclo — e com
  `{dnsName}` no corpo, repassa pro device certo (proxy com o token
  dele), então dá pra atualizar QUALQUER PC a partir de qualquer tela.
- **Nome de dispositivo sincronizado de verdade** — self-assigned por
  cada máquina (`getDeviceName()`), propagado via announce; renomear
  qualquer device (local ou remoto, proxy com o token do dono) funciona
  de qualquer PC. Antes, cada navegador podia salvar um "apelido" só no
  `localStorage` (por origem), inconsistente ao trocar de link.
- **Tela Dispositivos** — topo mostra estatística (CPU/RAM/uptime) de
  qualquer PC; tocar no card de um device troca o que é mostrado **sem
  navegar** (mesmo proxy de sempre, `/api/stats?machine=`); segurar abre
  menu (renomear/🔄 atualizar/"entrar →" — esse último só quando
  realmente precisar abrir terminal de verdade naquele PC, navegação de
  verdade pro link dele).
- **Pareamento** — simplificado em 30/10: só QR/copiar link (dar acesso a
  um aparelho novo é a única coisa que não tem como automatizar). Gerenciar
  device conhecido (renomear/atualizar/entrar) é tudo em Dispositivos agora.
- **Explorer (Arquivos)** — ícones de pasta/arquivo (igual Projetos, cor
  neutra) em vez de tabela. Seletor de dispositivo (`#exdevs`) pra ver e
  baixar arquivo de **qualquer PC conhecido sem trocar de link**
  (`GET /api/browse?machine=`/`GET /api/download?machine=`, mesmo proxy).
  Arrastar um ícone até outro PC **copia** (não move) o arquivo/pasta pra
  lá, numa pasta `forge-received` (irmã de `FORGE_ROOT`, nunca registra
  como projeto) — `POST /api/files/send` no servidor de origem, que
  repassa pro `POST /api/files-receive` do destino. Só funciona navegando
  "este PC" (mover um arquivo que já é remoto, de outro PC pra outro,
  ainda não suportado).
- **Projetos como ícones cross-PC, arrastáveis entre máquinas** — grade de
  ícones estilo tela de apps (pasta SVG + cor por hash do nome,
  `iconColor()`/`FOLDER_SVG`), reunindo projetos de TODA a rede
  (`GET /api/all-projects`). `wireIcon()`: toque abre chat focado;
  segurar sem mover abre o menu completo (local **e remoto** — antes só
  projeto local tinha o menu cheio, remoto só tinha "iniciar conversa");
  segurar e arrastar até outro device move o projeto de verdade
  (`transfer_project`). Seletor de device (`#prjdevs`, filtro client-side
  só — `/api/all-projects` já traz tudo numa chamada) pra ver só os
  projetos de um PC específico.
- Gestão remota completa de projeto sem trocar de link: apagar, remover
  da lista, encerrar sessão, mover pra outro PC — tudo via o mesmo padrão
  de proxy (`DELETE /api/projects/:alias` agora resolve por `KNOWN`
  quando não acha local).
- **Motor de IA local (triagem)** — ver seção própria abaixo.
- **Coordenador** (terminal cross-PC pelo celular) — ver seção própria.
  Validado de ponta a ponta em 4 dispositivos reais.
- **Check-in proativo diário** — o Coordenador manda, sozinho, uma
  notificação push resumindo o estado da rede todo dia às 8h
  (`coordinatorCheckIn()`/`CHECKIN_HOUR` em `server.js`, sessão própria
  `.coordinator-checkin`). Candidato a mudar de âncora pro `raspberrypi`
  quando ele estiver no powerbank (único 100% always-on).
- Entrada por voz no terminal do Coordenador (Web Speech API) — iOS
  bloqueia dentro do PWA instalado (funciona numa aba normal do
  Safari/Chrome), resolvido com um link "🌐 ditar no navegador" que
  aparece no lugar do microfone quando a API não existe.

## Motor de IA local (triagem) — ligado na malha em 30/10

Objetivo: pergunta rápida/trivial resolve local e de graça (sem gastar
crédito de nuvem), pergunta complexa continua indo pro Coordenador
(opencode/Claude Code).

- `D:\FMM_MASTER_STABLE_V5.4_SLIM\api\server.py` (novo arquivo, FastAPI,
  venv `venv_fmm` que já existia) — carrega a DLL (`motor_base_v01\
  fmm_engine.dll`) via `ctypes` uma vez no startup, junto do tokenizer
  Qwen. `POST /chat` aplica o chat template, gera greedy até EOS/
  `max_tokens`, devolve texto. Um lock global em volta da geração (a
  engine C++ tem estado — KV cache — não é segura pra chamada
  concorrente). Roda em `127.0.0.1:8383`.
- `server.js`: `FMM_ENGINE_DIR` opcional no `.env` (só setado no
  Escritório hoje) + `ensureFmmApi()` (lazy-spawn, mesmo molde do
  `ensureOpenCodeServe()`) + `POST /api/triagem` — 501 em qualquer
  máquina sem `FMM_ENGINE_DIR` configurado.
- `mcp-coordinator.js`: tool MCP `ask_local_model` — tenta `/api/triagem`
  local primeiro, senão percorre `KNOWN` até achar um device que
  responda. Não fica hardcoded em qual PC tem GPU.
- PWA: botão 🧠 (tela Dispositivos, ao lado de renomear/atualizar) abre
  uma caixinha simples de pergunta/resposta, chama `/api/triagem` na
  máquina atual.
- Testado e confirmado funcionando via PWA e via MCP (resposta real do
  Qwen2.5-3B, sem gastar crédito de agente remoto).

## Coordenador (terminal cross-PC, via MCP)

Pedido original do usuário: um terminal fixo onde ele digita
`opencode`/`claude` e conversa com um agente que consegue trocar de
contexto entre projetos e disparar ações **cross-PC** em linguagem
natural ("manda o projeto do Escritório pro Servidor", "pergunta pro
motor local quanto é 7x8").

**Primeira versão (manhã de 28/10) foi via fork** do próprio Sploit —
revertida no mesmo dia (significaria remesclar o fork pra sempre).
**Versão atual: o Coordenador é só um servidor MCP que o próprio FORGE
expõe**, sem nenhuma modificação no CLI:

- `server.js` roda `POST /mcp` (autenticado, Bearer de sempre),
  implementado em `mcp-coordinator.js` com `@modelcontextprotocol/sdk`
  (modo stateless). **Quatro ferramentas**: `list_projects`, `dispatch`
  (instrução pra outro projeto, local ou remoto), `transfer_project`
  (move projeto entre máquinas) e `ask_local_model` (pergunta de
  triagem pro motor local, ver seção acima).
- Pra qualquer CLI oficial (opencode **ou** Claude Code, incluindo uma
  sessão de Claude Code comum fora do FORGE) ganhar essas ferramentas,
  só precisa configurar esse MCP: `claude mcp add --transport http
  sploit-forge https://<host>/mcp --header "Authorization: Bearer
  <TOKEN daquele PC>"` (rodar localmente, nunca colar o token no chat) +
  reiniciar a sessão (`claude --continue`) pra carregar a tool list nova.
  Dentro do FORGE, `server.js` grava isso sozinho
  (`ensureCoordinatorMcpConfig`) em `.coordinator/opencode.json` e
  `.coordinator/.mcp.json`.
- **Importante pra quem for usar `dispatch`**: isso spawna/reaproveita
  uma sessão de agente real (opencode/claude) NA MÁQUINA DE DESTINO, que
  gasta crédito de LLM daquela conta/máquina especificamente — diferente
  de `list_projects`/`ask_local_model`/ou de ler arquivos via
  `/api/browse`/`/api/exec` direto, que são só HTTP puro, sem custo de
  LLM nenhum do lado de lá. Se uma máquina estiver sem crédito,
  `dispatch` vai travar/falhar lá — nesse caso, preferir ler/escrever
  via API crua em vez de insistir no dispatch.
- Tela "Coordenador" (`index.html`, ícone 🧭) só aparece quando
  `/api/stats` diz `desktop:true` (detecta app de bandeja).

**Armadilhas reais encontradas (vale ler antes de tocar de novo)**:
- `spawn('opencode', ...)` sem shell dá `EFTYPE` no Windows — vai via
  `powershell.exe -Command "& '...'"`.
- O Serviço roda como LocalSystem — variáveis de ambiente só as
  registradas no install (ver bullet do `win-service.js` acima);
  corrigido lendo `.env` direto no boot de `server.js`.
- `C:\ProgramData\SploitForge\*` só aceita escrita de
  SYSTEM/Administradores (ACL) — `Edit`/`fs.writeFileSync` direto de uma
  sessão de agente comum falha com `EPERM` mesmo quando `test -w` diz que
  é gravável (falso positivo). Único caminho confiável pra mudar algo lá:
  `/api/exec` (roda como o Serviço) ou um PowerShell admin de verdade na
  máquina.
- **Git Bash/MSYS mangla path Windows em argumento de linha de comando**
  (`D:\FMM...` em `curl -d '{"path":"D:\\..."}'` vira outra coisa) — ao
  montar JSON com caminho Windows pra mandar via `curl` no Git Bash,
  usar barra normal (`D:/FMM...`) ou escrever o JSON num arquivo e usar
  `curl -d @arquivo.json` em vez de inline.
- Nunca chamar `Restart-Service`/`Stop-Service` direto via `/api/exec` —
  o processo que executa o comando é filho do próprio serviço sendo
  reiniciado, pode morrer no meio. Usar `node win-service.js
  safe-restart` (Task Scheduler, sobrevive a isso).
- Ferramentas MCP novas só aparecem numa sessão depois de
  `claude --continue` (ou reconectar do zero) — a lista de tools de um
  servidor MCP é fixada na conexão inicial, não recarrega sozinha.
- `announceToPeers()` tinha dois guards `if (!WIN) return` redundantes,
  apesar de não ter nada específico de Windows — um Raspberry Pi/Linux
  nunca se anunciava sozinho pra malha até isso ser corrigido em 30/10.

## Workflow de deploy (pros PCs reais)

1. Commitar + `git push myfork dev`.
2. Arquivo mudado chega sozinho em até 5 min em qualquer PC Windows
   (auto-update) — ou força na hora com o botão 🔄/`POST
   /api/check-updates` (com `{dnsName}` no corpo, repassa pro device
   certo). PC Linux/ARM (Pi): rerodar o `bootstrap.sh` na mão (idempotente,
   mantém o token) — não tem auto-update ainda.
3. Pra debugar/aplicar manualmente numa máquina específica: `/api/exec`
   com um projeto já registrado nela + `Invoke-WebRequest` nos raw URLs
   do GitHub (lembrar do cuidado com MSYS/barra, acima) + `node
   win-service.js safe-restart` se mudou `server.js`/`mcp-coordinator.js`.
   Token de qualquer device: `GET /api/known-devices` (autenticado com o
   token de QUALQUER outro device já pareado) — nunca precisa pedir pro
   usuário copiar/colar token de novo uma vez que UM device já está
   acessível.
4. `node --check` nos `.js`, regenerar `assets.ts`,
   `bun run --cwd packages/opencode typecheck` **antes** de commitar —
   sempre. Pra `index.html`: extrair o `<script>` e validar com
   `new Function()` (syntax check rápido sem precisar de browser).
