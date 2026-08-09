# PLANO_NOITE.md — Plano de evolução autônoma (modo noturno)

> Sessão autônoma: o usuário dormiu e vai interromper amanhã. O Sploit deve
> evoluir o próprio corpo com total liberdade, registrando tudo para o relato
> matinal. Este arquivo é a fila de trabalho + protocolo. É lido em cada
> ciclo do self-restart (via `--prompt`), então mantê-lo enxuto e atualizado.

## Protocolo do ciclo noturno

1. **Ao iniciar cada sessão** (após self-restart com `--continue --prompt`):
   - Ler `SPLOIT_STATE.md` (estado vivo) e este arquivo.
   - Ler `NOTAS.md` (última nota = onde a evolução parou).
2. **Executar UM passo da fila por ciclo** (uma mutação medida). Não misturar
   passos. Não fazer mudanças de config + motor no mesmo ciclo.
3. **Verificar sempre** (Constituição art. 6 — validação inegociável):
   `bun typecheck` no pacote afetado, testes quando existirem, e
   `scripts/build-sploit.ps1` (smoke `0.1.0-sploit` + backup). Nada entra no
   corpo sem medição.
4. **Commitar atômico em separado**: motor (`sploit-src/`) e raiz (memórias).
   Mensagens PT-BR: `sploit: <tipo>: <descrição>` / `<tipo>(<escopo>): ...`.
5. **Registrar a nota de evolução** em `NOTAS.md` (Como raciocinei / O que
   valeu a pena / Verificado / Pendente) e atualizar `SPLOIT_STATE.md`
   (Progresso + Próximo passo) ANTES de encerrar o ciclo.
6. **Atualizar os genes** (rodar `python scripts/diagnostico.py` — ele destila
   genes das notas e dá o push para a nuvem automaticamente quando há rede).
7. **Sincronizar conhecimento**: se o diagnóstico não deu push (sem rede),
   rodar `scripts/sync-conhecimento.ps1` com a config em
   `~/.config/sploit/conhecimento.json`.
8. **Reindexar o Graphify** após mudanças relevantes de código
   (`venv\Scripts\graphify.exe update <caminho>`).
9. **Disparar o próximo ciclo**: `scripts/self-restart.ps1 -ResumePrompt
   "<o que fazer no próximo ciclo>"` — o relaunch troca o binário novo,
   relança `--continue` e envia o prompt sozinho. Nunca usar `-SkipSmoke`.
10. **Critério de parada**: parar quando a fila abaixo estiver vazia OU quando
    um passo falhar 2x (documentar a falha, marcar como pendente/adiado e
    parar o ciclo noturno para o usuário decidir amanhã). Depois de parar,
    garantir `SPLOIT_STATE.md` atualizado com "ciclo noturno encerrado" e o
    relato do que foi aprendido.

## Regras de segurança do modo noturno

- Nunca pedir input ao usuário (question/confirmação). Se algo exigir decisão
  humana, documentar no estado e seguir para o próximo passo ou parar.
- Não tocar em segredos: `APIKEY.txt`, `sploit-web.secret`, senhas em
  `conhecimento.json` nunca vão para git nem para logs.
- Não commitar `sploit.exe`, `venv/`, `graphify-out/`.
- Não desfazer decisões registradas em `DECISOES.md` sem evidência.
- Sempre deixar o working tree limpo ao final de cada ciclo.

## Fila de evolução (executar em ordem)

- [x] **Preparação**: permissões auto-approve no `sploit.json` (modo noturno) +
      plano criado. Config não é hot-reloaded — vale a partir do próximo
      self-restart (próximo ciclo).
- [x] **Ativar as mutações no binário** ✔ (ciclo 2, 00:34:56): self-restart
      relançou com o binário novo (G3 âncoras no `<env>` + Iteração B reminder
      de causa raiz) — relaunch.log `[OK] PID 4648`; processo atual (7312,
      boot 00:38:45) roda `sploit.exe` com mtime 00:30:39 = build com as duas
      mutações; permissões auto-approve do `sploit.json` ativas no boot.
