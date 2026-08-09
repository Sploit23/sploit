# NOTAS.md — Memória temporal de trabalho do Sploit

> Detalhe histórico do quê foi feito por sessão (o SPLOIT_STATE.md guarda o estado
> vivo e o DECISOES.md as decisões). Indexado no Graphify — sessões futuras
> recuperam por `graphify query`, não por texto achatado.
> **Registro automático** (Constituição, art. 4): o Sploit grava a nota de evolução
> ao concluir tarefas — *"como raciocinei e o que valeu a pena"*. `/resumo` é legado.

## [2026-08-09] Compactação com small_model — economizar tokens do modelo grande
- **Como raciocinei**: o usuário quer que o `small_model` (Groq, hoje só usado em
  título de sessão e cópia de projeto) assuma tarefas pequenas. A compactação é o
  lugar certo: roda com o modelo grande e custa caro. Implementei a flag
  `compaction.small_model` (opt-in, default false — permite comparar A/B antes de
  virar padrão): schema V1 (`config.ts`), classe `Info` V2 (`config/compaction.ts`),
  migrate v1→v2 e a escolha do modelo em `opencode/src/session/compaction.ts`
  (small = `getSmallModel` com `Effect.catch` → fallback pro modelo da sessão se
  falhar). O V2/core ainda usa `input.model` direto (runner em dev) — caminho ativo
  é o V1.
- **O que valeu a pena**: (1) opt-in com flag em vez de troca silenciosa — dá pra
  medir antes/depois (Constituição art. 6); (2) fallback seguro: se o
  `getSmallModel` falhar, a compactação usa o modelo da sessão (não quebra);
  (3) segui o padrão dos testes existentes (`withCompaction({ llm, provider,
  config })`) em vez de criar infra nova — 2 testes novos capturam `input.model.id`
  e provam: com flag usa "test-small", sem flag usa "test-model".
- **Verificado**: typecheck core+opencode OK (0 erros); 54 testes de compactação
  (52 + 2 novos) passam; 92 de regressão (reminders+retry+system+prompt) passam;
  build smoke `0.1.0-sploit` OK (backup criado; cópia do exe em uso — troca via
  self-restart pendente). Commit motor `5cbe9a1`.
- **Pendente**: self-restart para ativar no binário; habilitada a flag no
  `sploit.json` (`"compaction": { "small_model": true }`); medir custo/qualidade da
  compactação com o Groq (as âncoras do grafo sobrevivem à compactação?).
- **Referências**: sploit-src/packages/opencode/src/session/compaction.ts
  (linhas ~328-337), sploit-src/packages/core/src/v1/config/config.ts,
  sploit-src/packages/core/src/config/compaction.ts, sploit.json

