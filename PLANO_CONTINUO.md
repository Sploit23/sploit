# PLANO_CONTINUO.md — Plano de evolução autônoma (modo contínuo)

> O usuário me deu liberdade para trabalhar sozinho (tipicamente de noite, mas
> pode ser qualquer período) e vai conferir o relato quando voltar. O Sploit
> deve executar a fila abaixo com total autonomia, registrando tudo para o
> relato. Este arquivo é a fila de trabalho + protocolo. É lido em cada ciclo
> do self-restart (via `--prompt`), então mantê-lo enxuto e atualizado.

## Como acionar

NÃO é slash e não é palavra mágica. O usuário ativa em linguagem natural — por
exemplo: *"vou sair, trabalha no MaxxPrint até eu voltar"*, *"fica trabalhando
até eu chegar"*, *"pode ir fazendo"*, *"quero que você termine isso"*. Ao
detectar ausência + trabalho autônomo, o Sploit entra em modo contínuo sozinho.

- **Se o usuário deu um alvo** (projeto/feature/tarefa), esse é o alvo do
  ciclo: registrar aqui na seção "Alvo atual" e executá-lo em passos (UM passo
  por ciclo).
- **Se ele só pediu liberdade**, seguir a fila abaixo.
- Requisito físico: PC ligado na tomada (sleep AC=0 já configurado).

## Alvo atual

**ALVO NOTURNO (11/08 → 12/08): "Sploit Dev Company — uma empresa de
desenvolvimento no terminal"** (acionado pelo usuário: "vamos entrar no modo
noturno, total liberdade, não pare até eu acordar, vá atrás de novidades,
acabou uma tarefa se dê mais tarefas").

Prioridades do usuário (em palavras dele):
- **VISUAL é o mais importante**: "deixar bonito para que as pessoas gostem do
  que estão vendo". Ele ama ver os agentes vivos, criá-los, auditar — "posso ter
  uma empresa de desenvolvimento no meu terminal desde a criação visual,
  auditoria, etc."
- **Novo papel: agente de segurança** — "um agente que testa vulnerabilidades"
  ("abre infinitas variedades").
- **Criação visual**: "desde a criação visual" — criar agentes deve ser bonito
  e guiado.
- **Atrás de novidades**: pesquisar tendências e adotar o que servir.

Fases da noite (uma por ciclo, nesta ordem):
- [x] **A1 — Dock bonito (mission control)**: cabecalho com contadores vivos
      por estado (●/✓/✕/○), spinner de pulso 500ms quando alguem trabalha,
      badge de papel colorido por funcao (auditoria=ambar, seguranca=vermelho,
      frontend=accent, backend=cyan), atividade em italico quando pensando/
      postando, rodape com ultimo post. Motor `747a0b2`; typecheck tui OK;
      build smoke OK (backup criado; troca via self-restart).
- [x] **A2 — Criacao visual de agentes**: `squad create` wizard guiado e
      colorido (banner, perguntas passo a passo pasta/nome/papel, resumo do
      time em caixa com cor de cada agente, confirmacao s/N, cria
      init+add+pasta+post de boas-vindas; cancelamento nao cria nada).
      Validado com stdin pipe (sucesso + cancelamento), py_compile OK.
      Raiz `d1dfcf0`; skill squad §1/§5 atualizada.
- [x] **A3 — Validar o dock no binario novo**: TUI aberta no projeto-demo2
      (PID 18500, binario 23:14:10) viva 25s+ sem crash - redesenho da fase
      A1 validado em execucao real.
- [x] **B — Agente de segurança (pentest)**: papel `segur`/`pentest`/`vulner`
      no montar_prompt vira auditor de vulnerabilidades (injecao, XSS, path
      traversal, headers, validacao, stack vazando, dados sensiveis,
      autorizacao; probe de rotas com payloads; veredito SEGURANCA: aprovado/
      CRITICO com [CRITICA]/[ALTA]/[MEDIA]/[BAIXA]). Testes isolados 4/4 (3
      perfis + sem crossover); demo real no demo2: Seguranca auditou backend e
      postou 4 achados reais (DoS por corpo sem limite, headers, /echo, CT) +
      memoria propria. Raiz `aaa0952`; skill §5.3 adicionada.
      Bonus: Vita (criada na janela do demo2, 'vulner' no papel) passa a
      receber o procedimento de seguranca automaticamente.
- [x] **C — Novidades**: websearch de tendências 2026 (agent-town/Agentshire
      "social feed", Microsoft Conductor/Velocity orquestração, TermUI/termcn
      sparklines+badges). **Adotada: `squad daily`** (standup real por agente:
      entregas/pendências/bloqueios do dia + sparkline de atividade por hora;
      raiz `1713c2a`, validado no demo2 — 30 entregas · 1 pendência · 1
      bloqueio; `--data` para dia vazio OK; `sys.stdout.reconfigure(utf-8)`
      corrigiu UnicodeEncodeError no console cp1252). **Sparkline 24h no dock**
      (motor `c567368`, typecheck tui OK, build smoke OK): rodapé do dock mostra
      o pulso do time nas últimas 24h (janela deslizante a partir do último
      post, buckets por hora, ▁▂▃▄▅▆▇█). Ativação no binário via self-restart +
      validação visual pendentes.
