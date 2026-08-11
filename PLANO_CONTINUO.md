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

**Modo Squad — MVP "entregue pronto"** (11/08, acionado pelo usuário: "pode
implementar e me entregue pronto"). Ciclos:
1. [x] `scripts/squad.py` (CLI: init/add/post/status/list/check) + testes fake
      (idempotência do init, duplicado bloqueado, agente inexistente bloqueado,
      feed legível, check OK). Commit `f0519ed`.
2. [x] Skill global `squad` em `~/.config/sploit/skills/squad/SKILL.md` (fluxo de
      criação interativa quantos/pastas/nomes + orquestração via quadro) +
      gatilho no `~/.config/sploit/AGENTS.md` ("crie agentes"/"squad" → skill).
3. [x] Teste ponta a ponta (projeto-demo2: Ana/Bruno via CLI + subagentes com
      persona; POST /preco 19.90 → 200 {ok:true,preco:19.9}; check OK) +
      memórias atualizadas (SQUAD.md, SPLOIT_STATE, NOTAS.md com o relato).
      **ALVO CONCLUÍDO — ciclo contínuo encerrado (relato em NOTAS.md).**

Fases futuras (fora do escopo, documentar no SQUAD.md): view TUI dedicada;
agentes como sessões/processos persistentes de verdade.

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
