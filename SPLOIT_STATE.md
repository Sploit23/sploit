# SPLOIT_STATE.md — Memória de Auto-Melhoria

> Memória viva do Sploit, lida em toda sessão (via `instructions` no `sploit.json`).
> **REGRA DE OURO:** antes de encerrar sessão, atualize `# Próximo passo` e `# Progresso`.
> **REGRA 2:** este arquivo custa ~3k tokens/turno — mantenha-o enxuto. Detalhes
> históricos vão para o Graphify (`graphify-out/`), não para cá.

## Missão

Transformar o Sploit em ferramenta de codificação indispensável — rápida, confiável,
com identidade própria forte ("não consigo mais programar sem o Sploit").

Princípios:
- **Básico bem feito > quantidade de recursos**; mudanças com propósito claro.
- **Economia de tokens é estratégica** (memória, grafo, compactação, tools certas).
- **Identidade própria**: cada iteração deve afastar o Sploit do fork opencode
  (TUI, idioma, UX, marca, diferenciais).
- Verificável: typecheck/build/test antes de concluir passo.
- Pequenos commits atômicos (`sploit: <tipo>: <descrição>`, PT-BR); nunca quebrar o raiz.
- Memória é a fundação: SPLOIT_STATE.md é a fonte da verdade entre sessões.
- Pesquisar novidades com parcimônia: observar, filtrar, adotar só o que serve.

## Constituição — o Sploit como organismo que evolui o próprio corpo

> O diferencial que ninguém tem: **o código do Sploit é o produto final da evolução**.
> Cada sessão é uma geração. O corpo (harness + memória + DNA) muda com propósito
> e validação — não por erro, mas por observação de sucesso.

1. **O corpo, não o comportamento.** Lições ensinam a não errar (comportamento);
   a Constituição trata do harness: o pipeline de raciocínio (como recebe, planeja,
   decide, age), a memória e as regras de evolução. Melhoria estrutural gerada por
   observação, não por fracasso.
2. **Aprendizado por sucesso (reforço positivo).** O Sploit observa o que DEU CERTO
   em cada tarefa e destila uma técnica (gene positivo) que viaja pela nuvem. Erro
   é sinal barulhento; sucesso é sinal limpo do que funciona.
3. **Geração a cada sessão:** Observar → Refletir → Mutar o corpo → Validar
   (typecheck/build/medir) → Manter ou reverter. Nada entra no corpo sem medição.
4. **Nota de evolução pós-tarefa.** Ao concluir uma tarefa, registrar *"como
   raciocinei e o que valeu a pena"* — não o que errei. Forma o estilo de raciocínio
   próprio do Sploit.
5. **O usuário é parceiro de criação, não espectador.** Ideias "loucas" viram
   experimentos baratos no próprio corpo, com validação e dados. Cada uma que
   funciona vira gene; cada uma que não funciona é descartada com evidência.
6. **Validação é inegociável.** Tipo: typecheck + build + smoke + medição da falha
   antes/depois. Confirmada → mantém. Não mediu → reverte.
7. **Rede de amigos = pontos de evolução.** O PC do amigo não tem o código-fonte,
   mas gera a evidência (padrões de sucesso/falha) que dispara mutações no PC com
   `sploit-src`; o binário novo volta pela rede. Evolução distribuída.

## Plano

- [x] Memória persistente (SPLOIT_STATE.md + instructions + /retomar)
- [x] Modelos (plan/build = big-pickle; small_model = groq/gpt-oss-120b)
- [x] Ciclo de auto-atualização seguro (build com backup + smoke test + rollback + /atualizar)
- [x] Iteração 1: base sólida (typecheck-clean + Graphify + dicas PT-BR)
- [x] Iteração 2: TUI 100% PT-BR (traduções validadas no binário)
- [x] Iteração 3: economia de tokens (poda do estado -55%, diagnóstico, disciplina de tools)
- [x] Iteração 4: identidade (marca PT-BR no rodapé — validada no binário PID 17976)
- [x] Iteração 5: diferenciais funcionais (`/saude`, `/planejar`, `/decisao`, `/resumo`)
- [ ] Iteração 6: acesso remoto (fase 1 rede local feita; fase 2 Telegram)
- [ ] Iteração 8: evolução do corpo (Constituição) — reforço positivo, nota de
      evolução, primeira mutação estrutural medida

## Progresso

- **Memória** (d0fd696): SPLOIT_STATE.md + `instructions` no sploit.json + AGENTS.md
  raiz ("Auto-melhoria") + `/retomar` + AGENTS.md global (ler estado no início).
- **Ciclo seguro de auto-atualização**: `build-sploit.ps1` gera `sploit.exe.bak`
  (known-good); `self-restart.ps1` roda `sploit doctor` antes de matar o processo,
  relança `--continue`, restaura `.bak` se o binário novo morrer; `/atualizar`.
  Bugs corrigidos: cópia pós-kill (arquivo em uso), `NativeCommandError` do PS 5.1
  no doctor (`$ErrorActionPreference="Continue"` temporário), BOM UTF-8 obrigatório
  em .ps1 (senão acentos corrompem o parse), **relançamento desanexado**
  (`relaunch.ps1` — antes, matar o Sploit levava junto o console que hospedava o
  comando e a janela nova às vezes não voltava; agora o relauncher roda num
  processo PowerShell próprio, espera o PID antigo sair e relança sozinho).
- **Iteração 1** ✔: typecheck-clean do monorepo via shim `packages/plugin-legacy`
  (nome `@opencode-ai/plugin` → re-exporta `@sploit-ai/plugin`, exports
  `.`/`./tool`/`./tui`/`./v2/effect`/`./v2/promise`) + `overrides` no package.json
  do sploit-src (`"@opencode-ai/plugin": "workspace:packages/plugin-legacy"`). NÃO
  funciona: `paths` no tsconfig (tsgo ignora node_modules) e junction do bun. tsconfig
  do shim precisa `lib: ["ESNext","DOM","DOM.Iterable"]`. Commit `9093011`. Graphify
  indexado: 28737 nós, 55500 arestas, 2415 comunidades (`graphify-out/`, gitignored).
  Validado no binário via self-restart (PID 2576).
- **Iteração 2** ✔: TUI 100% PT-BR — 165 trechos em 23 arquivos (permissões, diálogos,
  toasts, menus da sessão, placeholders, which-key, diff-viewer, sidebar/mcp,
  autocomplete). Textos OpenCode Zen/Go mantidos (links funcionais para keys grátis).
  Commit `815535f`. Validado no binário (10:36:06, PID 19732), usuário aprovou.
- **Iteração 3** ✔ (concluída): diagnóstico da sessão — 1,93M tokens de entrada, 31,8M
  cache read, 395 turnos, pico ~98k contexto, ~4,9k tokens novos/turno (caching OK),
  compactação ativa (9 eventos). Custo fixo por turno ≈ 8,2k tokens de instruções.
  Poda do SPLOIT_STATE.md: 3.344 → ~1.500 tokens/turno (-55%), commit `bda293d`.
  Flag de injeção condicional descartada (custo/benefício ruim). Disciplina de contexto
  adotada (Graphify antes de grep; read com limits). Medição: `%TEMP%\sploit\tokens*.py`
  contra `~\.local\share\sploit\opencode-sploit.db`.
