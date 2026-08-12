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
- [ ] Agentes com ciclos longos: supervisor que relança o agente quando há
      tarefa pendente (hoje o coordenador chama `squad run` por rodada)
- [x] **Dock do squad na TUI (11/08, "sempre mostra eles vivos ali trabalhando")**:
      `SquadDock` em `routes/session/squad-dock.tsx` — painel fixo no rodapé da
      sessão do Sploit que lê `squad/squad.json` + `quadro.md` do diretório da
      sessão (polling 2s) e mostra cada agente: nome colorido, pasta, símbolo
      de estado (✓/○/✕) e a tarefa/último post. Some sozinho quando não há
      squad. Bonecos pixel removidos (terminal e web) — o usuário reprovou
      2x ("ta muito feio, nada ver"; "não quero ver no web, só o modo terminal").
      Commits: motor `7c281b9` + raiz `23bf0b8` (remoção dos bonecos).
