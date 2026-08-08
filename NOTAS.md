# NOTAS.md — Memória temporal de trabalho do Sploit

> Detalhe histórico do quê foi feito por sessão (o SPLOIT_STATE.md guarda o estado
> vivo e o DECISOES.md as decisões). Indexado no Graphify — sessões futuras
> recuperam por `graphify query`, não por texto achatado. Registrar: `/resumo`.

## [2026-08-08] Iteracao 5 — diferenciais funcionais
- **Feito**: comandos `/saude` (scripts/saude.py: tokens, custo estimado, cache,
  compactacoes, contexto efetivo), `/planejar` (impacto no grafo antes de editar)
  e `/decisao` (registro em DECISOES.md). Bug do restart corrigido com
  `scripts/relaunch.ps1` (relancamento desanexado — janela volta sozinha).
- **Verificado**: `/saude` com saida real (474 turnos, 92,4% cache, pico 144k,
  custo estimado US$ 24,18); relauncher testado isoladamente (PID 999999 -> novo
  processo vivo). Graphify reindexado: 28756 nos, 55518 arestas, 2427 comunidades.
- **Pendente**: validar relaunch desanexado em restart real com mudanca de binario.
- **Referencias**: DECISOES.md, scripts/saude.py, scripts/relaunch.ps1,
  .sploit/command/{saude,planejar,decisao,resumo}.md, SPLOIT_STATE.md


## [2026-08-08] Acesso remoto - fase 1 (rede local)
- **Feito**: scripts/sploit-web.ps1 sobe sploit web com senha (sploit-web.secret,
  gitignored, gerada na 1a execucao) + mdns. Testado: 401 sem senha, 200 com senha,
  acessivel em http://192.168.100.174:4096 (IP do PC), UI mobile (viewport).
- **Verificado**: servidor de teste subiu (PID 18000) e foi encerrado; senha
  atual: OxZsBnyrfNUeKdcA (viva em sploit-web.secret).
- **Pendente**: teste manual no celular do usuario; fase 2 = bot Telegram.
- **Referencias**: scripts/sploit-web.ps1, DECISOES.md, .gitignore

## [2026-08-08] Acesso remoto - causa raiz da Home vazia na web
- **Feito**: debug da UI cloud (bundle app.opencode.ai servido via proxy 4111, pois
  o build usa `--skip-embed-web-ui` e `packages/app` so tem node_modules). Mapa do
  fluxo: a UI detecta protocolo v1 (`/global/health` healthy -> v1) e usa o wrapper
  `a3e`, que sobrescreve `session`, `project`, `vcs`, `file` para o SDK v1 — esses
  endpoints (`/project`, `/project/current`, `/session`, `/file`, `/find/file`)
  FUNCIONAM no servidor local.
- **Causa raiz da Home vazia (2 partes)**:
  1. A Home le `project.list()` do localStorage do browser (`store.projects[scope]`),
     que so popula quando o usuario ABRE um projeto via "Open Project" — na 1a visita
     esta vazio, e as sessoes sao filtradas por `zat()` via `projectDirectories`
     derivado dessa lista (vazia -> nenhuma sessao mostrada).
  2. O dialog "Open Project" chamava `file.find` do SDK v1 que envia
     `GET /find?query=...&dirs=...` — mas o servidor legacy espera `pattern` em
     `/find` (400 "Missing key") e o equivalente correto de busca por arquivo e
     `GET /find/file?query=`. O dialog listava vazio -> nao dava para abrir projeto.
- **Corrigido**: `scripts/sploit-web-proxy.py` agora reescreve `GET /find` com
  `query` (sem `pattern`) -> `/find/file`, passando os mesmos params. Proxy
  reiniciado (PID 8760). Validado: `/find?query=spl&dirs=true` -> 200 com lista
  de arquivos/diretorios; `/find?pattern=` (busca de texto) intacta; `/api/session`
  e `/file` seguem OK via proxy.
- **Verificado**: rotas `/api/*` presentes no makeDefaultApi (~18 grupos) vs as 27
  que a UI cloud espera; as ausentes retornam HTML fallback (nao JSON). Bundle salvo
  em %TEMP%\sploit\index-bundle.js para analise offline.
- **Pendente**: usuario testar no celular o "Open Project" digitando um caminho
  (ex.: `C:\Users\Hp\Desktop\sploit`) para abrir o projeto; depois as sessoes do
  projeto aparecem na Home. Se quiser Home populada de primeira, alternativa futura:
  embutir a UI no build (exigiria source de packages/app) ou propagar projetos do
  bootstrap global para o store local.
- **Referencias**: scripts/sploit-web-proxy.py, sploit-src/packages/protocol/src/api.ts,
  sploit-src/packages/opencode/script/build.ts, %TEMP%\sploit\probe_*.py

## [2026-08-08] Compactacao com consciencia de grafo (motor)
- **Feito**: o motor agora injeta as "ancoras" do grafo Graphify no prompt de
  compactacao. Em `packages/core/src/session/compaction.ts`: `Input` ganhou
  `directory`; `loadAnchors` le `graphify-out/graph.json` do diretorio da
  sessao (com cache por diretorio + mtime, top-15 nos code por degree, via
  `fs/promises` + `Effect` — cross-runtime Node/Bun); `buildPrompt` aceita
  `anchors` opcional e adiciona secao "Project anchors". `llm.ts` passa
  `session.location.directory` nas duas invocacoes (auto e overflow). Ausencia
  do grafo nao quebra (retorna "").
- **Verificado**: typecheck core e monorepo (16/16) OK; teste novo
  `session-compaction.test.ts` (anchors no prompt) + 2 existentes passam (3/3);
  build smoke `0.1.0-sploit` OK (copia do exe falha em uso — esperado, troca via
  self-restart). Falhas da suite completa sao pre-existentes (global paths
  Temp\opencode, npm timeout rede, echo PowerShell com aspas, opt-out instrucao).
- **Pendente**: self-restart para ativar no binario; medir no proximo /saude se a
  compactacao agora preserva simbolos/arquivos centrais.
- **Referencias**: sploit-src/packages/core/src/session/compaction.ts,
  sploit-src/packages/core/src/session/runner/llm.ts,
  sploit-src/packages/core/test/session-compaction.test.ts