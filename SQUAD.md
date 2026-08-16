# SQUAD.md — Modo Squad (visão do usuário, registrada em 11/08)

> Visão co-criada com o Flávio. Este arquivo é o blueprint: o que o modo
> contínuo deve construir como próximo grande projeto. O usuário brilha os
> olhos com isso — é prioridade de identidade, não de nicho.

## A cena (do usuário, em palavras dele)

Uma pasta "Projeto" com `backend/`, `frontend/` e `visual/` (ou totem/PC).
O usuário inicia o Sploit nessa pasta e fala:

> "crie um agente para cada área do projeto"

O Sploit (coordenador) **conduz a criação** — não decide por conta própria:

1. Pergunta **quantos agentes** e **para quais pastas** (a pessoa responde:
   "quero 2 agentes, um para a pasta X e outro para a pasta Y").
2. Pergunta **os nomes** que a pessoa quer dar a cada um (ex.: João, Maria...).
3. Cria os agentes com nome, pasta, persona e memória própria.

Os agentes são **persistentes** (não morrem ao fim da tarefa; moram no
projeto, com memória própria).

> "esse projeto precisa que, quando o cliente mudar o preço no frontend, lá no
> backend/PC de alguém mude a mesma coisa"

O Sploit (coordenador) **ordena** o trabalho, divide por área e os agentes
trabalham **juntos, se conversando como colegas** — "fiz X na minha parte" →
"então eu já faço a API pra subir".

Quando termina, eles **lembram** o que cada um precisa fazer (memória própria).

## Por que é diferente

- Subagentes existentes (Task) são **efêmeros**: nascem, fazem, morrem, e não
  falam entre si. O squad são agentes que **moram** no projeto.
- A memória do coordenador **não sobrecarrega**: cada agente tem o próprio
  contexto (sessão própria), escopo de pasta e memória. O coordenador vê só o
  quadro + resultados.

## Arquitetura (desenho inicial)

- **1 coordenador** (o Sploit principal da sessão): interpreta o pedido,
  quebra em tarefas por área, ordena dependências, integra, e faz a "voz do
  dono" quando precisa de decisão.
- **N agentes de área**: cada um é uma sessão/processo do Sploit (headless,
  sem TUI — estilo modo contínuo) com:
  - escopo de pasta (só a sua área);
  - prompt de sistema próprio ("você é o João, dono do frontend");
  - memória própria (`squad/joao.md`);
  - permissões auto-approve na sua pasta.
- **Quadro de comunicação** (`squad/quadro.md`): o canal. Cada agente posta
  com o nome ("**[João]** ...") o que fez, o que precisa, o que bloqueia. A
  conversa entre eles É o quadro. Posts têm estado (feito/pendente/bloqueado)
  para o coordenador ordenar o próximo ciclo.
- **Ciclo**: o coordenador lê o quadro, decide o próximo passo de cada agente,
  os agentes rodam (paralelo quando as áreas não colidem), postam, e o
  coordenador integra.

## Fluxo de exemplo (preço)

1. Pedido: "cliente muda o preço no frontend e o PC do totem muda junto".
2. Coordenador ordena: João (frontend) → campo de preço + salvar; Maria
   (backend) → endpoint/API de preço; Paulo (totem) → consumir API.
3. João faz e posta: "[João] criei o campo preço; preciso da API pra salvar".
4. Maria pega a pendência: "[Maria] vou criar POST /preco". Paulo espera.
5. Coordenador vê o quadro, avisa Paulo quando a API estiver no ar.
6. Cada um commita a própria área; o quadro guarda a conversa.

## Visualização (decisão em aberto — perguntar ao usuário)

O usuário quer **ver** os agentes conversando e trabalhando. Opções:

- **(A) Feed no terminal**: uma view do Sploit que mostra o quadro ao vivo
  ("[João] ...", "[Maria] ...") com status de cada agente. Mais rápido de
  construir (reusa o quadro).
- **(B) Web (sploit-web)**: a UI web que já existe ganha uma aba "Squad" —
  dá pra ver de longe, no celular. Mais bonito, mais trabalho.
- **(C) Os dois**: feed no terminal + espelho na web.

## Pendências de design