- [x] **D — "Empresa" de verdade**: `squad dashboard` (raiz `a6e3f73`):
      painel consolidado — banner com caixa, visão geral (entregas/pendências
      em aberto/bloqueios/última atividade), card por agente (cor, papel,
      entregas totais e de hoje, estado atual, último post), sparkline 24h
      (helper `sparkline_24h` compartilhado com o daily) e timeline das
      entregas de hoje; `--salvar` grava `squad/dashboard.md` sem ANSI.
      Validado no demo2 (32 entregas, timeline 10 posts, ▁▃█▁); py_compile OK.
- [ ] **E — Encerramento**: relato do modo contínuo em NOTAS.md, SPLOIT_STATE.md
      atualizado, diagnóstico + sync nuvem, reindex Graphify, garantir tree
      limpa.

Ciclos anteriores (MVP do squad, concluídos): f0519ed → skill squad → demo2
ponta a ponta → `squad run`/supervisor → dock na TUI → auditor + ciclo QA
(936cd2e). Detalhe em SQUAD.md/SPLOIT_STATE.md.

## Protocolo do ciclo

1. **Ao iniciar cada sessão** (após self-restart com `--continue --prompt`):
   - Ler `SPLOIT_STATE.md` (estado vivo) e este arquivo.
   - Ler `NOTAS.md` (última nota = onde a evolução parou).
2. **Executar UM passo por ciclo** (do alvo do usuário, se houver; senão, da
   fila). Não misturar passos. Não fazer mudanças de config + motor no mesmo
   ciclo.
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
10. **Critério de parada**: parar quando o alvo do usuário estiver concluído,
    a fila estiver vazia OU quando um passo falhar 2x (documentar a falha,
    marcar como pendente/adiado e parar para o usuário decidir). Depois de
    parar, garantir `SPLOIT_STATE.md` atualizado com "ciclo contínuo encerrado"
    e o relato do que foi aprendido.

## Regras de segurança do modo contínuo

- Nunca pedir input ao usuário (question/confirmação). Se algo exigir decisão
  humana, documentar no estado e seguir para o próximo passo ou parar.
- Não tocar em segredos: `APIKEY.txt`, `sploit-web.secret`, senhas em
  `conhecimento.json` nunca vão para git nem para logs.
- Não commitar `sploit.exe`, `venv/`, `graphify-out/`.
- Não desfazer decisões registradas em `DECISOES.md` sem evidência.
- Sempre deixar o working tree limpo ao final de cada ciclo.

## Fila de evolução (executar em ordem)

- [x] **Preparação**: permissões auto-approve no `sploit.json` (modo contínuo)
      + plano criado + self-restart com `-ResumePrompt` validado (é o motor do
      ciclo). PC não dorme na tomada (sleep AC=0).
- [ ] **Instrumentar as mutações (G5–G9)** — primeiro passo de verdade: o
      harness hoje não registra os disparos das mutações (reminders injetados,
      proof-gate PASS/FAIL, auto-verify, file memory, idempotência) — o
      `medicao_mutacoes.py` mede o comportamento natural do modelo, não o
      efeito das mutações. Instrumentar para medir de verdade o que vale e o
      que podar.
- [ ] **Re-medição com amostra real** — após instrumentar, coletar sessões de
      trabalho em código com o binário G5–G9 e medir: verificação antes do
      fechamento, erros repetidos por arquivo, reexecução de comandos stateful.
      Manter o que provar valor; **podar sem dó** o que não provar.
- [ ] **Diagnóstico + sync nuvem** — rodar `diagnostico.py` (genes, lições,
      push para a nuvem coletiva) e reindexar o Graphify após mudanças de
      código.
- [ ] **G-isolado (próximo gene, 1 obs, acumulando)** — quando atingir 3+ obs,
      avaliar nova mutação estrutural medida (validar em ambiente isolado antes
      de tocar arquivos reais).
- [ ] **Modo Squad — próximo grande projeto** (visão do usuário registrada em
      `SQUAD.md`): agentes persistentes por área (backend/frontend/totem) com
      nome, contexto próprio, escopo de pasta, memória por agente e um quadro
      de comunicação compartilhado (`squad/quadro.md`) — o coordenador ordena,
      os agentes trabalham juntos e a conversa deles é visível. Decisões em
      aberto: visualização (terminal/web/ambos). Prioridade de identidade.

## Relato (quando o usuário voltar, ele vai perguntar "o que você fez?")

Ao encerrar o modo contínuo, escrever na última nota de `NOTAS.md` uma seção
**"Relato do modo contínuo"** com:
1. O que foi feito (com commits).
2. O que foi medido e o resultado (manter/reverter).
3. O que o Sploit aprendeu sobre si mesmo (genes novos/fortes, padrões).
4. O que ficou pendente para decisão humana.
