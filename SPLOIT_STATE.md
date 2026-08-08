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

## Próximo passo

**Mudança de direção (usuário)** — **Iteração 7 (em curso)**.

O usuário rejeitou a profusão de comandos slash: "quanto mais /alguma coisa, mais ele se perde".
Nova filosofia de design: **auto-melhoria invisível** — lição se grava sozinha, aprovação vira
pergunta em linguagem natural, slash fica só para intenção do usuário (`/status`, `/ajuda`).

**Feito nesta sessão** (commit `3b3e2d8`):
- `APRENDIZADO.md` — memória coletiva de lições (viaja no git; lida como instruction em
  toda sessão via `sploit.json`; o PC2 que der `git pull` já nasce sabendo o que o PC1 aprendeu).
- `diagnostico.py` grava lições automaticamente (sem slash) quando a falha é disciplina
  e a lição já está no harness. Dedup por marcador `- **L-edit —` (cabeçalho, não menção solta).
- `AGENTS.md` atualizado: nunca exigir slash do usuário; perguntar "posso aplicar?" em PT-BR.

**Próximo passo**:
1. **Reiniciar o Sploit** (config não é hot-reloaded) para o APRENDIZADO.md entrar no contexto.
2. Na próxima sessão, rodar `/diagnostico` (com o fix de dedup do melh-11) para ver
   se as lições do harness (edit, read) e o melh-8 (grep acionável) reduziram falhas reais.
3. Testar o fluxo multi-PC: PC2 faz `git pull` e confere se APRENDIZADO.md aparece nas instructions.
4. Avaliar se novos defeitos HARNESS surgem no diagnóstico.

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