- Onde mora o squad (arquivos, configuração de agentes, nomes)?
- Como o usuário conversa com um agente específico ("João, o que você está
  fazendo?")?
- Conflitos: e se duas áreas precisarem do mesmo arquivo?
- Como os agentes rodam em paralelo de verdade (processos, fila de
  self-restart)?

## Status

- [x] Registrado na fila do PLANO_CONTINUO.md (próximo grande projeto)
- [x] **PoC validada (11/08)**: João (frontend), Maria (backend) e Pedro
      (visual) entregaram a feature "preço muda no frontend e o visual mostra"
      em conversa pelo quadro; POST 7.50 → GET retorna 7.50 (teste real).
      Nota de evolução em NOTAS.md. PoC em `Temp\sploit\projeto-demo`.
- [x] Definir visualização com o usuário (A/B/C) — usuário escolheu (A) terminal
- [x] **MVP do mecanismo entregue (11/08, modo contínuo)**: CLI `scripts/squad.py`
      (init/add/post/status/list/check, commit `f0519ed`) + skill global `squad`
      (`~/.config/sploit/skills/squad/SKILL.md`: fluxo de criação interativa
      quantos/pastas/nomes, formato squad.json/quadro/memórias, orquestração) +
      gatilho no `AGENTS.md` global. Teste ponta a ponta real em
      `Temp\sploit\projeto-demo2`: Ana (frontend) e Bruno (backend) entregaram a
      feature via CLI + subagentes com persona; POST /preco 19.90 → 200
      {ok:true,preco:19.9}; quadro com 3 posts; check consistente.
- [x] **Visualização do time (11/08, "mostrar eles trabalhando")**: `squad view`
      (palco no terminal: boneco pixel por agente com cor própria sem colisão,
      nome, pasta, status ✓/○/✕, balão com o último post + conversa; `--watch`
      ao vivo) e `squad web --port` (página HTML standalone com os mesmos
      bonecos em canvas, cartões + feed, polling 2s — dá para ver de longe).
      O Coordenador é cinza (não rouba a cena). Decisão: bonecos desenhados por
      código (matriz + cor), sem assets de terceiros — os sprites do ai-town
      (Smallville) são de terceiros (licença própria); pegamos a IDEIA.
- [x] **Agentes rodando de verdade (11/08, `squad run`)**: cada agente vira uma
      **sessão headless real do Sploit** (`sploit run --dir <pasta> --continue`,
      processo desanexado, log em `squad/logs/<nome>.log`). O coordenador posta
      a tarefa (estado `pendente`) e o agente lê o quadro, executa na própria
      pasta, atualiza a PRÓPRIA memória e posta o resultado — o status do palco
      muda de verdade (○ trabalhando → ✓ feito). Validado ponta a ponta real:
      Bruno implementou `GET /status` no backend (200, reflete precoAtual),
      testou no servidor real, atualizou `memoria/Bruno.md` e postou `(feito)`
      — tudo sozinho, processo saiu ao ficar idle. Sessão persistente por
      agente via `--continue` (pasta exclusiva = última sessão do dir).
- [x] **Supervisor de fila (11/08, `squad supervisor`)**: monitora o quadro e
      relança agentes até a fila zerar (encerra sozinho; 3 tentativas por
      agente para evitar loop). Detecção de tarefa em aberto: post pendente
      do agente ou `Nome:` no texto SEM resposta do agente depois (posts
      pendentes já respondidos não relançam). Boneco corrigido: pixel único
      `█` (proporção quadrada; antes `██` distorcia). Validado real: 2 tarefas
      entregues numa rodada (GET /health + /versao) + ciclo final limpo
      (tarefa nova → Bruno lançado → `(feito)` → fila vazia → encerrou).
- [ ] Fazer a criação interativa de verdade (quantos/pastas/nomes) na TUI
- [x] **Auto-lançamento do supervisor (16/08, "o status fica parado")**:
      achado real (usuário abriu `squad/` em `Desktop\testes` e o dock ficava
      com o spinner girando sem nada acontecer) — o SquadDock é só leitor
      passivo do quadro/logs, e nada disparava o `supervisor`/`run` sozinho;
      dependia do coordenador lembrar de rodar na mão. Agora `squad.py post
      --estado pendente` checa se há um supervisor vivo (`squad/supervisor.pid`
      + `tasklist`/`os.kill(pid,0)`) e, se não houver, lança um desanexado
      (log em `squad/logs/supervisor.log`); o supervisor grava o próprio PID
      ao subir e apaga o arquivo ao encerrar (fila zerada ou Ctrl+C). Dedup
      testado: dois posts pendentes em sequência só lançam um supervisor.
- [x] **Path do Windows quebrava o `post` final do agente (16/08, mesma sessão
      de teste)**: com o auto-lançamento acima, o Bruno rodou de verdade e fez
      o trabalho (criou `natal/README.md`), mas o comando de exemplo do
      `montar_prompt` — `python {sp} --dir {base} post ...` com `sp`/`base` em
      path do Windows (`C:\Users\...`) sem aspas — quebrava no Git Bash: barra
      invertida antes de letra é sequência de escape, então
      `C:\Users\Hp\Desktop\sploit\scripts\squad.py` virava
      `CUsersHpDesktopsploitscriptssquad.py` e o Python não achava o arquivo.
      O agente terminava o trabalho real mas nunca conseguia postar `(feito)`
      — o quadro (e o dock) ficavam presos pra sempre com o post antigo.
      Afetava **todo** squad rodando em Windows. Corrigido: `montar_prompt`
      agora gera os comandos de exemplo com barra normal (`/`) e path entre
      aspas (`python "C:/Users/.../squad.py" --dir "C:/Users/..." post ...`).
      Validado real: rodada nova do Bruno pós-fix postou `(feito)` sozinho.
- [x] **Post de nascimento errado deixava agente preso em "trabalhando" para
      sempre (16/08)**: o squad de teste tinha `**[Marcos] (pendente) Pronto
      para coordenar...**` como primeiro post do Marcos — `pendente` sinaliza
      tarefa em aberto, então o supervisor relançava o Marcos à toa (ele lia o
      quadro, via que não tinha tarefa real, respondia "aguardando" sem
      postar) até esgotar as 3 tentativas e desistir — post nunca resolvido,
      dock preso em ● para sempre. Skill `squad` §1 atualizada: post de
      nascimento é **sempre `(feito)`**, nunca `(pendente)`.
- [x] **Skill do squad usava caminho relativo pro `squad.py` (16/08)**: o
      `SKILL.md` global mandava checar `scripts/squad.py` relativo ao projeto
      — funciona rodando de dentro do repo do sploit, mas quebra em qualquer
      outro diretório (ex.: `Desktop\testes`), onde o caminho não existe. O
      coordenador provavelmente concluía "o script não existe" e caía no
      fallback manual, perdendo TUDO que dependia do `squad.py` (auto-launch
      do supervisor incluso). Corrigido: skill agora referencia o caminho
      **absoluto** `C:/Users/Hp/Desktop/sploit/scripts/squad.py`, seguindo o
      mesmo padrão que o `sploit.jsonc` global já usa pra outras ferramentas
      do repo (ex. o MCP do graphify).
- [x] **Dock sumia com `sploit --continue` fora do projeto (16/08, "os agentes
      sumiram")**: `SquadDock`/`SquadSetupBanner` (`routes/session/index.tsx`)
      recebiam `directory={session()?.directory}` — um valor **congelado no
      banco** na criação daquela sessão específica. `--continue` retoma a
      sessão raiz mais recente **globalmente** (`app.tsx`, sem filtro de
      diretório), então se a última sessão usada foi de outro projeto, o dock
      renderizava com a pasta errada (ou nenhuma) mesmo com o terminal "na"
      pasta do squad. Corrigido: os dois componentes agora recebem
      `paths.cwd` (`useTuiPaths()`, contexto `TuiPathsProvider` — a pasta real
      de onde o Sploit foi aberto, imutável durante o processo, já usada por
      `squad-notifications.ts` via `api.state.path.directory`) em vez de
      `session()?.directory`. Rebuildado (`build-sploit.ps1`) e reinstalado
      (`install-sploit.ps1`) no binário global — mudança de TS só vale depois
      de recompilar, diferente dos fixes anteriores (doc/script, já globais e
      ativos na hora).
- [x] **Dock do squad na TUI (11/08, "sempre mostra eles vivos ali trabalhando")**:
      `SquadDock` em `routes/session/squad-dock.tsx` — painel fixo no rodapé da
      sessão do Sploit que lê `squad/squad.json` + `quadro.md` do diretório da
      sessão (polling 2s) e mostra cada agente: nome colorido, pasta, símbolo
      de estado (✓/○/✕) e a tarefa/último post. Some sozinho quando não há
      squad. Bonecos pixel removidos (terminal e web) — o usuário reprovou
      2x ("ta muito feio, nada ver"; "não quero ver no web, só o modo terminal").
      Commits: motor `7c281b9` + raiz `23bf0b8` (remoção dos bonecos).
- [x] **Agente auditor (QA) e ciclo de re-auditoria (11/08, "como um time se
      organiza com um especialista?")**: `squad.py add --papel "especialista em
      auditoria..."` — o `montar_prompt` detecta "audit" no papel e inverte as
      regras: o auditor LÊ as pastas dos colegas, não edita produção, e posta
      veredito (`(feito)`=aprovado com resumo, `(bloqueado)`=problemas com
      arquivo/linha). Ciclo completo real no demo2 (22:54-23:00): Auditor
      bloqueou com 3 problemas REAIS (rota desconhecida 200 em vez de 404 em
      server.js:131, teste de estatísticas frágil com histórico=20, testes de
      404/corrompido ausentes) → Coordenador passou a correção ao Bruno →
      Bruno corrigiu (32 testes OK) → Auditor re-auditou e APROVOU (0 achados,
      suite determinística rodada 2x). Auditor registrou auditoria e
      re-auditoria na memória própria. Commit `936cd2e` (squad.py) + skill
      squad §5.2 e §6 (dock) atualizadas.
