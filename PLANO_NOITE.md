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
- [ ] **Ativar a Geração 3 no binário**: self-restart já vai trocar para o
      binário com âncoras do grafo no `<env>`. Após reiniciar, conferir no
      diagnóstico das próximas sessões se edições em arquivos centrais caem.
- [ ] **Medição da Geração 3** (Constituição art. 6): comparar "arquivos
      centrais tocados x falhas" antes/depois da mutação. Manter se melhorar,
      reverter com evidência se não.
- [ ] **Mutação G-causaraiz**: quando uma ferramenta falhar, antes de tentar
      de novo, investigar a causa raiz. Forma estrutural: reminder no prompt
      quando houver erro de ferramenta (ver `reminders.ts` — padrão
      PROMPT_PLAN). Medir: taxa de falhas repetidas antes/depois.
- [ ] **G-grafo → consulta de comunidades antes de editar centrais**: quando
      uma edição tocar arquivo central (alto degree), o harness deve sugerir
      consultar o grafo (comunidade) primeiro. Medir: edições em centrais que
      precedem consulta ao grafo.
- [ ] **Verificar o push do conhecimento para a nuvem**: confirmar que o
      `/diagnostico` faz POST automático (falta de rede foi o motivo do push
      manual na última execução).
- [ ] **Rodar testes da suite do core/opencode** para detectar regressões da
      Geração 3 (pelo menos os novos `compaction-anchors.test.ts`).
- [ ] **Próxima geração (G-verificacao, 4 obs — forte)**: usar o gene forte
      para justificar uma mutação estrutural medida do harness (ex.: o sistema
      lembrar de verificar após cada mudança). Se já coberto pelo prompt,
      registrar por quê e marcar como feito com evidência.

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