- [ ] **Medição da Geração 3** (Constituição art. 6): comparar "arquivos
      centrais tocados x falhas" antes/depois da mutação. Manter se melhorar,
      reverter com evidência se não.
- [x] **Mutação G-causaraiz** ✔ (concluída no ciclo 1): quando a última resposta
      do assistant tem tool part com `state.status === "error"`, `reminders.ts`
      injeta a instrução de investigar a causa raiz antes do retry (synthetic,
      mecânica dos reminders existentes). 4 testes novos
      `test/session/reminders.test.ts` passam; typecheck opencode OK; build
      smoke `0.1.0-sploit` OK (backup criado; troca via self-restart). Commit
      motor `e42c47a` + raiz `b700b6a`. Medir: taxa de falhas repetidas
      antes/depois.
- [x] **G-grafo → consulta de comunidades antes de editar centrais** ✔
      (concluída no ciclo 3): `reminders.ts` agora carrega as âncoras do grafo
      (`SessionCompaction.loadAnchorFiles`, novo no core — refatoração de
      `loadAnchors` compartilhando o mesmo cache por mtime) e, quando a última
      resposta do assistant editou um arquivo central (alto degree, top-15),
      injeta o reminder de consultar o grafo (comunidade/dependentes) antes de
      continuar editando (synthetic, mesma mecânica dos demais). 4 testes novos
      (injeta em central; não injeta em não-central; sem grafo não injeta; não
      duplica) + 4 do compaction-anchors + 33 do retry + system OK; typecheck
      opencode e core OK; build smoke `0.1.0-sploit` OK (backup criado; troca
      via self-restart). Commit motor `2bbca6e`. Medir: edições em centrais que
      precedem consulta ao grafo.
- [x] **Verificar o push do conhecimento para a nuvem** ✔ (ciclo 3): causa raiz
      encontrada — o `urllib` do Python manda User-Agent `Python-urllib/3.x`,
      que o Cloudflare bloqueia com 403, então o push automático do diagnóstico
      falhava em silêncio ("sem rede"). Fix: `User-Agent` de browser no POST de
      `push_lessons()`. Validado isolado (py_compile + push fake → `[OK] licoes
      enviadas`) e real (diagnóstico com o fix). Push manual OK; nuvem restaurada
      com o conteúdo real após o teste.
- [x] **Rodar testes da suite do core/opencode** para detectar regressões da
      Geração 3 (pelo menos os novos `compaction-anchors.test.ts`) ✔ (ciclo 3):
      4 anchors + 8 reminders (4 G4 + 4 Iteração B) + 33 retry + system OK.
- [x] **Próxima geração (G-verificacao, 4 obs — forte)** ✔ (ciclo 4): verificado
      que o prompt do harness NÃO cobria verificação pós-mudança (grep em
      system.ts/prompt.ts/reminders.ts). Mutação aplicada no CORPO: quando o
      assistant edita código (extensões de código) sem verificar no mesmo turno,
      `reminders.ts` injeta o `VERIFY_PROMPT` (typecheck/build/test). 4 testes
      novos; typecheck opencode OK; 80 testes de regressão OK; build smoke
      `0.1.0-sploit` OK. Commit motor `72851dd`. Medir: edições de código x
      verificação rodada antes/depois.
- [x] **Compactação com small_model** ✔ (motor, ciclo 5): flag
      `compaction.small_model` (opt-in) — schema V1 + classe V2 + migrate +
      escolha do modelo em `opencode/src/session/compaction.ts` com fallback
      seguro (`Effect.catch`). 2 testes novos (com flag usa "test-small", sem
      flag usa "test-model"); 54 testes de compactação + 92 de regressão passam;
      typecheck core+opencode OK; build smoke `0.1.0-sploit` OK. Commit motor
      `5cbe9a1`. Flag habilitada no `sploit.json`. **Pendente**: self-restart
      para ativar no binário; medir custo/qualidade da compactação com o Groq
      (âncoras do grafo sobrevivem à compactação? custo por compactação vs.
      antes).