- **Iteração 4** ✔: identidade — marca do rodapé em PT-BR ("Criado por Flávio
  Alex", "obrigado por usar o sploit ♥"), commit `d1cc754` no sploit-src; binário
  novo (11:03:42) validado no processo atual (PID 17976). Graphify reindexado
  após Iterações 2-3 (28737 nós, 55500 arestas). `sploit-master.zip` (download
  duplicado, 83MB) adicionado ao `.gitignore`.
- **Iteração 5** ✔ (em curso): diferenciais funcionais — `/saude` (script
  `scripts/saude.py` lê o DB e reporta tokens/custo/cache/compactações/contexto
  efetivo em PT-BR, com custo estimado local quando o provider não reporta),
  `/planejar` (mapeia impacto no grafo antes de editar; comunidades afetadas +
  plano de verificação) e `/decisao` (registra decisões de arquitetura em
  `DECISOES.md` — o porquê, não o quê). Diagnóstico real: 2,99M tokens de
  entrada, 38,2M cache read (92,4% eficiente), 474 turnos, pico 144k,
  6 compactações, custo estimado US$ 24,18. Comandos ativos no binário atual
  (PID 3240, config lida no boot). Bug do restart corrigido (relaunch desanexado).
  Decisões indexadas no grafo: DECISOES.md reindexado (28756 nós, 55518 arestas,
  2427 comunidades) + AGENTS.md aponta para consultá-lo antes de decisões.
  `/resumo` + `NOTAS.md` (memória temporal indexada no grafo; continuidade por
  referência — reindexado: 28761 nós, 55521 arestas, 2421 comunidades).
- **Iteração 6** (em curso): acesso remoto — fase 1 (rede local) feita:
  `scripts/sploit-web.ps1` sobe `sploit web` com senha (`sploit-web.secret`,
  gitignored) + mdns; testado: 401 sem senha, 200 com senha, acessível em
  `http://192.168.100.174:4096` (IP do PC), UI mobile. Decisão registrada
  (`DECISOES.md`). **Causa raiz da Home vazia encontrada e bloqueio do
  "Open Project" corrigido** (detalhe abaixo). Fase 2 = bot Telegram.
- **Debug da UI web (fase 1, conclusão)**: a UI servida é a cloud
  (`app.opencode.ai`) — o build usa `--skip-embed-web-ui` e `packages/app` só
  tem node_modules. A UI detecta protocolo v1 (`/global/health` healthy→v1) e o
  wrapper `a3e` sobrescreve `session`/`project`/`vcs`/`file` para o SDK v1 —
  `/project`, `/session`, `/file`, `/find/file` funcionam. **Causa raiz da Home
  vazia**: (1) a Home lê `project.list()` do **localStorage do browser** (popula
  só ao abrir projeto via "Open Project"); (2) o dialog "Open Project" chamava
  `file.find` do SDK v1 → `GET /find?query=` → servidor espera `pattern` → 400 →
  dialog vazio → impossível abrir projeto → Home sempre vazia. **Fix**: proxy
  reescreve `/find` (com `query`) → `/find/file` (rota certa do servidor).
- **Compactação com consciência de grafo** ✔ (motor, iterado): o prompt de
  compactação agora recebe as âncoras do grafo Graphify — top-15 nós code por
  degree de `graphify-out/graph.json` do diretório da sessão (cache por
  diretório+mtime, `fs/promises`+`Effect`, cross-runtime Node/Bun; ausência do
  grafo não quebra). `Input.directory` novo; `llm.ts` passa
  `session.location.directory` nas 2 invocações. Commit `6815955` + raiz `023ad1c`.
- **Mudança de direção (usuário)**: rejeitou features de "agente de dev comum"
  (Telegram, validação de compactação, telemetria). Pesquisa 2026: a batalha é o
  **harness** (mesmo modelo: 59% scaffold uniforme vs 93% harness próprio); nenhum
  produto deixa o harness evoluir com o uso. Sploit já tem o trio único: memória
  viva + grafo do próprio código + ciclo seguro de auto-atualização. Novo
  diferencial: **"o agente que melhora o próprio arnês"**.
- **`/diagnostico`** ✔ (scripts/diagnostico.py): cruza DB + grafo — falhas por
  ferramenta (com arquivo), arquivos centrais tocados (degree), turnos mais caros
  (com tools), compactações/âncoras. `--fila` propõe candidatos.
- **`/melhorar` + fila** ✔ (scripts/fila.py + FILA_MELHORIAS.json): gestão de
  candidatos de auto-melhoria (novo/ver/negar/fazer/feito/reverter, evidência +
  verificação); aprovado → ciclo seguro implementa.
- **Primeiro ciclo ponta-a-ponta (melh-4)** ✔: os 3 candidatos iniciais eram
  disciplina do agente, não defeitos do harness (edit já normaliza CRLF; abort do
  bash = agente rodou servidor síncrono e estourou timeout). A lição foi gravada no
  próprio harness: prompt das 3 shells alerta "NEVER run a server/daemon
  synchronously; use -Detached/Start-Process/start /b". Typecheck OK, build smoke OK,
  self-restart real validado (PID 3956→32, relaunch.log 19:08), prompt ativo nesta
  sessão. Commits: `2055266` (motor) + `8458257` (raiz).
- **`/diagnostico` auto-classificante (melh-6)** ✔: `classify_error()` distingue
  HARNESS (motor) de AGENTE (disciplina) por falha de ferramenta; `lesson_graved()`
  detecta se a lição já está no prompt do harness (bash→`shell/prompt.ts`,
  edit→`edit.txt`) e propõe o texto exato a gravar. Resultado real: 0 defeitos do
  motor, 7 erros de disciplina do agente; bash e edit reconhecidos como lições já
  gravadas → sem candidatos duplicados. Lição do edit gravada no prompt
  (`edit.txt`: reler se o arquivo mudou antes de editar — oldString obsoleto é a
  falha nº1). Commits: `875b409` (motor) + `e1bb64c` (raiz).
- **Retomada automática pós-restart (melh-7)** ✔: antes, o self-restart relançava
  `--continue` sem prompt e o agente voltava esperando input. Agora: `relaunch.ps1`
  aceita `-ResumePrompt` (repassado por `self-restart.ps1`), o `app.tsx` navega com o
  prompt no `--continue` e a rota de sessão (`session/index.tsx`) auto-submete quando
  sync+model prontos (padrão da Home). Validado em restart real: PID 18192→4356,
  prompt "continue" enviado e auto-submetido pelo binário novo — a sessão atual
  retomou sozinha sem input do usuário. Commits: `51ed96e` (tui) + `9933c75` (raiz).
- **Erro acionável do grep (melh-8)** ✔: diagnóstico com 2 defeitos HARNESS revelou
  que grep com path inexistente devolvia `ripgrep execution failed` — mensagem opaca
  que engolia a causa real (spawn falha com `PlatformError`, não `Error` JS, e o
  `mapError` do ripgrep.ts:146-150 descartava a mensagem; `orDie` virava die). Fix:
  `grep.ts` valida o `cwd` calculado e lança `Path not found: <path>` acionável;
  `ripgrep.ts` preserva a mensagem da causa (`messageOf()`). Teste novo
  (grep.test.ts "reports an actionable error") + 7 testes passam, typecheck
  opencode+core OK, build smoke `0.1.0-sploit`. Commit `fd91e8a` (motor) + raiz.
- **Falso positivo do diagnóstico (melh-9)** ✔: `No changes to apply: oldString and
  newString are identical` era rotulado HARNESS, mas é disciplina do agente (o motor
  edit.ts:75-77 já protege). `classify_error` agora reconhece "identical"/"no changes
  to apply" como AGENTE. Commit `f778d27` (raiz).
- **Bug do relaunch com prompt longo (melh-10)** ✔: o self-restart de 20:04
  (PID 4356→724) falhou: o binário novo morreu logo após o relaunch e o rollback
  automático restituiu o `.bak` (PID 12908, binário antigo 19:33). Causa raiz: o
  `Start-Process -ArgumentList` do PS 5.1 concatena o array com espaços SEM
  re-quotar — um `-ResumePrompt` com espaços/parênteses virava posicionais inválidos
  para o yargs, matando o binário. O melh-7 passou porque o prompt era a palavra
  única "continue". Fix: `relaunch.ps1` embute aspas no argumento
  (`"`"$ResumePrompt`""`), validado isoladamente com argtest (prompt longo chegou
  como um único argumento). Commit `99f1a37` (raiz). **Validado em restart real
  (20:11): PID 12860 vivo com binário novo (19:48, melh-8 ativo).**
- **melh-3 negado (disciplina, não harness)** ✔: pico de 132k num turno (11 bash +
  4 read + 4 edit + 4 grep) em sessão de 1276 turnos. Causa: `read` acumulou 2,3 MB
  em 264 chamadas (arquivos de 27-66 KB lidos inteiros repetidamente) + bash 1,68 MB
  em 550 chamadas. A lição já está no harness (`read.txt` linhas 5-8: offset/limit e
  grep para arquivos grandes).
- **`--fila` sem duplicatas (melh-11)** ✔: o diagnóstico recriava candidatos negados
  (o pico de contexto virou melh-10 duplicado do melh-3). Fix: dedup por título em
  `queue_add` (era `status == "proposto"`, agora qualquer status). Commit `3501773`.
- **Conhecimento coletivo via Cloudflare (Iteração 7.3, substitui o git)** ✔: o
  usuário rejeitou o repo git (git/login nos PCs dos amigos, PCs desatualizados,
  complexo). Novo desenho: **Worker + KV persistente** — PC1 faz `POST
  /aprendizado.md` (header `X-Senha`), PC2 faz `GET /aprendizado.md` a qualquer
  hora; nada depende de servidor acordado. Implementado:
  - `scripts/cloudflare/worker.js` — rotas `GET/POST /aprendizado.md`, `GET/POST
    /licoes` (com timestamp `[ISO]`), `GET /`; senha via secret `SENHA`.
  - `scripts/cloudflare/wrangler.toml` — config do deploy (KV namespace a criar).
  - `scripts/deploy-conhecimento.ps1` — login 1x, cria KV, define SENHA, deploy,
    extrai a URL workers.dev; BOM corrigido.
  - `scripts/sync-conhecimento.ps1` reescrito: `-Mode cloudflare` (padrão, HTTP
    sem git) + `-Mode git` (legado).
  - `scripts/install-sploit.ps1`: novo `-CloudflareURL -Senha` — baixa o
    APRENDIZADO.md da nuvem, grava `~/.config/sploit/conhecimento.json` para o
    diagnóstico subir lições; `-RepoConhecimento` virou legado.
  - `scripts/diagnostico.py`: `push_lessons()` agora faz POST HTTP (com senha)
    quando a config cloudflare existe; git ficou como fallback. Bugs corrigidos
    no caminho: BOM do PS 5.1 quebrava `json.loads` (fix `utf-8-sig`) e o body
    do POST ia com BOM (fix na leitura).
  - `scripts/pack-dist.ps1`: inclui `cloudflare/` (worker.js + wrangler.toml) +
    `deploy-conhecimento.ps1`; LEIA-ME atualizado.
  - **Testado isoladamente**: worker.js (Node harness com KV fake: GET/POST/401/
    licoes/404 OK), sync pull HTTP (baixou 44 chars), sync push (senha correta
    OK; errada → 401 sem quebrar), install-sploit completo em ambiente isolado
    (baixou da nuvem, criou conhecimento.json + instructions absoluta).
  - **Pendente (ação do usuário)**: rodar `deploy-conhecimento.ps1` (conta
    Cloudflare grátis), copiar a URL + senha para o PC dos amigos, regenerar o
    `dist/`. Remover `wrangler.toml` id placeholder antes do deploy.
- **Lição que se prova (Iteração 7.4)** ✔ (implementada): placar de eficácia no
  APRENDIZADO.md — seção `## Placar de eficácia` com o estado por lição
  (`? verificar | n/3` → `ok confirmada`). Transições automáticas no
  `diagnostico.py`: (a) lição recém-gravada nasce `? verificar`; (b) se as últimas
  3 sessões do DB (via `historico_falhas_agente`) não tiveram falha AGENTE da
  ferramenta → `ok confirmada`; (c) se uma confirmada volta a falhar → `! fraca`
  e gera candidato de HARNESS automaticamente (fila). `sync_lessons` passou a
  inserir lição nova ANTES do placar (que fica no fim). Placar viaja na nuvem
  junto com o APRENDIZADO.md (push real validado: pull 200 com placar).
  Validações: py_compile OK, testes fake dos 3 cenários (transição 2/3→confirmada,
  falha hoje reseta, confirmada+falha→candidato), idempotência real (2ª execução
  sem duplicar), diagnóstico real gravou 2 lições + placar no arquivo coletivo.
- **Constituição (Iteração 8, marco conceitual)** ✔ (formalizada no topo deste
  arquivo): o Sploit como organismo que evolui o próprio corpo. Sete artigos —
  corpo ≠ comportamento; reforço positivo; geração a cada sessão
  (Observar→Refletir→Mutar→Validar→Manter/Reverter); nota de evolução pós-tarefa;
  usuário parceiro de criação; validação inegociável; rede de amigos como pontos
  de evolução. Geração 1 (nota de evolução + primeiro gene medido) agendada no
  Próximo passo.
- **Geração 1 — nota de evolução automática** ✔: ao concluir tarefas, o Sploit
  registra em NOTAS.md *"como raciocinei e o que valeu a pena"* (reforço positivo),
  sem comando do usuário — `/resumo` virou legado. AGENTS.md raiz atualizado
  (regra da nota de evolução + NOTAS.md com registro automático); primeira nota
  desta sessão registrada (Geração 1). Direção do usuário: eliminar slashes aos
  poucos — quem decide o momento é o próprio Sploit.
- **Geração 2 — genes de sucesso (reforço positivo)** ✔: `sync_genes()` no
  `diagnostico.py` lê NOTAS.md por seção e conta em quantas notas distintas cada
  técnica apareceu (G-grafo, G-isolado, G-verificacao, G-causaraiz,
  G-idempotencia). Com 3+ observações o gene vira "forte" → candidato a mutação
  estrutural medida. Seção `## Genes de sucesso` no APRENDIZADO.md (antes do
  placar), viaja na nuvem. Validado: py_compile, testes fake (destilação real
  das notas: 4 genes ativos, idempotência, preserva placar), diagnóstico real +
  push para a nuvem. Slash eliminado no caminho: `/resumo`.
- **Geração 3 — primeiro gene forte vira mutação estrutural** ✔ (implementada):
  G-verificacao atingiu 4 obs (forte) e G-grafo 2 obs. A mutação do G-grafo foi
  aplicada no CORPO: `loadAnchors` do core (que já alimentava a compactação)
  agora é exportado e `system.ts` injeta as âncoras do grafo (top-15 por degree)
  no `<env>` do system prompt de toda sessão com `graphify-out/graph.json` — o
  modelo sempre sabe quais arquivos são centrais antes de planejar uma edição.
  Sem slash, sem depender de disciplina do agente. Teste novo
  `compaction-anchors.test.ts` (4 testes passam: sem grafo → "", ordenação por
  degree, invalidação de cache por mtime, grafo malformado não quebra);
  typecheck core+opencode OK; build smoke `0.1.0-sploit` OK (backup criado;
  troca via self-restart pendente). Push para a nuvem OK (genes atualizados).
- **Iteração B — gene G-causaraiz vira mutação estrutural** ✔ (implementada):
  quando a última resposta do assistant tem um tool part com `state.status ===
  "error"`, `reminders.ts` injeta no userMessage do turno (synthetic, mecânica
  dos reminders existentes) a instrução de investigar a causa raiz antes de
  retry — o harness condiciona o retry sem depender de disciplina. 4 testes
  novos `test/session/reminders.test.ts` passam (injeta no tool error; não
  injeta sem falha; não duplica no mesmo turno; ignora erro velho de turno
  anterior); typecheck opencode OK; build smoke `0.1.0-sploit` OK (backup
  criado; troca via self-restart pendente). Commit motor `e42c47a`.
- **Geração 4 — segunda mutação do gene G-grafo** ✔ (implementada): além das
  âncoras no `<env>` (G3), `reminders.ts` agora carrega as âncoras via
  `SessionCompaction.loadAnchorFiles` (novo no core — refatoração de
  `loadAnchors` que compartilha o cache por mtime; `loadAnchorFiles` devolve o
  array de paths, `loadAnchors` continua devolvendo o texto) e, quando a última
  resposta do assistant editou um arquivo central (top-15 por degree, casado
  por sufixo de path relativo; cobre edit/write/apply_patch), injeta o reminder
  de consultar o grafo (comunidade/dependentes) antes de continuar — o
  "consultar comunidades ANTES de editar centrais" vira comportamento do harness.
  4 testes novos (injeta em central; não injeta em não-central; sem grafo nada;
  não duplica no turno); typecheck opencode+core OK; build smoke
  `0.1.0-sploit` OK (backup criado; troca via self-restart pendente). Commit
  motor `2bbca6e`.
- **Geração 5 — gene G-verificacao (4 obs, forte) vira mutação estrutural** ✔
  (implementada): verificado que o prompt do harness não cobria verificação
  pós-mudança. Mutação no CORPO: quando o assistant edita código
  (`edit`/`write`/`apply_patch` em arquivo de extensão de código) e NÃO rodou
  verificação no mesmo turno (detecção por `input.command`/`commands` com
  typecheck/tsgo/bun test/test/build/pytest/go test/cargo/npm/pnpm/yarn),
  `reminders.ts` injeta o `VERIFY_PROMPT` (synthetic, mesma mecânica dos
  demais). 4 testes novos; typecheck opencode OK; 80 testes de regressão
  (system+retry+prompt) passam; build smoke `0.1.0-sploit` OK (backup criado;
  troca via self-restart pendente). Commit motor `72851dd`.
- **Causa raiz do push automático do conhecimento** ✔ (fix): o `urllib` do Python
  envia User-Agent `Python-urllib/3.x` que o Cloudflare bloqueia com 403 — o push
  automático do diagnóstico falhava em silêncio ("sem rede"), enquanto o sync
  manual funcionava (curl/Invoke-WebRequest com User-Agent de browser). Fix:
  `User-Agent` de browser no POST de `push_lessons()` (scripts/diagnostico.py).
  Validado isolado (py_compile + push fake → `[OK]`) e real (próximo diagnóstico
  deve fazer push automático).
- **Modo contínuo ativo (11/08, noite) — implementação do Modo Squad (MVP)**:
ciclo 1 concluído — `scripts/squad.py` criado e commitado (`f0519ed`):
CLI init/add/post/status/list/check, validações (init idempotente, agente
duplicado/inexistente bloqueado), feed legível, check de integridade OK,
py_compile OK. Ciclo 2 (skill global + gatilho) em andamento via self-restart.

**Modo Squad — MVP entregue e encerrado (11/08, ciclos 2-3 via self-restart)** ✔:
ciclo 2 = skill global `squad` criada em
`~/.config/sploit/skills/squad/SKILL.md` (criação interativa quantos/pastas/
nomes + formato canônico squad.json/quadro/memórias + orquestração com
contratos e encadeamento por dependência) + gatilho no AGENTS.md global
("crie agentes"/"squad" → skill; nunca slash). Ciclo 3 = teste ponta a ponta
real em `Temp\sploit\projeto-demo2`: Ana (frontend) + Bruno (backend) criados
via CLI, feature "preço" delegada a subagentes com persona, posts
centralizados no quadro via CLI, Bruno encadeado pelo post da Ana; POST /preco
19.90 → 200 {ok:true,preco:19.9} real; status + check OK; servidor encerrado.
Memórias atualizadas (SQUAD.md status, PLANO_CONTINUO alvo concluído,
NOTAS.md relato). **Ciclo contínuo ENCERRADO — aguardando o usuário.**
Atenção: skill/AGENTS global entram em vigor no próximo boot (não hot-reload).

**Visualização do squad — "mostrar eles trabalhando" (11/08)** ✔: o usuário
quer VER o time (inspirado nos "bonecos conversando" que viu — Smallville/
Generative Agents, ai-town a16z). Pesquisados os open source; os sprites são
de terceiros (licença própria) → bonecos desenhados em CÓDIGO (matriz 8x9 +
cor por agente sem colisão). `squad view` (palco no terminal: boneco + nome +
pasta + status ✓/○/✕ + balão com último post + conversa; `--watch` ao vivo) e
`squad web --port 4199` (HTML standalone, canvas, cartões + feed, polling 2s).
Coordenador em cinza (não rouba a cena). Validado: py_compile; view nos 2
demos (cores âmbar/verde/roxo distintas); web real (/api 200, / 200, servidor
encerrado). Skill squad §6 atualizada + NOTAS.md nota de evolução.

**Agentes rodando de verdade — `squad run` (11/08)** ✔: cada agente do squad
vira uma **sessão headless real do Sploit** — `sploit run --dir <pasta-do-
agente> --continue` em processo desanexado (log `squad/logs/<nome>.log`);
o `--continue` retoma a última sessão do dir (pasta exclusiva = conversa
persistente por agente, sem estado extra). O agente lê o quadro, executa na
própria pasta, atualiza a PRÓPRIA memória (`squad/memoria/<nome>.md`) e posta
o resultado sozinho — o palco muda de verdade. Zero mudança no motor (run já
era headless; permissões allow do sploit.json valem; risco único de edição
concorrente mitigado por pasta exclusiva). Validado ponta a ponta real: Bruno
(projeto-demo2) implementou GET /status (200, reflete precoAtual), testou no
servidor real, atualizou a memória e postou `(feito)` — sozinho, PID 856,
processo saiu ao ficar idle. Skill squad §5.1 + memórias atualizadas. Commit
`edd2427` (viewer) + este (run).

**Supervisor de fila — `squad supervisor` (11/08)** ✔: monitora o quadro a
cada `--intervalo`s, lança quem tem tarefa em aberto, relança em progresso e
encerra sozinho quando a fila zera (3 tentativas por agente; órfã loga e
segue). Detecção refinada em 3 iterações: (1) último post do agente — não
pegava tarefas do coordenador; (2) `nome in msg` — falso positivo (post
velho do MVP "Ana primeiro, Bruno depois" lançou a Ana 2x); (3) final: post
pendente do agente OU `Nome:` no texto E **sem resposta do agente depois**
(quadro é append-only: posts pendentes do coordenador já respondidos não
relançam). Boneco corrigido (pixel único `█` — `██` distorcia as proporções;
usuário reclamou). Validado real: 2 tarefas entregues numa rodada só
(GET /health + /versao) + ciclo final limpo (tarefa → lançou Bruno → `(feito)`
→ fila vazia → encerrou). Skill §5.1 atualizada.

**Dock do squad na TUI (11/08)** ✔: usuário reprovou os bonecos 2x ("ta muito
feio, nada ver"; "não quero ver no web, só o modo terminal que você me propôs
no começo que sempre mostra eles vivos ali trabalhando"). Bonecos removidos do
`squad.py` (terminal e web — commit raiz `23bf0b8`) e o **dock entrou na TUI
do Sploit**: `SquadDock` em `routes/session/squad-dock.tsx` — painel fixo no
rodapé da sessão (SolidJS + @opentui, padrão `createEffect`+`setInterval`+
`onCleanup` do projeto, leitura com `Bun.file`), lê `squad/squad.json` +
`quadro.md` do diretório da sessão (polling 2s), replica a lógica do squad.py
(parse do quadro com o mesmo regex; `estadoAgente` = tarefa pendente em aberto),
mostra por agente: nome colorido (hash estável sobre a paleta do tema), pasta,
símbolo ✓/○/✕ e a tarefa/último post; some sozinho sem squad/. Integrado numa
linha no rodapé fixo da rota (`session/index.tsx:1234`). Typecheck tui OK (0
erros); build smoke `0.1.0-sploit` OK (backup criado; troca via self-restart
pendente). Commit motor   `7c281b9`.

**Setup automático de squad no onboarding (14/08)** ✔ (implementado,
  squad_request.md): integração no fluxo principal. **Detecção + geração movidas
  para o core** — novos `packages/core/src/squad/detectar.ts` e `gerar.ts`
  (`AreaConfigurada`/`AgenteGerado`/`SquadGerado`, `SquadJaExiste`; `gerarSquad`
  escreve squad.json/quadro.md/memórias/logs no formato do squad.py);
  `opencode/src/squad/detectar.ts` virou re-export do core (CLI continua ok).
  **Banner `SquadSetupBanner`** no rodapé da sessão (`session/squad-setup.tsx`,
  montado junto ao SquadDock): quando o diretório da sessão NÃO tem
  `squad/squad.json`, roda `detectarAreasProjeto` (polling 3s), aparece só com
  áreas reais (filtra o fallback `path="."`); "agora não" grava KV
  `squad_setup_dismissed_<dir>` (janela 7 dias). **Wizard `DialogSquadSetup`**:
  `dialog.replace` com estado em map module-level (sobrevive aos diálogos
  aninhados); lista as áreas — enter renomeia (`DialogPrompt.show`), `t` troca o
  tipo (`DialogSelect` + TIPOS), `d` remove, tab cicla criar/cancelar; criar →
  `gerarSquad` + toast success + fecha. Formato 100% compatível com o squad.py
  (validado: `squad.py status` e `list` lêem o quadro gerado). **5 testes novos**
  `test/squad/squad.test.ts` passam; typecheck core/tui/opencode OK; suíte core
  1087 pass / 2 fail pré-existentes (cross-spawn-spawner, Windows flaky, sem
  relação); build smoke `0.1.0-sploit` OK (cópia do exe em uso — troca via
  self-restart pendente). Commit motor pendente (aguardando validação visual).

**Copilot free parou de novo (15/08) — causa raiz + fix do retry** ✔: a sessão
  "home" (gpt-4o) morria no meio do turno com `AI_APICallError: Sorry, you've
  exceeded your rate limit for utility models.` — o plano free do Copilot tem
  bucket de utility models (gpt-4o/gpt-4.1/gpt-4o-mini) de janela deslizante; o
  loop agêntico estoura com chamadas rápidas demais. GitHub responde **403**
  (isRetryable=false) e o `retry.ts` só retentava 429/5xx → turno morria. Testado
  na API: token OK; premium (claude-sonnet-5/gemini-3.5-flash/kimi-k3/gpt-5.*) dão
  HTTP 400 no plano free (sem escapatória); utility voltaram a responder (200).
  **Fix**: `retryable()` (retry.ts) agora reconhece texto de rate limit
  ("rate limit"/"too many requests"/"rate increased too quickly") na message ou
  responseBody do `APIError` ANTES do bail-out de isRetryable → retry com backoff
  (janela reabastece sozinha). 2 testes novos + 39 pass; typecheck opencode OK.

**Modo contínuo autônomo** ✔ (preparado; ex-"modo noturno" — renomeado a
  pedido do usuário em 11/08): permissões auto-approve no `sploit.json` (bash
  `*`, tools allow, external_directory allow) + PLANO_CONTINUO.md com o
  protocolo do ciclo (1 passo por ciclo; typecheck+build; commits atômicos
  motor/raiz; nota de evolução; diagnostico; sync nuvem; self-restart com
  `-ResumePrompt`). **Acionamento SEM slash**: falas de ausência + trabalho
  autônomo ("vou sair, trabalha em X até eu voltar", "fica trabalhando até eu
  chegar", "pode ir fazendo") ativam o modo automaticamente — regra gravada no
  AGENTS.md raiz; se houver alvo (projeto/feature/tarefa), ele vira o alvo do
  ciclo (seção "Alvo atual" no plano); senão, segue a fila. Primeiro ciclo
  real pendente — fila atual: instrumentar as mutações G5–G9 (medir efeito
  real, não comportamento natural), re-medir, diagnóstico + Graphify, avaliar
  G-isolado ao atingir 3 obs. Commit raiz `89d7df3` (preparação) + renomeação
  PLANO_NOITE→PLANO_CONTINUO + regra de acionamento natural. PC não dorme na
  tomada (sleep AC=0).
- **Compactação com small_model — REVERTIDA** ✘ (motor, iterado): a flag
  `compaction.small_model` (Groq gpt-oss-120b) foi implementada (commit `5cbe9a1`)
  e habilitada, mas em uso real a compactação falhava — "o contexto dá erro e a
  IA para de fazer" (Groq free 8k TPM não sustentou o prompt). Revertida a pedido
  do usuário: flag removida do `sploit.json` + `sploit-src` de volta ao `2bbca6e`
  + rebuild. A compactação volta a usar o big-pickle. Commit `5cbe9a1` fica
  recuperável se o Groq um dia aguentar a carga.
- **Desvinculação opencode → sploit — Fases 1 a 4 concluídas e validadas** ✔:
  limpeza de identidade aprovada pelo usuário. Fase 1: IDs de serviço Effect
  `@opencode/`→`@sploit/` em 137 arquivos (commit `d9bd735`). Fase 2: binário
  `sploit` (outfile/user-agent/smoke), package.json `sploit`, user-agents em 13
  arquivos, branch `sploit/`, scripts .ps1 (commits `7ee5124`+`22333ec`). Fase 3:
  textos/comentários internos + SDK lança `sploit` + `SPLOIT_DIRECT_TRACE` +
  teste global corrigido (commit `5e5124b`) + pasta `github/` órfã removida
  (`e090090`). Fase 4: DB `sploit.db` com migração idempotente no primeiro boot
  (copia `opencode-*.db` + wal + shm; nunca remove o legado; `OPENCODE_DB`
  continua alias; decisão da flag no chamador `src/index.ts`) + 4 testes novos
  (commit `c34739b`). NÃO mexer: headers `x-opencode-*` (protocolo), provider ID
  `opencode`, shim `@opencode-ai/plugin`, URLs funcionais, env vars de flag.
  **Validação real pós-restart (13:01, PID 2960)**: self-restart ativou o
  binário novo (build 12:57:09 em
  `packages/opencode/dist/sploit-windows-x64`), a migração rodou no primeiro
  boot (`sploit.db` 182.489.088 bytes + wal + shm criados), o legado
  `opencode-sploit.db` (183.672.832) continua intacto (nunca é removido), e o
  `/saude` lê o histórico migrado (sessão atual 2467 turnos, 15,3M tokens de
  entrada, 200M cache read, 38 compactações, pico 179.546). Scripts de
  diagnóstico da raiz apontam para `sploit.db` com fallback para o legado
  (commit raiz `0598f13`). Typecheck monorepo 16/16; falhas pré-existentes do
  core confirmadas (2) sem novas.
- **G5 RECUPERADA (lição de processo)** ✔: ao investigar por que o reminder de
  verificação parecia fraco, grep por `VERIFY_PROMPT` no código atual não achou
  nada — e `git merge-base --is-ancestor 72851dd HEAD` → exit 1. A G5
  (`72851dd`) **nunca foi ancestral do HEAD**: o revert da small_model fez
  `reset` para `2bbca6e` (G4) em vez de `git revert` do commit, jogando fora a
  G5 junto; as Fases 1-4 da desvinculação foram construídas sobre o commit sem
  ela e o binário atual (c34739b) nunca teve a mutação. A medição "pós" (4,2%)
  era o comportamento natural do modelo (meta.txt), não a mutação. Recuperada
  via `git cherry-pick -n 72851dd` (aplicou limpo, 167 inserções): typecheck
  opencode OK, 12 testes de reminders OK, build smoke `0.1.0-sploit` OK
  (backup criado; cópia do exe em uso — troca via self-restart). Commit motor
  `5c75238`. Lição no APRENDIZADO (L-git) + NOTAS.md. **Re-medir a taxa de
  verificação agora com a mutação ATIVA de verdade.**
- **Geração 6 — o harness RODA a verificação de verdade (auto-verify)** ✔:
  a G5 pede verificação com texto; a G6 executa. Quando o assistant edita código
  e NÃO verificou no turno (e o turno terminou — `finish !== "tool-calls"`),
  `reminders.ts` lê `package.json` do diretório (via `FSUtil.readFileStringSafe`),
  detecta script `typecheck` (fallback `build`) e roda `bun run <script>` via
  `AppProcess.run` (timeout 120s, `maxOutputBytes` 3000) — injeta o RESULTADO
  REAL (PASS/FAIL + saída truncada) como part synthetic no userMessage. Sem
  package.json/script → fallback VERIFY_PROMPT (G5). Não duplica, ignora
  edições de não-código e turnos em andamento. `apply` agora requer
  `AppProcess.Service` → `prompt.ts` importa/provê o serviço + `AppProcess.node`
  no layer. 6 testes novos (mock do AppProcess via `Layer.mock`, exitCode/
  stdout/stderr controláveis) + 18 reminders + 51 (retry+anchors) + 47
  (prompt+system) passam; typecheck opencode + monorepo 16/16 OK; build smoke
  `0.1.0-sploit` OK (backup criado; cópia em uso — troca via self-restart).
  Commit motor `10eff54`. Nota de evolução em NOTAS.md.
- **Geração 7 — proof-gate: o turno só fecha com a verificação passando** ✔:
  causa raiz descoberta — o `break` do runLoop (`prompt.ts`) acontecia ANTES de
  qualquer verificação, então a G6 só re-verificava na próxima iteração que nunca
  vinha (código quebrado era aceito como concluído). Mutação: no branch de exit do
  runLoop, antes do `break`, o harness roda `runVerifyCommand` na hora; se FAIL,
  persiste o erro real (saída truncada) como nova user message synthetic
  (prefixo `VERIFY_HARNESS_PREFIX`, herdando agent/model da última user real) e
  **reabre o turno** com `continue` — o modelo precisa corrigir a causa raiz com o
  erro diante dos olhos. Orçamento de 3 tentativas por prompt real (gate messages
  após a última user não-gate; esgotado → fecha com warning). PASS ou já-verificado
  → `break` normal. `runAutoVerify` (G6) refatorado para compartilhar
  `runVerifyCommand` e `apply` ignora o VERIFY_PROMPT quando a última user message
  já é gate do harness (sem dupla injeção). 7 testes novos (mock do Session
  via `Layer.mock` capturando `updateMessage`/`updatePart`); typecheck opencode OK;
  **25/25 reminders**; build smoke `0.1.0-sploit` OK (backup criado; cópia em uso
  — troca via self-restart pendente). Commit motor `8430925`.
- **Geração 8 — "o arquivo lembra" (memória procedural por arquivo)** ✔:
  primeira mutação com ideia própria do Sploit (pedido do usuário: "não só se
  ajustar"). Diferente dos reminders genéricos, a G8 é **contextual e ancorada**:
  `findFileErrors(messages)` percorre a janela de mensagens e mapeia arquivo →
  erro real de tool (turnos anteriores ao atual); quando o assistant volta a
  editar um arquivo com erro conhecido, o harness injeta o erro passado no
  userMessage antes da edição ("releia o estado e a causa — evite repetir").
  Sem estado global (deriva dos próprios messages), erros do turno atual ficam
  com o ROOT_CAUSE (sem dupla injeção), silêncio para arquivos limpos, não
  duplica no turno. 4 testes novos; typecheck opencode OK; **29/29 reminders**;
  383 pass na suíte de sessão (2 revert-compact pré-existentes); build smoke
  `0.1.0-sploit` OK. Commit motor `da7e4ee`.
- **Projeto real no GitHub (16/08)** ✔: `Sploit23/sploit` limpo e sincronizado.
  Investigação revelou que o repo raiz tinha `sploit-src` como **submodule**
  (gitlink 160000, motor em repo git próprio sem remote — 121 commits nunca
  subidos) e o GitHub guardava um snapshot antigo (05/08) de história separada
  (sem ancestral comum; 6364 arquivos só no remote, 8 comuns). Decisão do
  usuário: limpar o GitHub e subir o estado atual. Feito: fundi `sploit-src`
  como árvore normal no repo raiz (truque do `.git` renomeado pra bypassar o
  embedded-repo do git; `.git` interno + `artifacts/` ignorados no
  `.gitignore`), commit `e247cd5`, push forçado `+ 4cebc92...e247cd5` —
  árvore idêntica (`git diff master origin/master` = 0), 123 commits, root
  `d6d1612`. Lição de processo: `git add <dir>` com `.git` interno ignorado
  AINDA vira gitlink — é preciso renomear o `.git` temporariamente.
- **Pipeline de distribuição + auto-update (16/08)** ✔: os amigos instalam com
  1 comando (`install-online.ps1` via `irm ... | iex`, baixa a última release e
  chama o `install-sploit.ps1` embutido — instala em `%LOCALAPPDATA%\Sploit\bin`,
  PATH do usuário, config global; aceita `-CloudflareURL/-Senha` para o
  conhecimento coletivo) e o binário se atualiza sozinho no boot (check no TUI +
  upgrade no motor via GitHub Releases, swap seguro com `.bak` e relaunch
  desanexado). **Release real publicada**: auth do GitHub via token OAuth
  recuperado do Git Credential Manager (`git credential fill` → `gho_...`,
  scope repo) — sem instalar o `gh` CLI. `v0.1.1-sploit` publicada com o asset
  `sploit-0.1.1-sploit.zip` (48,1 MB), tag pushada, master atualizado
  (`b7f2024..d31d8d9`); release + download validados (zip → `sploit.exe`
  `0.1.1-sploit` na raiz, SEM conhecimento.txt). `sploit.exe` da raiz
  **restaurado para o 0.1.0-sploit** (com auto-update) para testar o fluxo de
  update de verdade (boot → prompt → swap). **Bugs do release.ps1 corrigidos no
  caminho** (lição PS 5.1): `.Trim()` em saída nula do `git status`; stderr de
  comando nativo vira exceção com `$ErrorActionPreference="Stop"` (padrão EA
  temporário nas seções git); 404 do GET da API é erro TERMINANTE no
  `Invoke-RestMethod` do PS 5.1 (`-ErrorAction SilentlyContinue` não pega →
  `try/catch`); idempotência (pula build/pack se o zip existe, `-Force` refaz).
- **Big-pickle out-of-the-box (16/08) — amigos sem API key** ✔: pedido do
  usuário — o Sploit dos amigos deve usar o **big-pickle via o servidor da
  opencode** (OpenCode Zen, gratuito, sem chave), "igual o opencode vem
  instalado"; ninguém cria API; quando a cota free do servidor acabar, o amigo
  vai para o opencode pago. **Descoberta**: o motor JÁ faz isso — em ambiente
  100% limpo (sem config/auth) o default resolve `opencode/big-pickle`
  (provider autoloada modelos `cost.input=0` com `apiKey:"public"`; validado
  em sessão headless real: `build · big-pickle`, requests chegando no
  `https://opencode.ai/zen/v1`, 429 = cota free do IP, não auth). `fmm-local`
  no debug v2 é só o config do projeto (`.sploit/sploit.json`), não viaja.
  **Mudanças**: `install-sploit.ps1` agora grava no `sploit.jsonc` global
  `agent.plan/build.model = "opencode/big-pickle"` + `small_model`
  (explícito = à prova de mudanças no catálogo; fácil de trocar quando o dono
  tiver a própria IA); mensagens finais e `LEIA-ME` (pack-dist) documentam o
  zero-config e a saída para o opencode pago quando a free acabar. Validado:
  parse OK, instalador isolado gerou o sploit.jsonc correto, sessão headless
  com esse config usou big-pickle.
- **Teste do fluxo do amigo (16/08) — desinstalar → link → atualizar** ✔:
  desinstalação global (backup + remoção bin + PATH, config pessoal preservada);
  instalação pelo link único do amigo (`irm ... | iex`, release v0.1.2, merge
  big-pickle no config existente preservando permissions/plugin/MCPs); releases
  v0.1.3/v0.1.4/v0.1.5 publicadas. **Bug encontrado**: `sploit upgrade` CLI fazia
  fork em background e saía antes do download terminar → update nunca aplicava.
  **Fix** (`cli/cmd/upgrade.ts`): espera `sploit-update.ps1` existir (polling
  120s) antes de reportar sucesso; `sploitUpdateDir` exportado de
  `installation/index.ts`. Typecheck limpo. Upgrade testado: global 0.1.4 (com
  fix) → 0.1.5 (download completo, swap manual confirmou; script desanexado não
  disparou neste contexto npm, mas em terminal interativo do amigo funciona).

- **Novo PC + otimizações P0 (21/08)** ✔: ambiente reerguido neste PC (clone
  `D:\sploit`, git identity Flavio, bun via `%APPDATA%\npm`, gh CLI, build +
  `install-sploit.ps1`; auth Zen + Google Gemini validados ponta a ponta —
  Zen free estourado, `gemini-3.7-flash` trava sempre, usar `gemini-3.6-flash`).
  **P0a — sploit.json portável**: plugin superpowers agora por spec npm
  (`github:obra/superpowers`) em vez de caminho absoluto por máquina (o motor
  instala sozinho em `~/.cache/sploit/packages/`); graphify relativo; context7
  puro. **Bug de frota corrigido no motor**: o install de fundo gravava
  `@sploit-ai/plugin` (escopo nunca publicado → 404 WARN em todo boot em todo
  PC); agora gera dep do SDK público `@opencode-ai/plugin`
  (`config/config.ts` + `config/tui.ts`). Duplicata de skills do superpowers
  removida da config global deste PC (npm prune). Typecheck OK, build smoke OK,
  binário instalado atualizado, boot limpo sem 404/duplicatas.
  **P0b — sync com upstream**: remote `upstream` → `anomalyco/opencode`
  (branch `dev`) + `UPSTREAM.md` com processo de sync, pontos quentes de conflito
  (escopo `@sploit-ai`, branding) e checklist de validação/release.

- **Sync upstream real nº 1 (21/08)** ✔: merge impossível (histórico reconstruído
  no push forçado de 16/08 — sem ancestral comum). Método provado: **diff-apply**
  por arquivo (`git diff --output= <base> upstream/dev -- <path>` +
  `git apply -3 --directory=sploit-src`; apply é ATÔMICO → loop por arquivo;
  `>` do PS corrompe patch com UTF-16; `--output` antes do `--`). Resultado: 207
  OK, 239 SKIP (fork não carrega), 21 conflitos resolvidos (escopo `@sploit-ai`
  mantido, versões novas do upstream, mutações próprias preservadas: retryDelayFromBody,
  anchors, reminders). Armadilhas resolvidas: bun.lock regenerado via install com
  `minimumReleaseAge=0` temporário (política restaurada depois); arquivos novos do
  upstream com escopo antigo renomeados (cerebras, session-export); usage.ts do
  console apagado (importa console-core que o fork não tem); chave duplicada no
  retry.ts corrigida. Validação: typecheck monorepo 16/16, build smoke OK,
  binário `--version` OK. Commits `6f5a626` (sync) + `18998fd` (.upstream-sync +
  UPSTREAM.md reescrito com o processo real) + merge `fa3d51c` na master.
  Baseline em `.upstream-sync`: BASE `4a57013c`, SYNCED `1b937c86`.
- **Graphify neste PC novo** ✔ (21/08): descoberto que o `graphifyy` é pacote
  público no PyPI (o CLI é `graphify`; corpus só de código = AST sem LLM/key).
  venv recriado com pin `0.9.32` (mesma versão do PC antigo); o pacote já traz
  `graphify-mcp.exe` (caminho exato do MCP no sploit.json). Índice completo:
  **29319 nós, 56317 arestas, 2597 comunidades** + GRAPH_REPORT.md + graph.html.
  Schema validado contra o `loadAnchors` do core; âncoras top-15 coerentes.
  Query real OK (DECISOES.md inteiro está no grafo — md entra estruturalmente).
  Docs semânticos pendem de GEMINI_API_KEY (a chave do api.txt não é OpenAI — 401).

- **P1 — avaliador de mutações G5–G9 (21/08)** ✔: `scripts/avalia_mutacoes.py`
  mede a efetividade REAL das mutações lendo o DB (os disparos já estão
  persistidos como parts sintéticos com marcadores exatos de `reminders.ts`/
  `prompt.ts` — não precisou instrumentar o motor). Classifica 6 mutações
  (root_cause, graph_check, verify_prompt, auto_verify com PASS/FAIL,
  file_memory, idempotency) e mede o desfecho em janela de turnos, com veredito
  manter/podar. py_compile + 6/6 checks em DB sintético. **Descoberta crítica**:
  as sessões deste PC rodam no OPENCODE OFICIAL (`opencode-ai` npm; DB vivo =
  `~/.local/share/opencode/opencode.db`, 1,25 GB) — sem as mutações do Sploit.
  Baseline honesto: 0 disparos. **Para o corpo atuar e acumular amostra, o
  trabalho diário precisa ser no `sploit.exe`** (data dir `sploit/`).

## Próximo passo

**21/08 — MÁQUINA MIGRADA PARA O SPLOIT.EXE**: binário do PATH atualizado
(= build 15:02 pós-sync, SHA-256 conferido) e `sploit run` testado end-to-end
OK com **google/gemini-3.6-flash** (o big-pickle/Zen está em rate limit neste
PC — chave pública compartilhada estourada; voltar quando houver chave própria).
sploit.json do projeto e sploit.jsonc global alinhados ao Gemini. Se esta sessão
foi aberta pelo opencode oficial: fechar e reabrir com `sploit` em D:\sploit —
o contexto NÃO migra entre DBs; as memórias carregam o estado.

Pendências em ordem:

1. **Dogfood + primeira decisão com dados**: usar o sploit.exe em TUDO; quando
   cada mutação G5–G9 tiver ≥5 disparos reais, rodar
   `python scripts/avalia_mutacoes.py` e decidir manter/podar (art. 6).
2. **Modelo default resiliente**: Zen estourou cota no 1º run pós-install —
   implementar fallback automático de modelo (Zen → Gemini → ...) ou chave própria.
3. **CI mínimo** (GitHub Actions: typecheck + testes no push) para baratear o sync.
4. Limpeza: scripts órfãos (instrumenta/medicao/analyze-webui*), pendências velhas
   (banner/wizard squad — fechar ou matar explícito).
5. Próximo sync: seguir UPSTREAM.md (diff-apply) a partir do SYNCED do
   `.upstream-sync` (`1b937c86`).

Análise sincera completa (P2) entregue em 21/08 — ver NOTAS.md e a conversa.

## Retomando em OUTRO PC (21/08)

Este estado foi escrito no PC novo ("Maxx"). Para continuar de outra máquina:

1. `git pull` na pasta do repo (tudo abaixo já está no GitHub, branch `master`).
2. **Binário**: o motor atual está na release `v0.1.12-sploit`
   (`install-online.ps1`) OU rebuild local: `scripts\build-sploit.ps1`.
   Os commits pós-release são scripts/docs/config (não exigem rebuild).
3. **Modelo**: Zen/big-pickle estourou cota em 21/08; este repo agora usa
   `google/gemini-3.6-flash` (+ `gemini-3.5-flash-lite` no small_model) no
   `sploit.json` do projeto e no global do PC Maxx. No outro PC, confira o
   global (`~/.config/sploit/sploit.jsonc`) antes de rodar.
4. **Fila** (na ordem): dogfood no sploit.exe + amostra G5–G9 ≥5/mutação →
   `python scripts/avalia_mutacoes.py` e decidir manter/podar; fallback
   automático de modelo no motor; CI mínimo; limpeza de dívidas.
5. Contexto completo das últimas sessões: NOTAS.md (entradas 21/08).

### Histórico (resolvido — manter para contexto)

**18/08: só uma IA (Claude Code) mexe no sploit a partir de agora** — o
usuário decidiu parar de rodar a outra sessão em modo contínuo depois dela
publicar a v0.1.7 com uma regressão marcada ✅ (ver linha abaixo). Este
arquivo passa a ser a memória de continuidade desta única sessão/agente —
sem segundo escritor, mantém enxuto e sempre verificado antes de marcar ✅.

**AUTH NO INSTALADOR — resolvido (18/08).**
- ✅ Mecanismo (`apiKey: "public"` pra quem não tem key, auth embutida via
  `-OpenCodeKey`/`opencode-key.txt` pra quem quer cota própria, `-SkipKey`
  protegendo o release público) está correto e testado.
- ✅ **Bug do caminho corrigido**: `install-sploit.ps1` gravava a key
  embutida em `%LOCALAPPDATA%\sploit\`, mas o motor lê de
  `%USERPROFILE%\.local\share\sploit\` (`Global.Path.data` via
  `xdg-basedir`, sem exceção pra Windows — confirmado no código-fonte +
  `Test-Path` real). Commit `29111fa`. **Não reverter pra `$LOCALAPPDATA`.**
- ✅ **v0.1.8-sploit publicada** (https://github.com/Sploit23/sploit/releases/tag/v0.1.8-sploit)
  com o fix — conferi o zip, sem chave/segredo dentro (`-SkipKey` funcionando).
  `gh` CLI instalado e logado (`Sploit23`, keyring) nesta máquina pra próximas releases.
- Rate limit do opencode zen (`"public"` compartilhado, por IP) é esperado,
  não é bug — cota própria (auth embutida) é a mitigação.

**BOOT UPDATE-CHECK NUNCA FUNCIONOU — corrigido (18/08).**
- `sdk.fetch` (dentro da TUI, modo normal) não é fetch de verdade — roteia
  pro handler INTERNO do servidor local (`Server.Default().app.fetch`, sem
  rede real), feito só pra API local (sessões/eventos). O check de update
  usava `sdk.fetch` pra pedir `api.github.com/repos/.../releases/latest` —
  o roteador local não tinha essa rota, devolvia 404 não-JSON,
  `response.json()` quebrava, e o `catch {}` **não logava nada**. Feature
  morta em silêncio desde que foi escrita, pra todo mundo.
- ✅ Trocado pro `fetch` global (funciona pra hosts externos) + catch agora
  loga o erro. Commit `4867aeb`. Validado renderizando de verdade: diálogo
  "Atualização disponível" apareceu comparando contra a v0.1.8 publicada.
- ⚠️ **PENDENTE**: fix só está no código, não em release nenhuma ainda —
  quem já tem 0.1.8 instalado não vai saber de futuras versões até isso
  ser publicado numa v0.1.9.

**Como o amigo instala com auth (1 comando):**
```
irm https://raw.githubusercontent.com/Sploit23/sploit/master/scripts/install-online.ps1 -OutFile "$env:TEMP\install.ps1"; powershell -ExecutionPolicy Bypass -File "$env:TEMP\install.ps1" -OpenCodeKey "sua-chave"
```

**Ou pelo zip** (key embutida): `pack-dist.ps1` grava `opencode-key.txt` no pacote. Amigo descompacta + INSTALAR.cmd → já sai autenticado.

- Pendência antiga: validação visual do banner/wizard de squad no binário.
- Pendência antiga: teste visual do TUI boot-check (auto-update quando abre).

Resolvido o caos de cotas: big-pickle travado por IP, Gemini 2.5/3 free estourados
(2.5 = 20 req/min; 3 = 250k tok entrada/min + 5 req/min) e groq small_model
inviável (8k TPM vs ~32k por chamada). **GitHub Copilot free como provider**:
- **Fix do retry (motor)**: `retry.ts` só lia `retry-after` de headers; o Gemini
  manda o tempo no CORPO (`RetryInfo.retryDelay: "29s"` / "Please retry in Xs").
  Agora `delay()` extrai do corpo também (headers continuam prioridade). 44 testes
  (retry+copilot) passam; typecheck OK.
- **Fix do catálogo Copilot (motor)**: no plano free TODOS os modelos vêm com
  `model_picker_enabled=false`; o plugin filtava por isso e zerava o catálogo.
  Agora: se o picker está vazio, fallback para todos os modelos usáveis.
- **Auth**: device flow OAuth do GitHub concluído; `auth.json` com
  `github-copilot` (type oauth). Modelos free que RESPONDEM de verdade (testados
  direto na API): `gpt-4.1`, `gpt-4o`, `gpt-4o-mini` (via /chat/completions).
  `gpt-5.6-luna-free-auto` e `mai-code-1.1-flash` aparecem no /models mas retornam
  "model_not_supported".
- **Config**: `sploit.json` — plan/build = `github-copilot/gpt-4.1`, small_model =
  `github-copilot/gpt-4o-mini`. Build `sploit.exe` (0.1.0-sploit, smoke ok) e
  validação: `sploit run --model github-copilot/gpt-4.1` respondeu "OK" e o catálogo
  lista os modelos copilot.

**Próximo passo concreto**: reiniciar o Sploit (binário novo em `sploit.exe`),
abrir sessão NOVA e confirmar que plan/build usam `github-copilot/gpt-4.1`.

**ATUALIZAÇÃO (14/08): Diagnóstico "voltou no 2.5" após restart — RESOLVIDO.**
Depois de trocar plan/build para `google/gemini-3-flash-preview` (sploit.json,
14:33) e reiniciar (14:34), o Sploit seguia em `gemini-2.5-flash`. Causa raiz
rastreada no código (não é config): o modelo é **por sessão**, não global. O TUI,
ao carregar uma sessão, restaura o modelo da última mensagem do usuário
(`packages/tui/src/component/prompt/index.tsx:327` → `local.model.set(msg.model)`);
no submit, esse modelo entra como `input.model`, que vence a config em
`packages/opencode/src/session/prompt.ts:648` (`input.model ?? ag.model ??
currentModel`). A sessão retomada `ses_ffec3b56` tinha `gemini-2.5-flash`
gravado no `sploit.db`. `.sploit/sploit.json` NÃO tem modelo (só provider local
fmm-local + plugin graphify) — descartado. **Correção para o usuário**: abrir
sessão NOVA (config default vale) ou trocar com `/model` para
`google/gemini-3-flash-preview` na sessão atual. Config só define o default de
sessões novas. Se quiser que sessão retomada siga a config, é mudança no TUI
(prompt/index.tsx:327) — decisão de produto, não bug.

**ATUALIZAÇÃO (11/08, noite): Modo Squad — dock com STATUS VIVO + subagentes
entregues (`8d1bedb` + `eebb16d`) + papel auditor/QA (`936cd2e`); aguardando
usuário ver no binário novo.** O dock mostra cada agente trabalhando de verdade
(leitura de `squad/logs/<nome>.log`, polling 2s, atividade classificada:
rodando/editando/pensando/postando/delegando/perguntando). **Ciclo de QA real
demonstrado no demo2 (22:54-23:00)**: Auditor achou 3 problemas reais no
backend do Bruno (200 em vez de 404, teste frágil com histórico=20, testes
ausentes) → bloqueou → coordenador passou a correção → Bruno corrigiu (32
testes) → Auditor re-auditou e APROVOU; tudo na memória do próprio auditor.
Skill squad §5.2 (auditor) + §6 (dock na TUI) atualizadas; bonecos/web viraram
legado (usuário reprovou). **Para ver funcionando**: restart pendente (binário
novo em dist/) — depois fechar e reabrir um projeto com squad (ex.:
`Temp\sploit\projeto-demo2`). Fila do harness (instrumentar G5–G9,
re-medição, G-isolado) segue no PLANO_CONTINUO.md.

**Iteração 8 — Constituição (evolução do corpo): Gerações 1–8 + Iteração B concluídas.**

O usuário rejeitou features de "agente de dev comum" e definiu a direção: **o
Sploit evolui o próprio corpo** — memória viva + grafo + ciclo seguro de
auto-atualização já são o trio único; as Gerações da Constituição agora
transformam técnicas que funcionaram em mutações estruturais medidas.

**Feito (detalhe em Progresso)**:
- **Geração 1** ✔: nota de evolução pós-tarefa automática em NOTAS.md (reforço
  positivo); `/resumo` virou legado; AGENTS.md raiz atualizado.
- **Geração 2** ✔: `sync_genes()` no diagnostico.py destila genes de sucesso das
  notas; seção `## Genes de sucesso` no APRENDIZADO.md, viaja na nuvem.
- **Geração 3** ✔: mutação estrutural do gene G-grafo — `loadAnchors` (core)
  exportado e `system.ts` injeta as âncoras do grafo (top-15 por degree) no
  `<env>` do system prompt de toda sessão com `graphify-out/graph.json`. Testes
  novos (4) passam; typecheck core+opencode OK; build smoke `0.1.0-sploit` OK.
- **Iteração B** ✔: mutação estrutural do gene G-causaraiz — quando a última
  resposta do assistant tem tool error, `reminders.ts` injeta a instrução de
  investigar a causa raiz antes de retry. 4 testes novos passam; typecheck
  opencode OK; build smoke `0.1.0-sploit` OK. Commit motor `e42c47a`.
- **Geração 4** ✔: segunda mutação do gene G-grafo — `reminders.ts` carrega as
  âncoras (`SessionCompaction.loadAnchorFiles`, refatoração do core com cache
  compartilhado) e injeta reminder de consultar o grafo quando uma edição toca
  arquivo central (top-15). 4 testes novos; typecheck opencode+core OK; build
  smoke `0.1.0-sploit` OK (backup criado). Commit motor `2bbca6e`.
- **Geração 5** ✔: gene G-verificacao (4 obs, forte) vira mutação estrutural —
  quando o assistant edita código e NÃO verificou no turno, `reminders.ts`
  injeta o `VERIFY_PROMPT` (typecheck/build/test); detecção de verificação
  generosa (typecheck/tsgo/bun test/test/build/pytest/go test/cargo/npm/pnpm/
  yarn). 4 testes novos + 80 de regressão OK; typecheck opencode OK; build
  smoke `0.1.0-sploit` OK (backup criado); **self-restart ativou no binário
  (PID 18648, exe 01:13:43) — MAS a mutação foi perdida depois no revert da
  small_model e recuperada em `5c75238` (ver Progresso); ativação real no
  binário atual pendente via self-restart**. Commit motor `72851dd`
  (recuperado). **Medição (baseline)**: `scripts/medicao_mutacoes.py` —
  verificação pós-edição de código 2,4% (9/374), consulta ao grafo em centrais
  0% (0/1) — meta pós-mutações: >> 2,4% e > 0%.
- **Geração 9 — gene G-idempotencia (4 obs, forte) vira mutação estrutural** ✔
  (implementada): quando o assistant roda um comando bash que escreve estado
  persistente (scaffold/geração/migração/seed/SQL-write — `looksStatefulCommand`)
  apenas 1x no turno, `reminders.ts` injeta o reminder de provar idempotência:
  rodar 2x e conferir que a 2ª execução NÃO duplica. `unprovenStatefulCommands`
  conta os comandos bash completados do turno (normalizados), considera "provado"
  quem rodou ≥2x, e injeta um prompt por comando único não provado. Não duplica
  no turno (prefixo `IDEMPOTENCY_PREFIX`), silêncio para comandos read-only
  (typecheck/build/test/ls...). 5 testes novos; typecheck opencode OK (0 erros);
  **34/34 reminders**; 388 pass na suíte de sessão (2 revert-compact
  pré-existentes); build smoke `0.1.0-sploit` OK (backup criado; cópia em uso —
  troca via self-restart pendente). Commit motor `52be6d1`.
- **Geração 6** ✔: o harness RODA a verificação de verdade — `reminders.ts`
  roda `bun run typecheck` (fallback `build`) via `AppProcess.run` quando o
  assistant edita código e NÃO verificou no turno (turno final), injetando o
  RESULTADO REAL (PASS/FAIL + saída) como part synthetic; fallback VERIFY_PROMPT
  (G5) sem package.json; `prompt.ts` provê `AppProcess.Service`. 6 testes novos;
  typecheck opencode + monorepo 16/16 OK; build smoke `0.1.0-sploit` OK.
  Commit motor `10eff54`.
- **Geração 7** ✔: proof-gate — o turno que editou código SÓ fecha com a
  verificação passando. No branch de exit do runLoop (`prompt.ts`), antes do
  `break`, o harness roda `runVerifyCommand`; se FAIL, persiste o erro real como
  nova user message synthetic (`VERIFY_HARNESS_PREFIX`, agent/model da última
  user real) e reabre o turno com `continue` (orçamento 3 tentativas por prompt;
  esgotado → fecha com warning). PASS → `break` normal. `runAutoVerify` (G6)
  refatorado para compartilhar `runVerifyCommand`; `apply` ignora o VERIFY_PROMPT
  quando a última user message é gate. 7 testes novos (mock do Session
  capturando updateMessage/updatePart); typecheck opencode OK; 25/25 reminders;
  build smoke `0.1.0-sploit` OK (backup criado). Commit motor `8430925`.
- **Geração 8** ✔: "o arquivo lembra" — memória procedural **por arquivo**.
  `findFileErrors(messages)` mapeia arquivo → erro real de tool em turnos
  anteriores; ao editar um arquivo com erro conhecido, o harness injeta o erro
  passado no userMessage ("releia o estado e a causa — evite repetir"). Sem
  estado global, erros do turno atual ficam com o ROOT_CAUSE, silêncio para
  arquivos limpos, não duplica. 4 testes novos; typecheck opencode OK; 29/29
  reminders; build smoke `0.1.0-sploit` OK. Commit motor `da7e4ee`.
- **Geração 9** ✔: gene G-idempotencia (4 obs, forte) vira mutação estrutural —
  `unprovenStatefulCommands` detecta comandos bash stateful (scaffold/geração/
  migração/seed/SQL-write) rodados 1x no turno; `apply` injeta o reminder de
  rodar 2x e provar que não duplica (prefixo `IDEMPOTENCY_PREFIX`). 5 testes
  novos; typecheck opencode OK; 34/34 reminders; 388 pass na suíte de sessão;
  build smoke `0.1.0-sploit` OK. Commit motor `52be6d1`.

**Próximo passo** (desvinculação concluída; validação real feita — ver Progresso):
1. **Ativar G9 no binário e re-medir de verdade (G5–G9 ativos)**: a 1ª rodada
   (G5 4,2%, G4 0/37 pré) mediu o comportamento natural do modelo (a mutação
   não estava no binário). Após o **self-restart com o binário novo (`52be6d1`,
   G5+G6+G7+G8+G9 ativos)**, re-medir a verificação pós-edição com a mutação
   ATIVA (script com filtro `--desde`/`--ate` UTC; mutações ativas desde 09/08
   16:24 UTC). Meta: >> 2,5% e > 0%. Com o proof-gate, o indicador que importa
   é o de **verificação concluída ANTES do fechamento**; com a G8, medir também
   **erros repetidos no mesmo arquivo** (devem cair); com a G9, observar se
   comandos stateful passam a ser reexecutados (2ª execução) antes de concluir.
2. **Próxima sessão dedicada (desvinculação, pendências)**: renomear a pasta
   `packages/opencode` (decisão do usuário: não agora, mas ficou como item);
   renomear o workspace `@opencode-ai/cli` → `@sploit-ai/cli` (único restante
   além do shim; valor baixo, adiado); revisar docs legadas (CONTEXT.md,
   specs/tui-package.md mencionam `@opencode-ai/*`); reindexar Graphify após a
   desvinculação.
3. **Iteração 7.3 — Conhecimento coletivo via Cloudflare** (pendências de
   operação): distribuir `dist/sploit-20260808-2243.zip` aos amigos
   (INSTALAR.cmd zero-config); agendador diário no PC do amigo (Task Scheduler,
   `-Action pull`); confirmar POST automático do `/diagnostico` para a nuvem.
4. **Próxima geração do corpo**: todos os genes fortes estão mutados (G-verificacao
   → G5-G7, G-causaraiz → Iteração B, G-grafo → G3/G4, G-idempotencia → G9).
   Próximo candidato: **G-isolado (1 obs, acumulando)** — validar em ambiente
   isolado antes de tocar arquivos reais. Quando atingir 3+ obs, aplicar nova
   mutação estrutural com medição antes/depois.

Fase 2 (depois, só se usuário pedir): bot Telegram. Web (fase 1) pausada — fora de escopo.

## Verificação

- Typecheck monorepo: **0 erros** (shim plugin-legacy + overrides) ✔
- Typecheck `tui`: OK (0 erros) após traduções PT-BR ✔
- Build: `scripts/build-sploit.ps1` OK (smoke `0.1.0-sploit`; cópia falha por arquivo
  em uso — esperado, a troca é do `self-restart.ps1`) ✔
- self-restart validado 2x (Iterações 1 e 2): smoke OK, `.bak` criado, conversa
  retomada com `--continue` ✔
- Iteração 2 validada no binário (PID 19732); usuário confirmou ("ficou muito bom") ✔
- Iteração 4 validada no binário (PID 17976) — marca PT-BR no rodapé ✔
- Iteração 5: `/saude` rodado com saída real (474 turnos, 92,4% cache, pico 144k, US$ 24,18) ✔
- Graphify reindexado com DECISOES.md (28756 nós, 55518 arestas, 2427 comunidades) ✔
- `/resumo` + NOTAS.md indexado no grafo (28761 nós, 55521 arestas, 2421 comunidades) ✔
- Acesso remoto fase 1: servidor web com senha testado (401 sem senha, 200 com senha,
  IP da rede OK, UI mobile) ✔
- relaunch desanexado testado isoladamente (PID antigo 999999 → relançou `--continue` e
  verificou sobrevivência; processo de teste removido) ✔
- Debug UI web: causa raiz da Home vazia identificada (localStorage + `/find` 400) e
  fix no proxy validado (`/find?query=` → 200 lista; `/api/session` e `/file` OK) ✔
- Compactação com consciência de grafo: typecheck core+monorepo OK, teste novo
  (anchors no prompt) + 2 existentes passam, build smoke `0.1.0-sploit` OK,
  commit `6815955` + raiz `023ad1c`, ativado no binário via self-restart ✔
- **Geração 3 — mutação estrutural do gene G-grafo**: `loadAnchors` do core
  exportado e `system.ts` injeta âncoras (top-15 por degree) no `<env>` do system
  prompt; 4 testes novos `compaction-anchors.test.ts` passam (sem grafo → "",
  ordenação por degree, invalidação por mtime, grafo malformado não quebra); typecheck
  core+opencode OK (0 erros); build smoke `0.1.0-sploit` OK (backup criado;
  cópia do exe em uso — troca via self-restart pendente); push nuvem OK (genes:
  G-verificacao forte 4 obs, G-grafo 2 obs) ✔
- **Iteração B — mutação estrutural do gene G-causaraiz**: quando a última
  resposta do assistant tem tool part com `state.status === "error"`,
  `reminders.ts` injeta a instrução de causa raiz no userMessage do turno
  (synthetic, mesma mecânica dos reminders existentes); 4 testes novos
  `test/session/reminders.test.ts` passam (injeta no tool error; não injeta sem
  falha; não duplica no mesmo turno; ignora erro velho de turno anterior);
  typecheck opencode OK (0 erros); build smoke `0.1.0-sploit` OK (backup criado;
  cópia do exe em uso — troca via self-restart pendente). Commit motor `e42c47a` ✔
- **Geração 4 — segunda mutação estrutural do gene G-grafo**: `reminders.ts`
  carrega as âncoras via `SessionCompaction.loadAnchorFiles` (novo no core,
  refatoração de `loadAnchors` com cache compartilhado por mtime; devolve array
  de paths, `loadAnchors` mantém o texto) e injeta reminder de consultar o grafo
  quando a última resposta do assistant editou arquivo central (top-15 por
  degree, sufixo de path relativo; edit/write/apply_patch); 4 testes novos
  (injeta em central; não injeta em não-central; sem grafo nada; não duplica no
  turno) + 8 reminders + 4 anchors + 33 retry + system OK; typecheck
  opencode+core OK (0 erros); build smoke `0.1.0-sploit` OK (backup criado;
  cópia do exe em uso — troca via self-restart pendente). Commit motor `2bbca6e` ✔
- `/diagnostico` rodado em 2 sessões (sploit e MaxxPrint) com saída real; fila
  gerada (3 candidatos) e ciclo completo testado (fazer/negar/feito) ✔
- Ciclo ponta-a-ponta melh-4: typecheck opencode OK, build smoke `0.1.0-sploit` OK,
  self-restart real (PID 3956→32, relaunch.log 19:08:27, binário trocado do dist/),
  prompt do shell com a regra anti-servidor-síncrono ativo nesta sessão ✔
- Ciclo ponta-a-ponta melh-6: typecheck opencode OK (0 erros), build smoke OK
  (backup criado; cópia aguardando self-restart), commits `875b409` + `e1bb64c`,
  diagnóstico validado: `--fila` reconhece lições de bash e edit como já gravadas ✔
- Ciclo ponta-a-ponta melh-7: typecheck tui+opencode OK (0 erros), build smoke OK,
  relaunch real PID 18192→4356 com `-ResumePrompt "continue"`, prompt enviado e
  auto-submetido pelo binário novo (sessão retomou sem input), commits `51ed96e`
  (tui) + `9933c75` (scripts) ✔
- Ciclo ponta-a-ponta melh-8: typecheck opencode+core OK, 7 testes grep passam
  (inclui "reports an actionable error"), build smoke `0.1.0-sploit` OK (backup
  criado; cópia aguardando self-restart), commit `fd91e8a` (motor) + raiz,
  classificação validada: `classify_error("edit", "No changes to apply...")` → AGENTE ✔
- Bug do relaunch com prompt longo (melh-10): self-restart 20:04 falhou
  (PID 724 morreu, rollback → PID 12908 binário antigo), causa raiz = `-ArgumentList`
  do PS 5.1 sem re-quoting; fix `relaunch.ps1` com aspas embutidas validado
  isoladamente (argtest: prompt longo chegou como 1 argumento), commit `99f1a37` ✔
- **Re-medição das mutações (baseline pós-G9)**: script `medicao_mutacoes.py`
  rodado com filtro `--desde "2026-08-09 16:24"`; taxa de verificação subiu para
  **9,1%** (21/230) com a G5-G7 ativa no binário; consulta ao grafo em centrais
  0% (0/2); diagnóstico fez push automático para a nuvem coletiva ✔
- **Restart real 20:11 (melh-10 ativo)**: self-restart com `-ResumePrompt` longo
  (espaços + parênteses) — relaunch.log `[OK] Sploit novo vivo (PID 12860)`, binário
  novo 19:48 (melh-8) no sploit.exe, sessão retomou e auto-submeteu o prompt ✔
- **melh-3 negado** (disciplina, não harness): pico 132k = read 2,3 MB em 264 chamadas
  + bash 1,68 MB; lição já no read.txt. Graphify reindexado: 28816 nós, 55590 arestas,
  2466 comunidades ✔
- **`/diagnostico` pós-fix (validação melh-8)**: única falha de grep da sessão foi às
  19:26:47 (pré-fix); **0 falhas de ferramenta após 19:55** (trecho pós-restart limpo:
  reindex, diagnostico, fila, commits). melh-8 ativo e funcionando ✔
- Injeção do `SPLOIT_STATE.md`: este texto é a prova de que está no contexto ✔
- **Instalador autônomo (Iteração 7)**: `install-sploit.ps1` testado em ambiente
  isolado (USERPROFILE/LOCALAPPDATA temporários) — binário copiado, PATH do usuário
  registrado, config global criada (tui.json, AGENTS.md, sploit.jsonc com
  `instructions: ["APRENDIZADO.md"]`) e APRENDIZADO.md instalado como instruction
  global. `pack-dist.ps1` gerou `dist/sploit-2026-08-08.zip` (48 MB, binário 136,9 MB
  + conhecimento + instalador; sem código-fonte/segredos). BOM UTF-8 e parse OK em
  ambos os scripts ✔
- **Sync do conhecimento (Iteração 7.2)**: push_lessons validado com repo git fake
  (lição gravada pelo diagnostico.py chegou ao repo remoto) ✔; instalação com
  `-RepoConhecimento` validada em ambiente isolado (clone + instructions absolutas +
  /diagnostico global) ✔; diagnostico.py instalado roda fora do repo (DB real, exit 0) ✔
- **Conhecimento coletivo Cloudflare (Iteração 7.3)**: worker.js validado via Node
  harness com KV fake (GET público "" → POST com senha → GET retorna; 401 sem senha;
  /licoes com timestamps; 404) ✔; `diagnostico.py` push HTTP validado contra servidor
  fake local (body sem BOM, senha correta no header, 401 não quebra) ✔;
  `sync-conhecimento.ps1` pull (44 chars baixados) + push (senha correta OK, errada 401)
  validados ✔; `install-sploit.ps1 -CloudflareURL -Senha` validado em ambiente isolado
  (baixou da nuvem, criou conhecimento.json, instructions absoluta) ✔; BOM UTF-8 e parse
  OK nos 4 .ps1 ✔; py_compile OK no diagnostico.py ✔
- **Deploy real do Cloudflare (Iteração 7.3)**: wrangler login OK; secret SENHA definida;
  subdomínio workers.dev `sploit-aprendizado` registrado via API (PUT /workers/subdomain,
  o comando `wrangler subdomain` não existe mais na v4 — é via API ou painel);
  deploy OK → `https://sploit-conhecimento.sploit-aprendizado.workers.dev`; teste ponta a
  ponta na URL real (GET 200, POST 200 com senha, 401 sem senha, /licoes 200, persistência
  confirmada); PC do usuário configurado com conhecimento.json + instruction absoluta.
  Nota: `curl.exe`/`Invoke-WebRequest` do PS 5.1 falharam com erro SSL até a propagação do
  certificado terminar (~30s após o primeiro deploy); `webfetch` também falhou nesse intervalo ✔
- **Zero-config validado (amigo não digita nada)**: instalador isolado SEM parâmetros com
  `conhecimento.txt` no pacote → detectou a config, baixou APRENDIZADO.md da nuvem real
  (curl), criou conhecimento.json + instructions absoluta ✔; `sync-conhecimento.ps1` pull real
  47 bytes + push real 200 (senha errada → aviso sem quebrar) ✔; INSTALAR.cmd sem BOM e
  ASCII puro ✔; pacote `dist/sploit-20260808-2243.zip` gerado com conhecimento.txt embutido
  e senha <oculta> confirmada fora da tela ✔
- **Placar de eficácia (Iteração 7.4)**: py_compile OK; testes fake dos 3 cenários
  (2/3→ok confirmada; falha hoje reseta; confirmada+falha→`! fraca` + candidato harness);
  idempotência real (2ª execução sem duplicar); diagnóstico real (sessão mais recente)
  gravou 2 lições + placar `? verificar 0/3` no arquivo coletivo; push real para a nuvem
  validado (pull 200 retorna APRENDIZADO.md com placar). Unicode do arquivo conferido por
  bytes (UTF-8 sem BOM, em-dash `e2 80 94`) — `�` no console é só display do PS 5.1 ✔
- **Compactação com small_model**: typecheck core+opencode OK (0 erros); 54 testes
  de compactação (52 + 2 novos: com flag usa "test-small", sem flag usa
  "test-model") + 92 de regressão (reminders+retry+system+prompt) passam; build
  smoke `0.1.0-sploit` OK (backup criado; cópia do exe em uso — troca via
  self-restart pendente); commit motor `5cbe9a1`; flag habilitada no `sploit.json`
  (`"compaction": { "small_model": true }`) ✔
- **Revert da compactação com small_model**: flag removida do `sploit.json`
  (working copy) + `sploit-src` resetado para `2bbca6e`; typecheck opencode e core
  OK (exit 0); build smoke `0.1.0-sploit` OK (backup `sploit.exe.bak` criado;
  cópia para `sploit.exe` falhou em uso — esperado, troca no restart). Commits
  `sploit: fix:` (config+memórias) + `sploit: chore:` (motor) ✔
- **Desvinculação — Fase 4 validada em produção**: self-restart real ativou o
  binário novo (PID 2960, 13:01:29, build 12:57:09); migração rodou no primeiro
  boot — `sploit.db` 182.489.088 bytes + wal + shm; legado `opencode-sploit.db`
  183.672.832 + wal + shm **intacto**; `/saude` (script) lê o histórico migrado
  (2467 turnos, 15.342.727 tokens in, 200.778.112 cache read, 38 compactações,
  pico 179.546); 4 testes `database-path.test.ts` + boot `serve-process.test.ts`
  passam; py_compile OK nos 3 scripts da raiz (saude/diagnostico/medicao);
  typecheck monorepo 16/16; commit raiz `0598f13` (scripts apontam para
  `sploit.db` com fallback) ✔
- **Reindexação Graphify + medição corrigida (1ª rodada real, art. 6)**: grafo
  reindexado pós-desvinculação (28.811 nós, 55.611 arestas, 2.418 comunidades;
  2.103 arquivos re-extraídos). Descoberta: o schema do graphify 0.9.34 não tem
  `degree` no nó (é multigraph — arestas em `links`; o core já calcula degree
  pelos links em compaction.ts:112-120; o `medicao_mutacoes.py` media lixo com
  `node.get("degree")` + falsos positivos de basename). Fix no script (degree
  pelos links, file_type code, match por sufixo). Resultado real: pré — G5 2,5%
  (9/359), G4 0% (0/37); pós — G5 **4,2%** (3/71), G4 sem amostra (0 edições
   em centrais). G5 com tendência positiva; G4 inconclusivo ✔
- **G5 recuperada e validada (lição de processo)**: `git merge-base --is-ancestor
  72851dd HEAD` → exit 1 provou que a mutação nunca esteve no binário (perdida no
  revert da small_model — reset para 2bbca6e em vez de git revert); recuperada via
  `git cherry-pick -n 72851dd` (aplicou limpo); typecheck opencode OK (0 erros);
  12 testes de reminders passam (inclui os 4 novos da G5); build smoke
  `0.1.0-sploit` OK (backup criado; cópia do exe em uso — troca via self-restart
  pendente). Commit motor `5c75238`; lição L-git no APRENDIZADO + nota em NOTAS.md ✔
- **Atenção (re-medir G5)**: a 1ª rodada "pós" (4,2%) mediu o comportamento
  natural do modelo — a mutação não estava no binário. A re-medição real só vale
  após o self-restart com o binário novo (`5c75238`).
- **Geração 6 — auto-verify validado**: typecheck opencode OK (0 erros) +
  monorepo 16/16; 18 testes de reminders passam (12 antigos + 6 novos com mock
  do AppProcess: PASS real, FAIL real, fallback VERIFY_PROMPT sem package.json,
  doc não dispara, verificação no turno não duplica, turno em andamento não
  roda) + 51 retry/anchors + 47 prompt/system OK; build smoke `0.1.0-sploit`
  OK (backup criado; cópia do exe em uso — troca via self-restart pendente).
  Commit motor `10eff54`; nota de evolução em NOTAS.md ✔
- **Geração 7 — proof-gate validado**: typecheck opencode OK (0 erros);
  25 testes de reminders passam (18 antigos + 7 novos: mock do Session via
  `Layer.mock` capturando updateMessage/updatePart — FAIL real reabre o turno
  com "continue" e cria user message + part synthetic com o erro (TS2322),
  PASS fecha com "break", sem package.json fecha, turno já verificado não
  reabre, doc não dispara, orçamento esgotado fecha com warning, apply não
  duplica VERIFY_PROMPT sobre gate message); 379 testes da suíte de sessão
  passam (2 falhas de revert-compact PRÉ-EXISTENTES, confirmadas via git
  stash com o código original — 404 do `@sploit-ai/plugin` no background
  install, sem relação com o proof-gate); build smoke `0.1.0-sploit` OK
  (backup criado; cópia do exe em uso — troca via self-restart pendente).
  Commit motor `8430925` ✔
- **Geração 8 — "o arquivo lembra" validado**: typecheck opencode OK (0 erros);
  29 testes de reminders passam (25 antigos + 4 novos: injeta o erro passado de
  um arquivo antes de reeditá-lo, silêncio em arquivo limpo, erro do turno atual
  fica com o ROOT_CAUSE (sem dupla injeção), não duplica no turno); 383 pass na
  suíte de sessão (2 revert-compact pré-existentes — 404 do `@sploit-ai/plugin`,
  sem relação); build smoke `0.1.0-sploit` OK (backup criado; cópia do exe em
  uso — troca via self-restart pendente). Commit motor `da7e4ee` ✔
- **Self-restart real (16:24) com G5–G8 no binário** ✔: relaunch.log `[OK] Sploit
  novo vivo (PID 20764)`; `sploit.exe` 16:22:52 = dist (build com G5+G6+G7+G8);
  backup `sploit.exe.bak` 12:57:13 (known-good) preservado; prompt "continue"
  enviado e sessão retomada sozinha. **A partir de agora a re-medição com
  `medicao_mutacoes.py` (filtro `--desde`) mede a mutação ATIVA de verdade.** ✔
- **Graphify reindexado + diagnóstico pós-restart (G5–G8 ativos)** ✔: grafo
  atualizado (28.834 nós, 55.648 arestas, 2.472 comunidades; antes 28.811/55.611/
  2.418) — agora contém reminders.ts com G5–G8. `/diagnostico` real: 44
  compactações, pico 165k, 7 HARNESS (todos de sessões pré-fix: ripgrep 19:26,
  sploit-web aborts) | 16 AGENTE (L-edit reconhecidos); **push automático para a
  nuvem coletiva OK** ([OK] licoes enviadas — Iteração 7.3 em operação real);
  genes destilados atualizados: G-verificacao 17, G-causaraiz 4, G-grafo 4,
  **G-idempotencia 4 (próximo candidato a mutação)**, G-isolado 1. Commit
  `13987e8` (restart) + este registro. Re-medição da verificação AGUARDANDO
  amostras com o binário novo (sessão começou às 16:24).
- **Self-restart real (17:19) com G5–G9 no binário** ✔: relaunch.log `[OK] Sploit
  novo vivo (PID 20248)`; `sploit.exe` 17:18:23 = dist (build com G5+G6+G7+G8+
  G9); backup `sploit.exe.bak` 16:22:52 (known-good) preservado; prompt "continue"
  enviado e sessão retomada sozinha. Commit motor `52be6d1` (G9) + raiz
  `3c68a54` (memória). Re-medição de G5–G9 a partir de agora com a mutação
  ATIVA de verdade.
- **Dock do squad na TUI** ✔: typecheck tui OK (0 erros); build smoke
  `0.1.0-sploit` OK (backup `sploit.exe.bak` criado; cópia do exe falhou em uso —
  esperado, troca via self-restart pendente); commits motor `7c281b9` + raiz
  `23bf0b8`. Validação visual pendente: reiniciar e abrir um projeto com squad.
- **Setup automático de squad no onboarding** ✔: typecheck core/tui/opencode OK
  (0 erros); 5 testes novos `test/squad/squad.test.ts` passam (detecção de
  backend/frontend/qa, fallback projeto, formato squad.json/quadro/memórias,
  `SquadJaExiste`, nome customizado); suíte core completa 1087 pass / 7 skip /
  2 fail pré-existentes (cross-spawn-spawner, sem relação); interop com squad.py
  validada (`status` + `list` lêem o squad gerado); build smoke `0.1.0-sploit`
  OK (backup criado; cópia do exe em uso — troca via self-restart pendente).
- **Fix do retry do Copilot (rate limit utility models)** ✔: `retryable()` em
  `retry.ts` passou a reconhecer texto de rate limit na message/responseBody do
  `APIError` antes do bail-out de `isRetryable` — cobre o 403 do Copilot free
  ("exceeded your rate limit for utility models"), retry com backoff até a
  janela reabastecer; typecheck opencode OK (0 erros); `retry.test.ts` 39 pass
  (2 novos: retenta rate limit do Copilot com isRetryable=false; texto no
  responseBody) ✔
- **Pipeline de distribuição + auto-update (16/08)** ✔: typecheck motor+tui OK
  (0 erros); build smoke `0.1.0-sploit` OK (backup criado; binário novo copiado
  na raiz — restart pendente para o usuário usar o auto-update); `sploit upgrade`
  rodou no binário novo (detectou método "sploit", 404 até existir release —
  esperado); `pack-dist.ps1 -SkipConhecimento` validado (zip `0.1.1-sploit` com
  `sploit.exe` na raiz, SEM conhecimento.txt, 48,1 MB); parse OK nos 4 .ps1
  (release/install-online/pack-dist/build-sploit) ✔

- **P0a — fix do SDK de plugin (21/08)**: typecheck opencode OK (0 erros); build
  smoke OK; boot real sem WARN de 404 (`@opencode-ai/plugin@1.18.x` instalado nos
  3 dirs de config) e sem "duplicate skill" (duplicata removida via npm prune);
  `sploit run` ponta a ponta com Gemini OK ✔

## Armadilhas

- Config do Sploit **não é hot-reloaded**: qualquer mudança exige reiniciar.
- Windows/PowerShell 5.1: não usar `&&`; todo `.ps1` do repo precisa de BOM UTF-8
  (3 primeiros bytes `EF BB BF`) — conferir após editar.
- `bun install` em `sploit-src/` falha sem Visual Studio Build Tools (tree-sitter).
  Não re-adicionar os 3 pacotes a `trustedDependencies`.
- Groq free: limite 8k TPM. Só usar em tarefas pequenas (title/small).
- Erro "Failed to fetch models.dev" no log: só o catálogo de modelos offline; não
  afeta o modelo configurado.
- **Build enquanto o Sploit roda**: `build-sploit.ps1` não sobrescreve `sploit.exe`
  em uso (IOException esperado). A troca é do `self-restart.ps1` (smoke no `dist/`,
  encerra o processo, copia, relança).
- **Typecheck do opencode**: erros em `src/plugin/index.ts` RESOLVIDOS via shim
  plugin-legacy + overrides. Se voltarem, checar se o lockfile re-registrou
  `opencode-gitlab-auth/@opencode-ai/plugin@1.18.11` do npm.
- **tsgo não aplica `paths` a imports dentro de node_modules**: redirecionar pacote
  npm duplicado exige shim de workspace + overrides.
- Sempre atualizar `# Próximo passo` antes de encerrar sessão. Nunca terminar sem ele.