## [2026-08-09] Geração 5 — gene G-verificacao (4 obs, forte) vira mutação estrutural
- **Como raciocinei**: o gene G-verificacao ("Verificar antes de concluir:
  typecheck/build/smoke/compile — nada sem prova") atingiu 4 observações (forte)
  e virou o próximo candidato. Verifiquei primeiro se já era coberto pelo prompt
  do harness — grep em system.ts/prompt.ts/reminders.ts mostrou que NÃO (só
  menções a build-switch, nada sobre verificação pós-mudança). A mutação:
  quando o assistant edita código (`edit`/`write`/`apply_patch` em arquivo de
  extensão de código) e NÃO rodou verificação no mesmo turno, `reminders.ts`
  injeta o `VERIFY_PROMPT` (synthetic, mesma mecânica dos demais). A checagem
  `verifiedThisTurn` olha tool parts com `input.command`/`commands` que casam
  typecheck/tsgo/bun test/test/build/pytest/go test/cargo/npm/pnpm/yarn — se já
  verificou, não repete.
- **O que valeu a pena**: (1) segui o padrão das mutações anteriores — lugar
  único (reminders), guarda de duplicação, testes por comportamento; (2) o gene
  forte justificou a mutação com evidência (4 obs no diagnóstico); (3) a
  detecção de verificação é generosa (vários comandos) para não criar ruído
  falso; (4) extensões de código cobrem TS/Python/Rust/Go/C++/etc., docs ficam
  fora (sem reminder para editar .md).
- **Verificado**: typecheck opencode OK (0 erros); 12 testes de reminders (4
  Iteração B + 4 G-grafo + 4 G-verificacao novos: injeta após editar código;
  não injeta em docs; não injeta se já verificou no turno; não duplica) + 80
  testes de regressão (system+retry+prompt) passam; build smoke `0.1.0-sploit`
  OK (backup criado; cópia do exe em uso — troca via self-restart pendente).
  Commit motor `72851dd`.
- **Pendente**: self-restart para ativar no binário; medição "edições de código
  x verificação rodada" antes/depois nas próximas sessões (Constituição art. 6).
- **Referências**: sploit-src/packages/opencode/src/session/reminders.ts
  (VERIFY_PROMPT, CODE_EXTENSIONS, looksLikeVerification),
  sploit-src/packages/opencode/test/session/reminders.test.ts

## [2026-08-09] Medição das mutações (Constituição art. 6) — baseline
- **Como raciocinei**: ativei as mutações G3/G4/G5 no binário (self-restart,
  PID 19844→18648, binário novo 01:13) e precisei do baseline "antes" para
  medir depois. O DB de sessões (`opencode-sploit.db`) guarda cada tool call
  em mensagens separadas — a janela certa é por mensagem seguinte (+3, <=15min),
  não por part. Criei `scripts/medicao_mutacoes.py` que agrupa por sessão e
  mede: edição de código → verificação (G5); edição em central → consulta ao
  grafo (G4). Basename do arquivo para casar com os centrais do grafo (paths
  absolutos no DB vs. labels relativos no graph.json).
- **O que valeu a pena**: (1) o baseline provou que as mutações têm espaço:
  G5 = só **2,4%** das edições de código foram seguidas de verificação em +3
  turnos (9/374); G4 = **0%** de edições em centrais consultaram o grafo
  (0/1); (2) a medição é barata (script 100 linhas, roda em segundos) e
  reutilizável nas próximas sessões para medir o "depois"; (3) descobri que
  paths no DB são absolutos e os centrais do grafo são labels relativos —
  lição para futuras análises.
- **Verificado**: `python scripts\medicao_mutacoes.py` roda e imprime o
  baseline; self-restart confirmado (relaunch.log `[OK] PID 18648`, exe
  01:13:43 = dist novo com G3+G4+G5). Commit motor `72851dd` + raiz `a96d19b`.
- **Pendente**: rodar a mesma medição depois de N sessões com o binário novo
  e comparar (meta: verificação pós-edição >> 2,4%; consulta ao grafo em
  centrais >> 0%).
- **Referências**: sploit-src/packages/opencode/src/session/reminders.ts
  (G3/G4/G5), scripts/medicao_mutacoes.py

## [2026-08-09] Causa raiz do push automático do conhecimento (bug melh de infra)
- **Como raciocinei**: o passo "verificar o push do conhecimento" da fila noturna
  era suspeito — o diagnóstico de 02:15 reportou "[AVISO] sem rede", mas o sync
  manual funcionou na sequência. Em vez de assumir "rede caiu", investiguei o
  caminho: testei o POST do `push_lessons()` isolado com `urllib` → `403
  Forbidden` do Cloudflare. O `urllib` envia User-Agent `Python-urllib/3.x`, que
  o Cloudflare bloqueia; com User-Agent de browser → 200. O `sync-conhecimento.ps1`
  nunca falhava porque usa curl/Invoke-WebRequest com User-Agent de browser.
- **O que valeu a pena**: (1) G-causaraiz de novo — o sintoma ("sem rede") não
  tinha nada a ver com rede; (2) G-isolado — testei o push contra a URL real com
  um arquivo temporário antes de tocar no código; (3) atenção: o teste fake
  sobrescreveu o APRENDIZADO.md da nuvem, e eu restaurei o real na sequência
  (idempotência do restore verificada via GET).
- **Verificado**: py_compile OK; push fake com o fix → `[OK] licoes enviadas para
  a nuvem coletiva` (com config cloudflare real); GET confirma conteúdo real
  restaurado na nuvem.
- **Pendente**: o próximo `/diagnostico` real deve fazer o push automático (não
  reportar "sem rede"); confirmar na próxima execução.
- **Referências**: scripts/diagnostico.py (`push_lessons`, linha ~150)

## [2026-08-09] Geração 4 — gene G-grafo vira segunda mutação estrutural
- **Como raciocinei**: a G3 expôs as âncoras no system prompt, mas a técnica do
  gene G-grafo ("consultar o grafo ANTES de editar arquivos centrais") ainda
  dependia de disciplina. Aplicação no CORPO: `reminders.ts` agora carrega as
  âncoras via `SessionCompaction.loadAnchorFiles` (refatoração do core que
  compartilha o cache por mtime com `loadAnchors`) e, se a última resposta do
  assistant editou um arquivo central (top-15 por degree, casado por sufixo de
  path relativo), injeta o reminder de consultar o grafo antes de continuar —
  mesma mecânica do ROOT_CAUSE (synthetic, sem duplicar no turno).
- **O que valeu a pena**: (1) reuso total — não dupliquei a lógica do grafo;
  `loadAnchorFiles` nasceu de refatorar `loadAnchors`, os 4 testes de anchors
  continuam passando sem mudança; (2) o reminder só dispara em arquivos centrais
  (o teste de não-central garante silêncio em arquivos comuns); (3) sem grafo o
  harness não faz nada — custo zero em projetos sem graphify-out; (4) o
  `apply_patch` também é coberto (paths extraídos do patchText).
- **Verificado**: typecheck opencode e core OK (0 erros); 8 testes de reminders
  (4 novos da G4 + 4 da Iteração B) + 4 do compaction-anchors + 33 do retry +
  system OK; build smoke `0.1.0-sploit` OK (backup criado; cópia do exe em uso —
  troca via self-restart pendente). Commit motor `2bbca6e`.
- **Pendente**: self-restart para ativar no binário (junto com o build da
  Iteração B); medição "edições em centrais x consulta ao grafo" nas próximas
  sessões (Constituição art. 6).
- **Referências**: sploit-src/packages/opencode/src/session/reminders.ts
  (GRAPH_CHECK_PROMPT), sploit-src/packages/core/src/session/compaction.ts
  (loadAnchorFiles), sploit-src/packages/opencode/test/session/reminders.test.ts


## [2026-08-09] Iteração B — gene G-causaraiz vira mutação estrutural (Constituição)
- **Como raciocinei**: a Geração 3 provou o caminho (gene forte → mutação no
  harness). O gene G-causaraiz (2 obs) dizia "investigar a causa raiz antes de
  retry". Em vez de depender da disciplina, apliquei no CORPO: quando a última
  resposta do assistant tem um tool part com `state.status === "error"`, o
  `reminders.ts` injeta a instrução de causa raiz no userMessage do turno
  (`synthetic: true`, mesma mecânica dos reminders de plan/build-switch). O
  harness agora condiciona o retry do modelo — sem slash, sem disciplina.
- **O que valeu a pena**: (1) a mutação fica num lugar único (reminders) que já é
  o "injetor de instruções do turno" — não inventei mecanismo novo; (2) usar
  `findLast` para o tool error da última resposta evita "gritos" de falhas velhas
  (o teste de stale tool error cobre isso); (3) checar se o texto já está no
  userMessage impede duplicação no mesmo turno (testado); (4) o reminder é
  independente do plan mode — vale em build e plan.
- **Verificado**: typecheck opencode OK (0 erros); 4 testes novos
  `test/session/reminders.test.ts` passam (injeta no tool error; não injeta sem
  falha; não duplica no mesmo turno; ignora erro velho de turno anterior); build
  smoke `0.1.0-sploit` OK (backup criado; cópia do exe em uso — esperado, troca
  via self-restart). Commit motor `e42c47a`.
- **Pendente**: self-restart para ativar no binário; medição da taxa de "falha →
  retry repetido" antes/depois nas próximas sessões (Constituição art. 6).
- **Referências**: sploit-src/packages/opencode/src/session/reminders.ts
  (ROOT_CAUSE_PROMPT), sploit-src/packages/opencode/test/session/reminders.test.ts

## [2026-08-09] Geracao 3 — primeiro gene forte vira mutacao estrutural (Constituicao)
- **Como raciocinei**: o gene G-grafo (consultar o grafo antes de grep/read em bases
  grandes) era disciplina do agente — funcionava quando eu lembrava. A Geracao 3
  transfere a tecnica do comportamento para o CORPO: o harness passa a expor as
  ancoras do grafo (top-15 por degree) no `<env>` do system prompt de toda sessao
  que tiver `graphify-out/graph.json`. Assim o modelo sempre sabe quais arquivos
  sao centrais antes de planejar uma edicao — sem slash, sem depender de memoria.
  Reusei o `loadAnchors` que ja existia no core (compactacao com consciencia de
  grafo) em vez de duplicar logica: exportei a funcao e chamei de `system.ts`.
- **O que valeu a pena**: (1) grafo antes de editar — a mutacao nasce de um gene
  que ja era forte na pratica (evidencia no diagnostico: arquivos centrais tocados
  sem consulta ao grafo); (2) reuso em vez de copia — mesma fonte de verdade do
  grafo para compactacao e system prompt, cache por mtime compartilhado; (3)
  medição antes/depois — o /diagnostico ja cruza arquivos centrais tocados x
  falhas, entao a mutacao e verificavel nas proximas sessoes.
- **Verificado**: typecheck core + opencode OK (0 erros); 4 testes novos
  `compaction-anchors.test.ts` passam (sem grafo -> ""; top-degree ordenado;
  invalidacao de cache por mtime; grafo malformado nao quebra); build smoke
  `0.1.0-sploit` OK (backup criado; copia do exe em uso — esperado, troca via
  self-restart).
- **Pendente**: self-restart para ativar no binario; nas proximas sessoes conferir
  no /diagnostico se edicoes em arquivos centrais caem (a consciencia do grafo
  agora e estrutural, nao de disciplina).
- **Referencias**: sploit-src/packages/core/src/session/compaction.ts (loadAnchors
  exportado), sploit-src/packages/opencode/src/session/system.ts (anchors no env),
  sploit-src/packages/core/test/compaction-anchors.test.ts

## [2026-08-08] Geração 2 — genes de sucesso destilados das notas (Constituição)
- **Como raciocinei**: a Geração 1 criou a nota de evolução (reforço positivo);
  a 2 pega essas notas e as transforma em genes — técnicas que funcionaram, com
  contagem de observações. Em vez de "não erre" (lição), o gene diz "faça assim"
  (sucesso). Diferente do placar de lições (falha → confirmada), o gene nasce do
  que deu certo.
- **O que valeu a pena**: `sync_genes()` no diagnostico.py lê NOTAS.md por seção
  e conta em quantas notas distintas cada técnica aparece (G-grafo, G-isolado,
  G-verificacao, G-causaraiz, G-idempotencia). Com 3+ observações vira "forte" —
  candidato a mutação estrutural medida. Seção `## Genes de sucesso` no
  APRENDIZADO.md (antes do placar), viaja na nuvem junto.
- **Verificado**: py_compile OK; testes fake (destilação real das notas: 4 genes
  ativos; idempotência 2ª execução sem mudar; preserva placar de eficácia);
  diagnóstico real gravou genes no arquivo coletivo; push real para a nuvem OK.
- **Pendente**: G-grafo (1 obs) e G-isolado (1 obs) precisam de mais notas para
  virar "forte"; próxima geração: gene forte → mutação estrutural com medição.
- **Referências**: scripts/diagnostico.py (GENE_BY_PADRAO, sync_genes), NOTAS.md,
  ~/.config/sploit/conhecimento/APRENDIZADO.md

## [2026-08-08] Geração 1 — nota de evolução automática (Constituição)
- **Como raciocinei**: a conversa saiu de "aprender com erros" para "evoluir o
  corpo" (o harness, não o comportamento). O usuário apontou — corretamente — que
  lição = comportamento, e que a estrela é o motor. Distilei a Constituição em 7
  artigos (SPLOIT_STATE.md) e comecei a Geração 1.
- **O que valeu a pena**: separar *corpo ≠ comportamento* muda o alvo de tudo —
  o placar de eficácia (7.4) já era o embrião de evolução por sucesso; a nota de
  evolução pós-tarefa é a primeira mutação estrutural. Slashes viram legado: quem
  decide o momento é o próprio Sploit, não o usuário.
- **Verificado**: AGENTS.md raiz sem `/resumo`; NOTAS.md com registro automático;
  SPLOIT_STATE.md com a Constituição formalizada.
- **Pendente**: próxima geração — o Sploit destilar genes positivos a partir das
  notas (ex.: grafo antes de grep) e medir a primeira mutação estrutural.

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

## [2026-08-08] Diferencial de mercado — diagnostico do harness + fila de auto-melhoria
- **Direcao**: usuario rejeitou features de "agente de dev comum" (Telegram, validacao
  de compactacao, telemetria) — quer algo que ninguem tem. Pesquisa 2026: a batalha e
  o HARNESS (mesmo modelo: 59% scaffold uniforme vs 93% harness proprio); nenhum
  produto deixa o harness evoluir com o uso. O Sploit ja tem o trio que ninguem tem:
  memoria viva + grafo do proprio codigo + ciclo seguro de auto-atualizacao
  (build+backup+smoke+rollback). Proposta: "o agente que melhora o proprio arnes".
- **Feito**: `/diagnostico` (scripts/diagnostico.py) cruza DB + grafo e aponta onde o
  arnes sofre: falhas por ferramenta (com arquivo envolvido), arquivos centrais do
  grafo tocados (degree), turnos mais caros (com tools usadas), compactacoes e
  ancoras. `--fila` propoe candidatos em FILA_MELHORIAS.json. `/melhorar`
  (scripts/fila.py) gerencia a fila: novo/ver/negar/fazer/feito/reverter, com
  evidencia + verificacao por candidato e ciclo seguro para implementar.
- **Verificado**: diagnostico rodou em 2 sessoes (sploit: bash 3x abortado em
  sploit-web.ps1, edit oldString divergiu, server.ts degree 259 tocado 1x, pico
  132k com 11 bash; MaxxPrint: webfetch 40% falha 404). Fila gerada (3 candidatos),
  ciclo completo testado (fazer/negar/feito). Sem rebuild: scripts/config.
- **Pendente**: usuario implementar o 1o candidato aprovado via /melhorar e validar
  o ciclo ponta-a-ponta num restart real.
- **Referencias**: scripts/{diagnostico,fila}.py, FILA_MELHORIAS.json,
  .sploit/command/{diagnostico,melhorar}.md, DECISOES.md

## [2026-08-08] Primeiro ciclo de auto-melhoria ponta-a-ponta (melh-4)
- **Contexto**: os 3 candidatos iniciais da fila (melh-1 bash, melh-2 edit, melh-3
  pico) eram sintomas de DISCIPLINA DO AGENTE, nao defeitos do harness — negados apos
  investigacao (o motor ja normaliza CRLF em edit core:44 e legacy:130; o abort do
  bash foi o agente rodar servidor sincrono via tool e estourar o timeout de 120s).
  Aprendizado: o diagnostico classifica por taxa, mas a causa real precisa de leitura
  humana/agente.
- **Feito (melh-4)**: a licao foi gravada no proprio harness — o prompt das 3 shells
  (bash/powershell/cmd) em `packages/opencode/src/tool/shell/prompt.ts` ganhou a regra
  "NEVER run a server, watcher, or daemon synchronously in this tool; use
  -Detached/Start-Process/start /b". Com isso o agente futuro nao repete o abort.
- **Verificado**: typecheck do opencode OK (exit 0); build smoke `0.1.0-sploit` OK
  (backup sploit.exe.bak criado; copia do exe falhou em uso — esperado); self-restart
  real validado (relaunch.log 19:08:27: PID 3956 -> 32, binario trocado do dist/,
  relancado --continue, [OK] vivo). Nesta sessao, o prompt com a regra ja esta ativo.
- **Commits**: sploit-src `2055266` (feat(opencode): shell alerta contra servidor
  sincrono), raiz `8458257` (diagnostico + fila + comandos + memoria + melh-4).
- **Pendente**: reindexar Graphify; proximos candidatos via /diagnostico --fila.
- **Referencias**: sploit-src/packages/opencode/src/tool/shell/prompt.ts,
  scripts/{diagnostico,fila}.py, FILA_MELHORIAS.json, logs/relaunch.log