## Registro do ciclo 4 (concluído)

- **Geração 5 — G-verificacao** ✔: mutação estrutural (reminder de verificar após
  editar código sem verificação). Commit motor `72851dd`.
- **Testes** ✔: 12 reminders (4+4+4) + 80 regressão (system+retry+prompt), tudo OK.
- **Build** ✔: smoke `0.1.0-sploit` OK (backup criado; troca via self-restart).
- **Self-restart** ✔: PID 19844→18648, relaunch.log `[OK]`, exe 01:13:43 (G5 ativo).
- **Medição (Constituição art. 6) — baseline** ✔: `scripts/medicao_mutacoes.py`
  — edições de código: 374, verificadas em +3 turnos: **9 (2,4%)**; edições em
  centrais: 1, com grafo: **0 (0%)**; erros de tool: 17. Próximo passo: re-medir
  após N sessões com o binário novo e comparar.
- **Diagnóstico + push nuvem** ✔: `[OK] licoes enviadas para a nuvem coletiva`
  (fix do User-Agent validado em produção); fila sem candidatos abertos;
  Graphify reindexado (28906 nós, 55729 arestas, 2443 comunidades).
- Próximo ciclo: rodar medição pós-mutações quando houver sessões novas no DB;
  se a fila tiver candidato, seguir protocolo.

## Registro do ciclo 5 (concluído)

- **Compactação com small_model** ✔ (a pedido do usuário): flag `compaction.small_model`
  implementada (schema V1 + classe V2 + migrate + escolha do modelo com fallback
  seguro). 2 testes novos; 54 compactação + 92 regressão passam; typecheck
  core+opencode OK; build smoke `0.1.0-sploit` OK. Commit motor `5cbe9a1`.
- **Config** ✔: flag habilitada no `sploit.json` (`"compaction": { "small_model": true }`).
- **Pendente**: self-restart para ativar no binário; medir custo/qualidade da
  compactação com o Groq (as âncoras do grafo sobrevivem à compactação? custo por
  compactação vs. antes). Próximo passo: o usuário apresentará o projeto que quebra
  a complexidade quadrática das LLMs (rodar modelo local bom em sistema fraco).

## Registro do ciclo 3 (concluído)

- **Geração 4** ✔: mutação G-grafo (reminder de consultar grafo ao editar arquivo
  central). Commit motor `2bbca6e` + raiz `fe73c41`/`a194c1b`.
- **Push automático do conhecimento** ✔ (causa raiz): User-Agent do Python
  bloqueado pelo Cloudflare → fix em `diagnostico.py`. Commit raiz `033048a`.
- **Testes da suite** ✔: 4 anchors + 8 reminders + 33 retry + system, tudo OK.
- **Diagnóstico** ✔: 3 HARNESS | 12 AGENTE; genes destilados; push manual OK
  (nuvem restaurada com conteúdo real). Graphify reindexado (28892 nós).
- Próximo ciclo: **G-verificacao** (gene forte 4 obs → mutação estrutural medida).

## Fila de baixa prioridade (se sobrar tempo)

- [ ] Reindexar o Graphify do repo raiz (pode estar desatualizado após commits).
- [ ] Conferir a suite completa de testes do core e documentar falhas
      pré-existentes vs novas.
- [ ] Revisar se o `dist/` está atualizado com a Geração 3 para o próximo
      `pack-dist.ps1`.

## Relato matinal (amanhã o usuário vai perguntar "o que você aprendeu?")

Ao encerrar o ciclo noturno, escrever na última nota de `NOTAS.md` uma seção
**"Relato da noite"** com:
1. Quais mutações foram aplicadas (com commits).
2. Quais foram medidas e o resultado (manter/reverter).
3. O que o Sploit aprendeu sobre si mesmo (genes novos/fortes, padrões).
4. O que ficou pendente para decisão humana.
