# NOTAS.md — Memória temporal de trabalho do Sploit

> Detalhe histórico do quê foi feito por sessão (o SPLOIT_STATE.md guarda o estado
> vivo e o DECISOES.md as decisões). Indexado no Graphify — sessões futuras
> recuperam por `graphify query`, não por texto achatado.
> **Registro automático** (Constituição, art. 4): o Sploit grava a nota de evolução
> ao concluir tarefas — *"como raciocinei e o que valeu a pena"*. `/resumo` é legado.

## [2026-08-11] Dock do squad na TUI — "sempre mostra eles vivos ali trabalhando"
- **Como raciocinei**: o usuário pediu para remover os bonecos ("ta muito feio,
  nada ver") e, ao ver a versão web, disse "não quero ver no web, só o modo
  terminal que você me propôs no começo que sempre mostra eles vivos ali
  trabalhando" — a opção (A) terminal, que ele já tinha escolhido lá no início.
  Em vez de outro comando CLI, o certo era o dock DENTRO do Sploit: a TUI da
  sessão já é onde o usuário vive, e o diretório da sessão já vem no objeto
  `session` do SDK. Explorei a TUI com um subagente (sem React/Ink — é
  SolidJS + @opentui; `createEffect` + `setInterval` + `onCleanup` é o padrão
  de polling do projeto, e `Bun.file()` o padrão de leitura).
- **O que valeu a pena**: (1) `SquadDock` em `routes/session/squad-dock.tsx` —
  replica a lógica do squad.py (parse do quadro com o mesmo regex, `estadoAgente`
  com `tarefaPendente` = último pendente em aberto), polling de 2s, some quando
  o diretório não tem squad/ (silencioso, zero custo em projetos normais);
  (2) cores por hash estável do nome sobre a paleta do tema (é o padrão do TUI,
  não ANSI); (3) integração numa linha no rodapé fixo da rota da sessão;
  (4) o usuário rejeitou os bonecos 2x (pixel, depois web) — lição: para
  painel de status, lista limpa > decoração; (5) a web (`squad web`) continua
  existindo no CLI, mas o foco virou o dock nativo.
- **Verificado**: typecheck tui OK (0 erros); build smoke `0.1.0-sploit` OK
  (backup criado; cópia do exe em uso — troca via self-restart pendente).
  Commits: motor `7c281b9` + raiz `23bf0b8` (remoção dos bonecos).
- **Próximo**: validar visualmente no binário novo (abrir um projeto com
  squad); criação interativa na TUI; limits por rodada do supervisor.

## [2026-08-11] Supervisor de fila — squad supervisor (ciclos até a fila zerar)
- **Como raciocinei**: o `squad run` lançava uma rodada e acabava — faltava a
  parte "o time trabalha sozinho até terminar". O supervisor é um loop de
  polling sobre o quadro: lança quem tem tarefa em aberto, relança quando o
  agente reporta progresso, e encerra quando a fila zera. Aprendizado de
  design no caminho: (1) **detecção de tarefa é semântica, não sintática** —
  a 1ª versão olhava o último post do AGENTE (não pegava tarefas postadas pelo
  coordenador); a 2ª usou `nome in msg` (falso positivo com "Ana primeiro,
  Bruno depois" do post velho do MVP — lançou a Ana 2x à toa); a final exige
  `Nome:` + **sem resposta do agente depois** (posts pendentes antigos do
  coordenador já respondidos nunca são fechados no quadro append-only — sem
  essa regra, o Bruno era relançado para tarefas que ele já tinha entregue);
  (2) **buffer do Python**: com stdout redirecionado, print não flusha — o
  log do supervisor aparecia só no fim (fix `line_buffering=True`);
  (3) **boneco feio**: `██` (2 chars/pixel) distorce proporções — pixel único
  `█` e sprite de 8 linhas; o usuário confirmou que era grande/estranho.
- **O que valeu a pena**: validar real em 3 rodadas — a 1ª (suja) ainda
  entregou: o Bruno fez GET /health E /versao numa rodada só (eficiente!); o
  teste final limpo provou o fluxo inteiro: tarefa nova → supervisor lançou →
  `(feito)` → fila vazia → encerrou sozinho.
- **Próximo**: criação interativa na TUI; view no TUI; limites (custos) por
  rodada do supervisor.

## [2026-08-11] "Agentes rodando de verdade" — squad run (sessões headless)
- **Como raciocinei**: a visualização estava pronta, mas o status só mudava se
  alguém postasse — o usuário queria ver os agentes TRABALHANDO. A chave foi
  descobrir (via exploração do motor) que o `sploit run` já é headless por
  padrão: sai sozinho ao ficar idle e as permissões `allow` do sploit.json
  valem sem prompt. Cada agente do squad vira um PROCESSO real: `sploit run
  --dir <pasta-do-agente> --continue` — e como a pasta é exclusiva do agente,
  o `--continue` (última sessão sem parent do dir) é determinístico e retoma
  a conversa anterior: persistência sem estado extra no squad.json.
- **O que valeu a pena**: (1) zero mudança no motor — o harness já tinha tudo
  (headless, permissões, WAL multi-processo; o único risco é edição
  concorrente do mesmo arquivo, resolvido por pasta exclusiva por agente);
  (2) o contrato do agente vai no PROMPT (leia o quadro → execute na sua
  pasta → poste via `squad.py post` → atualize sua memória) — o próprio
  agente headless escreve no quadro com o CLI existente, nada de código novo
  no motor; (3) o teste real provou o ciclo: Bruno implementou GET /status,
  testou no servidor real, atualizou `memoria/Bruno.md` (aprendizado por
  agente!) e postou `(feito)` sozinho; processo saiu ao ficar idle.
- **Verificado**: py_compile OK; post da tarefa → `squad run --nome Bruno`
  (PID 856) → log mostra leitura da memória, implementação, teste real 200,
  memória atualizada → quadro com `(feito)` → palco mostra ✓; processo
  encerrado sozinho.
- **Próximo**: supervisor de ciclos (relançar agente quando houver pendente),
  criação interativa na TUI, view no TUI.

## [2026-08-11] Visualização do squad — "mostrar eles trabalhando" (view + web)
- **Como raciocinei**: o usuário pediu a parte que falta para "não consigo mais
  programar sem o Sploit": a pessoa VER o time trabalhando. Pesquisei o que
  existe open source (ele lembrou de agentes com bonecos conversando — é o
  Smallville/Generative Agents de Stanford e o ai-town da a16z, MIT). Os
  SPIRITES pixel do ai-town são assets de terceiros (licença própria), então
  peguei a IDEIA e desenhei o boneco em código: matriz 8x9 + cor derivada do
  nome do agente — zero dependência, funciona no terminal (blocos ANSI) e na
  web (canvas 2D) com o MESMO desenho.
- **O que valeu a pena**: (1) bonecos por código (SPRITE + paleta) deram
  identidade própria ao Sploit e custo zero de licença; (2) o quadro já era o
  "sangue" — o viewer é um leitor (parse da regex `**[nome] (estado) msg -
  [data]**`), nada de estado novo; (3) a cor por hash colidiu (Maria e Pedro
  ficaram iguais) → `cores_agentes` resolve colisão (anda na paleta até achar
  cor livre) — detalhe que faz diferença visual; (4) o Coordenador em cinza
  resolve o medo do usuário ("parece que sempre vai ser o sploit a estrela");
  (5) erros reais pegos na validação: encoding cp1252 do console Windows
  (fix `sys.stdout.reconfigure(utf-8)` + os.system("") p/ VT) e travessão
  "—" no quadro da PoC (regex tolerante a `-`/`—`).
- **Verificado**: py_compile OK; `view` no projeto-demo2 (Ana/Bruno ✓) e no
  projeto-demo (João/Maria/Pedro com cores âmbar/verde/roxo distintas); `web`
  real: `/api` 200 (projeto, 2 agentes, 3 posts, cores/status corretos) e
  `/` 200 (HTML 3.7 KB); servidor encerrado.
- **Próximo**: criar agentes de verdade na TUI (fluxo interativo); agentes
  como sessões persistentes (aí o "aguardando" é literalmente verdade).
- **Referências**: scripts/squad.py (SPRITE/PALETA/view/web), skill squad §6,
  ai-town (a16z, MIT) e Generative Agents (Stanford) como referência de design.

## [2026-08-11] Relato do modo contínuo — Modo Squad: MVP entregue pronto

**Alvo** (pedido do usuário): "pode implementar, e me entregue pronto, só me
chame quando a tarefa estiver acabada". Executado em 3 ciclos via self-restart.

1. **O que foi feito** (commits): ciclo 1 = `scripts/squad.py` (CLI:
   init/add/post/status/list/check; init idempotente, agente duplicado/
   inexistente bloqueado, check de integridade) — commit raiz `f0519ed`.
   Ciclo 2 = skill global `squad` em `~/.config/sploit/skills/squad/SKILL.md`
   (criação interativa quantos/pastas/nomes, formato canônico squad.json/
   quadro.md/memoria/<nome>.md, orquestração com contratos + encadeamento por
   dependência) + gatilho no `~/.config/sploit/AGENTS.md` (não versionado).
   Ciclo 3 = teste ponta a ponta real em `Temp\sploit\projeto-demo2`: Ana
   (frontend) e Bruno (backend) criados via CLI, feature delegada a subagentes
   com persona ("você é a Ana, dona do frontend"), posts centralizados no
   quadro via CLI, Bruno encadeado pelo post da Ana; `POST /preco 19.90` →
   `200 {"ok":true,"preco":19.9}` no servidor real; `status` + `check` OK.
2. **O que foi medido**: o quadro guardou a conversa inteira (3 posts com
   estado feito/pendente); o check provou consistência (agentes ↔ pastas ↔
   memórias); arquivo de quadro validado como UTF-8 real (display "lǦ" era só
   console PS 5.1, bytes `c3 aa` corretos).
3. **O que o Sploit aprendeu**: (1) a mecânica "coordenador define contrato
   ANTES de delegar" (herdada da PoC) é o que impede colisão entre áreas —
   Ana e Bruno não se pisaram; (2) post no quadro via CLI dá timestamps e
   valida estados — o script vale mais como "cimento" do que como criação
   (criar com read/write também funciona); (3) skill + gatilho em
   `~/.config` não são hot-reloaded — entram em vigor no próximo boot do
   usuário (avisar no relato).
4. **Pendente para decisão humana**: nada bloqueante. Próximas evoluções
   documentadas no SQUAD.md: criação interativa na TUI, agentes como sessões
   próprias persistentes, view de feed. A fila de evolução do harness (G5–G9)
   continua intacta no PLANO_CONTINUO.md para a próxima rodada.

- **Referências**: SQUAD.md, scripts/squad.py, skills/squad/SKILL.md,
  Temp\sploit\projeto-demo2 (squad/quadro.md, squad/memoria/ana.md,
  squad/memoria/bruno.md).

## [2026-08-11] Modo Squad — MVP do mecanismo (CLI + skill + teste real)
- **Como raciocinei**: o usuário pediu o produto pronto ("me entregue pronto").
  Em vez de construir a visão inteira (sessões persistentes, TUI de feed), o
  MVP certo é a MECÂNICA: script que padroniza a criação do squad, skill que
  ensina o coordenador a orquestrar, e um teste ponta a ponta real provando o
  fluxo do usuário ("crie agentes" → nomes/pastas → feature → conversa →
  teste real).
- **O que valeu a pena**: (1) a CLI `squad.py` reusa o formato canônico da PoC
  e adiciona validação (duplicado bloqueado, estado válido, check) — a PoC era
  manual, o produto não pode ser; (2) delegar a subagentes com persona (nome +
  pasta + memória + "NÃO poste no quadro, o coordenador centraliza") manteve a
  corrida controlada — um agente por vez, sem editar a pasta do outro; (3) o
  encadeamento por dependência funcionou de novo: Ana postou "feito, preciso
  do endpoint" → Bruno respondeu no quadro → teste real fechou o ciclo; (4)
  UTF-8 conferido por bytes (o "lǦ" do console era display, não mojibake —
  mesma lição do APRENDIZADO).
- **Verificado**: py_compile OK; testes da CLI (idempotência, duplicado,
  inexistente, check) passaram; `status` + `check` OK no demo2; POST real
  19.90 → 200 {ok:true,preco:19.9}; servidor encerrado após o teste; skill +
  AGENTS global validados por leitura.
- **Próximo**: avisar o usuário que skill/config entram em vigor no próximo
  boot; quando ele pedir de novo "crie agentes" num projeto, a skill squad
  será carregada automaticamente.
- **Referências**: scripts/squad.py (commit `f0519ed`),
  ~/.config/sploit/skills/squad/SKILL.md, Temp\sploit\projeto-demo2.

## [2026-08-11] Modo Squad — prova de conceito (João, Maria e Pedro)
- **Como raciocinei**: o usuário sonhou com "agentes que moram no projeto, com
  nome, conversando como colegas" — diferente dos subagentes efêmeros do Task.
  Em vez de planejar o produto inteiro, montei a PoC com a mecânica mínima: o
  **quadro** (`squad/quadro.md`) como canal de conversa, `squad.json` como
  registro dos agentes (nome + pasta + papel), memória separada por agente
  (`squad/memoria/<nome>.md`) e o coordenador ordenando dependências. Na PoC os
  agentes são subagentes (Task) com persona própria — a persistência vem do
  quadro + memórias, não do processo.
- **O que valeu a pena**: (1) o contrato definido ANTES (POST /preco com
  {preco}) permitiu o João e a Maria trabalharem sem colidir — é assim que time
  real faz; (2) a dependência fluiu pela conversa: João postou "feito, preciso
  da API" → Maria respondeu "no ar, pode consumir" → Pedro consumiu GET /preco
  que ela já tinha feito; (3) provar com teste real (POST 7.50 → GET retorna
  7.50) em vez de só mostrar os arquivos — é o que transforma "teatro" em
  "funciona"; (4) o usuário deu o fluxo de criação: coordenador pergunta
  quantos/pastas/nomes, não decide sozinho.
- **Verificado**: 3 agentes (João frontend, Maria backend, Pedro visual);
  quadro com 6 posts; POST /preco 200 {"ok":true,"preco":7.5}; GET /preco
  200 {"ok":true,"preco":7.5}; memórias separadas criadas.
- **Próximo**: decisão da visualização dedicada no TUI (feed); transformar
  agentes de subagentes efêmeros em sessões próprias persistentes; aplicar no
  projeto real (MaxxPrint?) quando o mecanismo estiver consolidado.
- **Referências**: SQUAD.md (blueprint), projeto-demo em
  Temp\sploit\projeto-demo (backend/frontend/visual + squad/).

## [2026-08-09] Geração 9 — gene G-idempotencia vira mutação estrutural
- **Como raciocinei**: o gene G-idempotencia ("provar idempotência rodando 2x")
  era a técnica que mais salvou nos ciclos reais (scaffold, migrações, seeds
  duplicando). A mutação: observar as tools bash do turno, detectar comandos que
  ESCREVEM estado persistente (heurística conservadora: scaffold/geração/
  migração/seed/CLIs de DB/SQL-write), e se rodaram só 1x, injetar o reminder de
  rodar de novo e provar que a 2ª execução não duplica.
- **O que valeu a pena**: (1) herdar o molde das G5-G8 tornou a implementação
  mecânica — prefixo + prompt + bloco no `apply` + 5 testes; (2) a decisão de
  contar comandos NORMALIZADOS (lowercase + collapse spaces) permite detectar
  "rodou 2x" com variações de espaçamento; (3) "provado" = rodou ≥2x → silêncio;
  o reminder só aparece quando falta a prova; (4) heurística exige palavra-chave
  FORTE (migrat/seed/scaffold/generate/prisma...) — comandos read-only
  (typecheck/build/test/ls) nunca disparam; (5) um prompt por comando único não
  provado, join com separador (padrão do file memory).
- **Verificado**: commit motor `52be6d1`; typecheck opencode 0 erros; **34/34
  reminders** (5 novos); 388 pass na suíte de sessão (2 revert-compact
  pré-existentes); build smoke `0.1.0-sploit` OK.
- **Próximo**: self-restart para ativar a G9 no binário; na re-medição, observar
  se comandos stateful passam a ser reexecutados (2ª execução) antes de concluir.
- **Referências**: sploit-src/packages/opencode/src/session/reminders.ts
  (unprovenStatefulCommands/IDEMPOTENCY_PREFIX), test/session/reminders.test.ts
  (describe idempotency)

## [2026-08-09] Geração 8 — "o arquivo lembra" (memória procedural por arquivo)
- **Como raciocinei**: o usuário cobrou que eu estava só me "ajustando" — G5-G7
  eram o mesmo padrão (reminder de texto injetado). A primeira ideia PRÓPRIA:
  memória ancorada no arquivo. Em vez de texto genérico ("verifique", "consulte
  o grafo"), o harness passa a lembrar que UM ARQUIVO específico já falhou — e
  quando o modelo volta a editar ESSE arquivo, injeta o erro passado real antes
  da edição. É conhecimento procedural localizado, não instrução genérica.
- **O que valeu a pena**: (1) a decisão de DERIVAR a ficha dos próprios
  `messages` (função pura `findFileErrors`) em vez de estado global — zero
  wiring novo, testável direto, nada a limpar; (2) excluir erros do turno atual
  (time >= lastAssistant) deixa o ROOT_CAUSE cuidar do presente e a ficha do
  passado — sem dupla injeção (testado); (3) erro de tool sem arquivo (bash
  sem filePath) não vira ficha — a memória só existe onde pode ser ancorada;
  (4) typecheck pegou de novo: filter sem type guard devolve `Part[]` e o
  `found[0].text` quebra — guard `part is SessionV1.TextPart` resolve.
- **Verificado**: commit motor `da7e4ee`; typecheck opencode OK (0 erros); 29/29
  reminders (4 novos); 383 pass na suíte de sessão (2 revert-compact
  pré-existentes, 404 do `@sploit-ai/plugin`); build smoke `0.1.0-sploit` OK.
- **Próximo**: self-restart com o binário novo (G5+G6+G7+G8 ativos) e re-medição
  real — além da verificação, medir **erros repetidos no mesmo arquivo** (devem
  cair com a G8).
- **Referências**: sploit-src/packages/opencode/src/session/reminders.ts
  (findFileErrors/FILE_MEMORY_PREFIX), test/session/reminders.test.ts
  (describe file memory)

## [2026-08-09] Geração 7 — proof-gate: o turno só fecha com a verificação passando
- **Como raciocinei**: a G6 rodava a verificação no `apply` do próximo turno — mas
  o `break` do runLoop (`prompt.ts`) acontecia ANTES de qualquer verificação, no
  topo do loop. Ou seja: o turno que editava código quebrado era aceito como
  concluído, e a "re-verificação" da G6 só ocorreria na próxima iteração que nunca
  vinha. A mutação foi feita no lugar certo: no branch de exit do runLoop, antes
  do `break`, o harness roda `runVerifyCommand` na hora; se FAIL, persiste o erro
  real (saída truncada) como nova user message synthetic (prefixo
  `VERIFY_HARNESS_PREFIX`, herdando agent/model da última user real) e reabre o
  turno com `continue` — o modelo corrige com o erro diante dos olhos, com
  orçamento de 3 tentativas por prompt real.
- **O que valeu a pena**: (1) G-causaraiz de novo — o "G6 fraca" era estrutura:
  o break antecipado; o fix no branch de exit, não no apply; (2) descobri no
  schema que `User` e `Assistant` têm shapes diferentes (`model` vs
  `modelID/providerID`) e o `findLast` não estreita a union — precisei de
  narrowing explícito; (3) o `Effect.fn` v4 NÃO aceita anotação de retorno no
  generator (`: "break" | "continue"`) — o TS a lê como tipo do Generator e o
  arquivo quebra em cascata (erros TS2448/T2322/TS2339 em linhas distantes);
  remover a anotação deixou o TS inferir certo; (4) a variável local
  `verifiedThisTurn` no `apply` SOMBREADA a função do módulo → TDZ ("used before
  its declaration") — renomeada para `didVerify`; (5) mock do Session via
  `Layer.mock` com métodos genéricos (`<T extends Info>`) capturando
  updateMessage/updatePart — os gate tests não precisam de DB real; (6) 25/25
  reminders; as 2 falhas de revert-compact são PRÉ-EXISTENTES (404 do
  `@sploit-ai/plugin` no background install — confirmado via git stash com o
  código original).
- **Verificado**: commit motor `8430925`; typecheck opencode OK (0 erros); 7
  testes novos (FAIL real reabre com "continue" + user message synthetic com o
  erro, PASS fecha, sem package.json fecha, turno já verificado não reabre, doc
  não dispara, orçamento 3 esgotado fecha com warning, apply não duplica
  VERIFY_PROMPT sobre gate); build smoke `0.1.0-sploit` OK (backup criado; cópia
  do exe em uso — troca via self-restart pendente).
- **Próximo**: self-restart com o binário novo (`8430925`, G5+G6+G7 ativos) e
  re-medição real — com o proof-gate, o indicador que importa é o de verificação
  concluída ANTES do fechamento do turno.
- **Referências**: sploit-src/packages/opencode/src/session/reminders.ts
  (enforceTurnVerification/runVerifyCommand/isVerifyGateMessage), prompt.ts
  (branch de exit ~1113-1142), test/session/reminders.test.ts (gateIt + captured)

## [2026-08-09] Geração 6 — o harness roda a verificação de verdade (auto-verify)
- **Como raciocinei**: a G5 pede verificação com texto (VERIFY_PROMPT) — funciona,
  mas depende do modelo obedecer. O usuário cobrou ideias que não sejam "fáceis":
  a Geração 6 faz o **harness executar** a verificação. Se o projeto tem
  `package.json` com script `typecheck` (fallback `build`), o `reminders.ts` roda
  `bun run typecheck` via `AppProcess.run` (timeout 120s, saída truncada em 3000
  bytes) e injeta o RESULTADO REAL (PASS/FAIL + erro concreto) como part synthetic
  no userMessage — o modelo corrige com prova, não com convite. Sem package.json,
  cai no VERIFY_PROMPT da G5. Só verifica no turno final (finish !==
  "tool-calls"), para não checar mudança pela metade; não duplica quando já rodou
  verificação no turno; docs editadas não disparam.
- **O que valeu a pena**: (1) encontrar o caminho `AppProcess.run` já usado por
  git/snapshot/worktree — o serviço resolve do runtime global, sem wiring extra
  (mas o typecheck pegou o requisito: `apply` agora precisa de `AppProcess.Service`
  e o prompt.ts teve que importar/prover o serviço + node no layer — 3 pontos);
  (2) o falso positivo do tsgo no prompt.ts:1081 era o requirements novo do `apply`
  propagando — o erro sumiu ao prover o serviço; (3) o mock do AppProcess no teste
  (Layer.mock com exitCode/stdout/stderr controláveis) permite testar PASS e FAIL
  sem processo real; (4) 6 testes novos + 51 de regressão (reminders+retry+anchors)
  + 47 prompt/system OK; monorepo 16/16; build smoke `0.1.0-sploit` OK.
- **Verificado**: commit motor `10eff54`; typecheck opencode + monorepo OK; 18
  testes de reminders passam (12 antigos + 6 novos); build smoke OK (backup
  criado; cópia do exe em uso — troca via self-restart pendente).
- **Próximo**: self-restart com o binário novo (G5 recuperada + G6 ativa) e
  re-medição real com `medicao_mutacoes.py` (verificação pós-edição > 2,5%;
  agora a mutação está no binário DE VERDADE).
- **Referências**: sploit-src/packages/opencode/src/session/reminders.ts
  (runAutoVerify/AUTO_VERIFY_PROMPT/detectVerifyCommand), prompt.ts (provide
  AppProcess), test/session/reminders.test.ts (mock do AppProcess + 6 casos)

## [2026-08-09] G5 perdida no revert da small_model — recuperada (lição de processo)
- **Como raciocinei**: ao investigar por que o reminder G5 (verificação pós-edição)
  parecia fraco, fui ler o código em vez de confiar na memória — e `grep` por
  `VERIFY_PROMPT` no `reminders.ts` atual não achou NADA. Confirmei no git: o
  commit da G5 (`72851dd`) **não é ancestral do HEAD** (`git merge-base
  --is-ancestor` → exit 1). A causa: o revert da small_model fez `reset` do
  sploit-src para `2bbca6e` (G4) em vez de `git revert` do commit específico
  (`5cbe9a1`) — o reset desfez TUDO que veio depois do 2bbca6e, incluindo a G5.
  As Fases 1-4 da desvinculação foram construídas sobre o commit sem ela, e o
  binário atual (c34739b, 13:01) NUNCA teve a mutação. Ou seja: os "4,2%" que
  medimos eram o comportamento natural do modelo via meta.txt, não a mutação —
  e o SPLOIT_STATE.md registrava "G5 ativada" (memória errada do projeto).
- **O que valeu a pena**: (1) G-causaraiz de novo — o sintoma ("G5 fraca") tinha
  uma causa estrutural: a mutação não existia; (2) reler o código em vez de
  aceitar o estado documentado — a memória do projeto pode mentir; (3) o diff da
  G5 estava intacto no commit órfão e aplicou limpo via `git cherry-pick -n`
  (reminders.ts + teste, 167 inserções); (4) o ciclo de validação pegou tudo:
  typecheck OK, 12 testes de reminders OK, build smoke `0.1.0-sploit` OK.
- **Verificado**: commit motor `5c75238`; typecheck opencode OK; `bun test
  test/session/reminders.test.ts` → 12 pass; build smoke OK (backup criado;
  cópia do exe em uso — troca via self-restart). A G5 agora está no código de
  verdade; re-medir a taxa de verificação pós-edição com a mutação ATIVA.
- **Lição de processo**: para desfazer UMA feature, usar `git revert <commit>`
  (desfaz só ele), não `reset` para um commit-base (desfaz tudo que veio depois).
- **Referências**: sploit-src/packages/opencode/src/session/reminders.ts
  (VERIFY_PROMPT), git log --oneline (2bbca6e → c34739b sem 72851dd),
  SPLOIT_STATE.md (corrigido)

## [2026-08-09] Medição pós-mutações G3/G4/G5 — 1ª rodada real (art. 6)
- **Como raciocinei**: para medir o "depois" sem misturar períodos, dei ao
  `medicao_mutacoes.py` filtro de tempo (`--desde`/`--ate` UTC) e separei a
  ativação das mutações (09/08 04:13 UTC = 01:13 local). O DB guarda ms UTC; a
  sessão atual cruza os dois períodos, então o filtro por `time_created` da part
  foi essencial. A reindexação do Graphify (pós-desvinculação, 28.811 nós)
  revelou um problema no SCRIPT (não no motor): o graphify 0.9.34 usa multigraph
  (arestas em `links`) e os nós **não têm mais o campo `degree`** — o core já
  calcula degree pelos links (compaction.ts:112-120), mas o script media com
  `node.get("degree")` (tudo 0 → top-15 aleatório) e ainda casava central por
  basename (qualquer `index.ts` casava com `worktree/index.ts` → 4 falsos
  positivos). Corrigi espelhando o core: degree dos links + `file_type=="code"`
  + `source_file` + match por sufixo.
- **O que valeu a pena**: (1) G-causaraiz de novo — em vez de aceitar "G4 não
  funcionou (0/4)", investiguei os paths e vi que eram falsos positivos; (2)
  espelhar exatamente o que o harness usa (degree pelos links, source_file) é o
  único jeito de medir o comportamento real; (3) o baseline G4 REAL é **0/37**
  (37 edições em centrais sem consultar o grafo no período pré) — a mutação tem
  espaço enorme; (4) resultado honesto: G5 2,5% → **4,2%** (tendência, amostra
  pequena); G4 pós sem amostra (0 edições em centrais ainda) — inconclusivo.
- **Verificado**: py_compile OK; pré (359 edições, 37 centrais, 17 erros) e pós
  (71 edições, 0 centrais, 6 erros) rodados com o matcher correto. Re-medir
  após mais sessões acumuladas.
- **Referências**: scripts/medicao_mutacoes.py, graphify-out/graph.json (schema
  0.9.34), sploit-src/packages/core/src/session/compaction.ts

## [2026-08-09] Desvinculação — validação da Fase 4 em produção (fecha o ciclo)
- **Como raciocinei**: a Fase 4 (migração `opencode-*.db` → `sploit.db` no primeiro
  boot) precisava de prova em ambiente real, não só de testes. O self-restart
  ativou o binário novo (PID 2960, 13:01:29, build 12:57:09) e a migração rodou no
  boot. Validei os três elos da corrente: (1) DB novo existe (`sploit.db`
  182.489.088 bytes + wal + shm); (2) o legado `opencode-sploit.db` (183.672.832)
  continua **intacto** — a migração copia, nunca move/remove; (3) `/saude` lê o
  histórico migrado (2467 turnos, 15,3M tokens in, 200M cache read, 38
  compactações, pico 179.546) — dados antigos no DB novo, sessão atual retomada.
- **O que valeu a pena**: (1) o design "copia idempotente, nunca remove o legado"
  se pagou: o rollback automático do self-restart continua seguro mesmo depois da
  migração; (2) ao conferir o processo ativo descobri que `dist/` da raiz só tem o
  pacote antigo — o build real fica em
  `sploit-src/packages/opencode/dist/sploit-windows-x64` (é o `build.ts` que gera
  lá, e o `build-sploit.ps1` copia pra raiz) — erro meu de procurar no lugar
  errado, não bug; (3) G-idempotencia: scripts de diagnóstico da raiz agora leem
  `sploit.db` com fallback para o legado — funcionam em qualquer instalação, nova
  ou antiga.
- **Verificado**: `python scripts/saude.py` com saída real no histórico migrado;
  py_compile OK nos 3 scripts (saude/diagnostico/medicao); 4 testes
  `database-path.test.ts` + 2 do boot passam; typecheck monorepo 16/16. Commits:
  motor `c34739b` (Fase 4) + raiz `0598f13` (scripts) + `9c356df` (SPLOIT_STATE).
- **Pendente**: medição pós-mutações (G3+G4+G5) nas próximas sessões — baseline
  já medido (verificação 2,4%, grafo em centrais 0%).
- **Referências**: sploit-src/packages/core/src/database/database.ts,
  sploit-src/packages/opencode/src/index.ts, scripts/{saude,diagnostico,medicao_mutacoes}.py

## [2026-08-09] Desvinculação opencode → sploit — Fases 1 a 4 (IDs, binário, textos, DB)
- **Como raciocinei**: o usuário pediu para limpar o projeto e desvincular a
  identidade do opencode em 4 fases (IDs de serviço Effect → binário → textos →
  DB). Em cada fase usei o mesmo filtro de três níveis: (1) o que é **identidade
  do produto** (renomear: IDs `@opencode/`→`@sploit/`, binário `opencode`→`sploit`,
  user-agent, nomes de DB, comentários descritivos); (2) o que é **wire
  protocol/API externa** (não mexer: headers `x-opencode-*`, provider ID
  `opencode`, shim `@opencode-ai/plugin`, URLs funcionais `app.opencode.ai` etc.,
  env vars de flag `OPENCODE_DISABLE_*`); (3) o que é **lixo do upstream** (remover:
  pasta `github/` órfã com o bot de PR).
- **O que valeu a pena**: (1) na Fase 2 descobri no SDK JS que `launch("opencode")`
  lançava o binário que acabara de ser renomeado para `sploit`, e o log esperado
  (`opencode server listening`) não batia com o servidor (`sploit server
  listening`) — bug funcional real que a "limpeza cosmética" teria deixado passar;
  (2) a migração do DB (`opencode-*.db` → `sploit.db`) foi desenhada como **cópia
  idempotente no primeiro boot** (nunca move/remove o legado) — se o binário novo
  quebrar, o rollback automático do self-restart volta a usar o DB antigo intacto;
  (3) a decisão de onde rodar a migração passou pelo filtro "efeitos colaterais
  nos testes": o preload do core seta `OPENCODE_DB=:memory:` para isolar testes, e
  `Flag.OPENCODE_DB` é capturado no module load — por isso a decisão da flag foi
  movida para o chamador (entry `src/index.ts`) e a função ficou pura e testável
  (4 testes novos, incluindo idempotência e wal/shm preservados); (4) testes de
  integração do CLI isolam `HOME`/`XDG_DATA_HOME` no tmpdir — a migração no boot
  é no-op segura neles.
- **Verificado**: typecheck monorepo 16/16 OK; testes novos (global.test.ts
  corrigido, 4 da migração do DB, SDK 1/1) passam; falhas pré-existentes do core
  confirmadas (2) sem nenhuma nova; serve-process (2) e serve tests OK; build
  smoke `0.1.0-sploit` OK (backup criado; cópia do exe em uso — troca via
  self-restart pendente). Commits: `d9bd735` (Fase 1), `7ee5124`+`22333ec`
  (Fase 2), `5e5124b` (Fase 3), `e090090` (limpeza github/), `c34739b` (Fase 4).
- **Pendente**: self-restart para ativar o binário novo `sploit-windows-x64` +
  migração real do DB (`opencode-sploit.db` 182MB → `sploit.db`); validar `/saude`
  lendo o histórico migrado.
- **Referências**: sploit-src/packages/core/src/database/database.ts,
  sploit-src/packages/opencode/src/index.ts, sploit-src/packages/sdk/js/src/server.ts,
  sploit-src/packages/core/test/database-path.test.ts

## [2026-08-09] Revertida a compactação com small_model — volta ao big-pickle
- **Como raciocinei**: a flag `compaction.small_model` (Groq gpt-oss-120b) foi
  habilitada no `sploit.json`, mas em uso real a compactação falhava — "o contexto
  dá erro e a IA para de fazer" (Groq free tem limite de 8k TPM e não sustentou o
  prompt de compactação com âncoras). Em vez de insistir no A/B, o usuário pediu
  para voltar. Reversão limpa: `sploit.json` sem a flag + `sploit-src` de volta ao
  commit `2bbca6e` (reset do master com working tree limpo) + rebuild.
- **O que valeu a pena**: (1) a flag opt-in (default false) foi o que tornou a
  reversão trivial — sem código morto, só desligar; (2) reset do master no
  submodule em vez de `git revert` — histórico local limpo e o commit `5cbe9a1`
  continua recuperável se um dia o Groq aguentar a carga; (3) Constituição art. 6
  na prática: não deu certo → reverteu com evidência (erro real de contexto),
  sem teimosia.
- **Verificado**: typecheck opencode e core OK (exit 0); build smoke
  `0.1.0-sploit` OK (backup criado; cópia do exe em uso — troca no restart).
  Commits: `sploit: fix:` (config+memórias) + `sploit: chore:` (motor).
- **Pendente**: restart do Sploit (config não é hot-reloaded) para a compactação
  voltar a usar o big-pickle; swap do binário novo via self-restart.
- **Referências**: sploit.json, sploit-src/packages/opencode/src/session/compaction.ts

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

## [2026-08-11] Status vivo + subagentes do squad
- **Como raciocinei**: (1) para o dock mostrar "trabalhando de verdade" em vez
  de símbolos, o log de cada agente (squad/logs/*.log) já captura comando,
  edição, post e raciocínio — classei por regex no prório dock (2s) sem estado
  novo; (2) o usuário pediu que os agentes tivessem subagentes; descobri que a
  tool task já existe no motor e está em allow no sploit.json — provei em
  teste real (Bruno usou explore e mapeou server.js sozinho) e ensinei no
  prompt-contrato (montar_prompt passo 2b).
- **O que valeu a pena**: comparar o launch do Popen do squad.py com o run
  manual que funcionava — o DETACHED_PROCESS deixava o stdin inválido e o
  fstat do boot estourava EISDIR (o supervisor sem DETACHED funcionava).
  Removido + stdin=DEVNULL: squad.py run volta a funcionar.
- Genes reforçados: G-causaraiz, G-isolado.

## [2026-08-11] Modo Squad: papel auditor + ciclo de QA real
- **Como raciocinei**: o usuário perguntou como um squad se organizaria com um
  agente especialista (visual) ou um auditor. Em vez de só explicar, adicionei o
  Auditor no demo2 e demonstrei. O papel auditor no montar_prompt inverte a
  regra de "trabalhe SOMENTE na sua pasta": ele LE as pastas dos colegas, nao
  edita producao, e posta veredito (feito=aprovado, bloqueado=problemas).
- **O que valeu a pena**: o ciclo completo funcionou sozinho — Auditor achou 3
  problemas REAIS (200 em vez de 404 em server.js:131, teste de estatisticas
  fragil com historico=20, testes faltando) → bloqueou → o Coordenador passou a
  correcao ao Bruno → Bruno corrigiu (32 testes) → Auditor re-auditou e aprovou.
  E o Auditor registrou tudo na memoria propria (auditoria + re-auditoria).
  Isso prova o modelo: producao por especialidade + QA via quadro, sem
  nenhuma mudanca no motor — so prompt-contrato + o orquestrador que ja existia.
- Genes reforçados: G-verificacao, G-idempotencia (auditor rodou suite 2x).

## [2026-08-12] Modo continuo noturno - ciclo 1: dock do squad redesenhado (747a0b2)
- **Como raciocinei**: o usuario disse que VISUAL e a coisa mais importante e
  que quer uma "empresa de desenvolvimento no terminal" desde a criacao visual.
  Em vez de features novas, comecei pela beleza: redesenhei o SquadDock com
  cabecalho mission control (contadores vivos ●/✓/✕/○), spinner de pulso quando
  alguem trabalha, badge de papel colorido por funcao (auditoria=ambar,
  seguranca=vermelho, frontend=accent, backend=cyan), atividade em italico
  quando pensando/postando, rodape com ultimo post. Nada de bonecos (reprovado
  2x) - beleza via texto/cores/layout/movimento sutil.
- **O que valeu a pena**: o spinner de 500ms da vida ao time sem custo de I/O
  (o log continua a cada 2s; o frame so muda). Contadores no cabecalho dao a
  leitura instantanea do estado da "empresa". Typecheck tui exit 0; build
  smoke OK (backup criado; troca via self-restart).
- Genes reforçados: G-verificacao.

## [2026-08-12] Modo continuo noturno - ciclo 2: squad create (wizard visual) (d1dfcf0)
- **Como raciocinei**: o usuario quer criar o time de forma visual desde o
  comeco. Em vez de um formulario chato, fiz um wizard com personalidade:
  banner, perguntas coloridas passo a passo (pasta/nome/papel por agente),
  resumo do time em caixa com a cor unica de cada agente, confirmacao s/N
  antes de criar, e mensagem final com o time formado. O cancelamento nao
  cria nada (testado). Cores herdadas do PALETA/cor_agente do proprio squad
  para consistencia com o palco e o dock.
- **O que valeu a pena**: testar com stdin pipe (G-isolado) - 2 execucoes
  completas (sucesso + cancelamento) sem tocar projeto real. A validacao do
  dock no binario novo (TUI no demo2 aberta 25s+ sem crash, PID 18500) prova
  que o redesenho da fase A1 nao quebrou nada.
- Genes reforçados: G-isolado, G-verificacao.

## [2026-08-12] Modo continuo noturno - ciclo 3: agente de SEGURANCA (pentest) (aaa0952)
- **Como raciocinei**: o usuario disse que um agente que testa vulnerabilidades
  'abre infinitas variedades'. Reusei a estrutura do auditor generalizando o
  e_especialista: e_seguranca (segur/pentest/vulner no papel ou Seguranca no
  nome) com procedimento proprio - checklist de vulnerabilidades reais, probe
  de rotas com payloads maliciosos (servidor desanexado), veredito com
  severidades [CRITICA]/[ALTA]/[MEDIA]/[BAIXA].
- **O que valeu a pena**: o teste isolado dos 3 perfis (seguranca/auditor/
  producao) sem crossover antes do demo real. No demo2 o Seguranca auditou o
  backend de verdade e postou 4 achados reais com severidade (POST /preco sem
  limite de corpo = DoS, headers ausentes, /echo refletindo input, Content-Type
  nao validado) e atualizou a propria memoria. Curiosidade: o usuario (ou a
  janela do demo2 aberta) ja tinha criado Carla (visual) e Vita (vulnerabilidades)
  - o detector 'vulner' cobre a Vita tambem, entao ela passa a receber o
  procedimento de seguranca. Squad do demo2 com 6 agentes, check OK.
- Genes reforçados: G-verificacao, G-causaraiz (o Seguranca confirmou 404/estado
  antes de aprovar).
## [2026-08-12 00:20] Squad daily - a "empresa" acorda com standup (ciclo 4, fase C)
- **Como raciocinei**: as buscas de novidades 2026 renderam agent-town/Agentshire
  (social feed: cada agente publica um resumo diario do trabalho REAL), Microsoft
  Conductor (contexto explicito entre agentes) e TermUI/termcn (sparklines e
  badges como padrao de TUI bonito). O usuario reprovou bonecos 2x - a beleza
  aceita e texto/cores/layout. Entao a ideia adotada foi um STANDUP real: ler o
  quadro e destilar por agente (entregas/pendencias/bloqueios do dia + sparkline
  de atividade por hora), nao um feed fake.
- **O que valeu a pena**: (1) reuso total do infra existente - QUADRO_RE, parse_quadro,
  tarefa_pendente, cores_agentes, ansi, SIMBOLO - o daily e so uma leitura nova dos
  mesmos dados; (2) --data permite dia vazio ("nenhuma atividade hoje") e dia
  cheio; (3) licao do dia: console do tool e cp1252 e ─ estourou
  UnicodeEncodeError - sys.stdout.reconfigure(encoding="utf-8", errors="replace")
  no topo resolveu (vale para qualquer print unicode do squad.py); (4) pluralizacao
  do rodape era o detalhe que destoava ("1 pendencias").
- **Verificado**: py_compile OK; daily real no demo2 (30 entregas - 1 pendencia -
  1 bloqueio, 6 agentes, sparkline ▁▂█▂); dia vazio OK. Commit `1713c2a`.
## [2026-08-12 01:00] Sparkline 24h no dock (ciclo 5, fase C) - a 2a ideia da pesquisa
- **Como raciocinei**: a fase C adotou 2 ideias das buscas 2026 - o squad daily
  (ciclo 4, raiz) e o sparkline de atividade (TermUI/termcn), que e o toque
  "vivo" que o usuario ama: o rodape do dock agora mostra o pulso do time nas
  ultimas 24h em vez de so a data do ultimo post. Reusei a logica do daily
  (buckets por hora) mas com janela deslizante de 24h a partir do post mais
  recente - sempre cheio, sempre recente, strip de pontos iniciais.
- **O que valeu a pena**: (1) parse de data do quadro compartilhado no mesmo
  regex do squad.py (dd/mm/yyyy HH:MM); (2) type guard no filter para o TS
  aceitar `d is Date` (padrao do repo); (3) rodape do dock segue num texto so
  - mudanca minima, impacto visual alto.
- **Verificado**: typecheck tui exit 0; build smoke 0.1.0-sploit OK (backup
  criado; copia do exe em uso - troca via self-restart). Commit motor `c567368`.
- **Pendente**: ativar no binario via self-restart e validar visualmente no
  demo2 (o resto da fase C fecha com isso; fase D = painel do time/dashboard).
## [2026-08-12 01:40] Squad dashboard - o painel da empresa (fase D)
- **Como raciocinei**: a fase D pediu "relatorio bonito para o usuario ver ao
  acordar". O daily (ciclo 4) ja fazia o standup por agente; o dashboard sobe
  um degrau: banner com caixa (mesmo estilo do wizard create), visao geral
  (entregas/pendencias abertas/bloqueios/ultima atividade), card por agente com
  estado atual e ultimo post, sparkline 24h (helper compartilhado sparkline_24h)
  e timeline das entregas de hoje. --salvar grava squad/dashboard.md sem ANSI
  (regex de strip) para o usuario ler no celular/editor.
- **O que valeu a pena**: (1) reuso total: parse_quadro, estado_agente,
  tarefa_pendente, ultimo_post, cores_agentes, SIMBOLO, ESTADO_COR - dashboard
  e daily sao apenas leituras novas dos mesmos dados; (2) licao de Python:
  f-string aninhado com aspas escapadas e a sintaxe do 3.12+ - mais seguro
  extrair para variavel (pl_tot/pl_hoje, nome_pad); (3) alinhamento de coluna
  colorida: pad no texto PURO antes de aplicar o ansi() (se pad a string ja
  colorida, os escapes inflam o len).
- **Verificado**: py_compile OK; dashboard real no demo2 (32 entregas, 0 pendencias
  abertas, timeline com 10 posts do dia, sparkline ▁▃█▁); --salvar gerou
  squad/dashboard.md; commit raiz `a6e3f73`.
## [2026-08-12 02:10] Fase F+G: testes do squad.py + celebracao da fila
- **Como raciocinei**: a noite entregou muito codigo de script sem blindagem -
  o certo era testes. Criei scripts/squad_test.py (zero dependencias, assert
  puro, fixtures em tempdir) cobrindo parse, tarefas, estados, sparkline,
  daily, dashboard, perfis de prompt e validacoes. Depois, a ideia do
  "celebrate" do agent-town virou real: quando o supervisor detecta fila vazia
  sem orfas, posta do Coordenador a celebracao (N entregas - M bloqueios -
  dica do dashboard) - o dock mostra isso no rodape e a empresa "fecha o dia"
  sozinha.
- **O que valeu a pena**: (1) teste de unidade achou bug MEU, nao do codigo:
  passei o path do quadro ao parse_quadro (que espera o base) - 5 testes
  falhando por causa da chamada, nao da logica; (2) extrair postar_celebracao
  como helper tornou o teste possivel sem rodar o loop do supervisor;
  (3) redirecionar stdout com redirect_stdout e suficiente para assertions de
  saida (daily/dashboard).
- **Verificado**: py_compile OK; 12/12 testes passam (11 + celebracao);
  commit `4f923d5`.


## [2026-08-12 02:30] Incidente de encoding e licao L-utf8 (fase H)
- **Como raciocinei**: o diagnostico da fase H morreu no sync_genes com
  UnicodeDecodeError (byte 0x97 = em-dash cp1252) no NOTAS.md. Causa raiz: os
  appends da noite foram via Add-Content do PS 5.1, que grava em cp1252 por
  padrao, dentro de um arquivo UTF-8. O primeiro byte invalido estava exatamente
  no inicio da 1a nota da noite (62083) - o arquivo estava perfeito antes.
  Reparo: cabeca limpa via git (20384a3~1:NOTAS.md) + notas da noite reescritas
  em UTF-8 puro via Python. Licao gravada no APRENDIZADO (L-utf8).
- **O que valeu a pena**: (1) o git salvou o dia - a cabeca pre-noite estava
  intacta no commit anterior ao primeiro append; (2) a deteccao foi precisa:
  procurar o PRIMEIRO byte invalido (nao tentar decodificar tudo); (3) licao
  transformada em regra: append em UTF-8 sempre via Python open(a, utf-8) ou a
  tool de edicao, nunca Add-Content (como ja dizia para quadro.md).
- **Verificado**: NOTAS.md reconstruido (66144 bytes, utf-8 valido); diagnostico
  rodou ate o fim ([GENES] destilados, [OK] licoes na nuvem); medicacao real:
  verificacao pos-edicao 2,5% (baseline natural) -> 8,8% desde a ativacao das
  mutacoes e 5,3% na janela da noite; Graphify reindexado (28941 nos, 55870
  arestas, 2424 comunidades); genes: G-verificacao 27 obs, G-idempotencia 7.
  Commit `4f641b1`.
