# SPLOIT_STATE.md — Memória de Auto-Melhoria

> Este arquivo é a memória viva do Sploit. É lido automaticamente em toda sessão
> (via `instructions` no `sploit.json`). **REGRA DE OURO:** antes de encerrar qualquer
> sessão de auto-melhoria, atualize `# Próximo passo` e `# Progresso`. Quem acordar
> amanhã precisa saber exatamente onde parou.

## Missão

Transformar o Sploit em uma das melhores ferramentas de codificação do mercado —
rápida, confiável, com identidade própria forte e reconhecimento mundial. O
objetivo real: a pessoa dizer *"não consigo mais programar sem o Sploit"*.

Princípios:
- **Básico bem feito > quantidade de recursos.** Cada mudança deve ter propósito
  claro e elevar qualidade/confiabilidade — nunca "quanto mais, melhor".
- **Economia de tokens é estratégica.** Tudo que reduz contexto desperdiçado
  (memória, grafo, compactação, ferramentas certas) é prioridade alta.
- **Identidade e distanciamento do fork.** A cada iteração, o Sploit deve se
  parecer menos com o opencode e mais consigo mesmo (TUI, idioma, UX, marca,
  diferenciais exclusivos).
- Verificável: typecheck/build/test antes de considerar um passo concluído.
- Pequenos commits atômicos; nunca quebrar a árvore do repo raiz.
- A memória é a fundação: SPLOIT_STATE.md é a fonte da verdade entre sessões.
- Pesquisar novidades na internet com parcimônia: observar, filtrar, e só
  adotar o que serve à identidade — sem perseguir hype.

## Plano

- [x] Definir estratégia de memória persistente (SPLOIT_STATE.md + instructions + /retomar)
- [x] Configurar modelos (plan/build = big-pickle; small_model = groq/gpt-oss-120b)
- [x] Criar SPLOIT_STATE.md com o ciclo de checkpoint
- [x] Adicionar `instructions` no sploit.json (injeção automática do estado)
- [x] Adicionar protocolo de auto-melhoria no AGENTS.md raiz
- [x] Criar comando `/retomar` (.sploit/command/retomar.md)
- [x] Atualizar AGENTS.md global com regra de leitura do estado
- [x] Validar config e commitar checkpoint inicial
- [x] Criar ciclo de auto-atualização seguro (build com backup + smoke test + rollback + /atualizar)
- [x] Validar empiricamente o ciclo (reiniciar via self-restart.ps1 em uma mudança real)
- [ ] Iteração 1: base sólida — typecheck-clean, Graphify indexado, dicas PT-BR confirmadas
- [ ] Iteração 2: diferenciais de identidade (TUI/marca/UX próprios, longe do fork)
- [ ] Iteração 3: economia de tokens (medir contexto, compactação, tools certas)

## Progresso

- 2026-08-08: Desenhada e aprovada a estratégia de memória de auto-melhoria.
- 2026-08-08: Diagnóstico do Groq: API funciona (chave OK, modelo existe), mas o tier
  `on_demand` tem limite de 8.000 TPM e o contexto da sessão estourava (42k–78k).
  Ajustado: `small_model: groq/openai/gpt-oss-120b` para tarefas pequenas.
- 2026-08-08: Implementado o sistema de memória completo:
  - `SPLOIT_STATE.md` criado (memória viva, injetado via `instructions`).
  - `sploit.json` → `"instructions": ["SPLOIT_STATE.md"]`.
  - `AGENTS.md` raiz → seção "Auto-melhoria (protocolo obrigatório)".
  - `.sploit/command/retomar.md` → comando `/retomar`.
  - `~/.config/sploit/AGENTS.md` → regra de leitura do estado no início da sessão.
  - Commit: `d0fd696` `sploit: feat: sistema de memoria de auto-melhoria (SPLOIT_STATE.md + /retomar)`.
- 2026-08-08: Criado o ciclo de auto-atualização seguro (respondendo ao risco "se eu
  errar o código e reiniciar, nunca mais abre"):
  - `scripts/build-sploit.ps1` agora gera `sploit.exe.bak` (known-good) antes de
    sobrescrever o binário.
  - `scripts/self-restart.ps1`: smoke test (`sploit doctor`) ANTES de matar o processo
    atual; relança `sploit --continue`; se o binário novo morrer no boot, restaura o
    `.bak` e relança com o antigo. O Sploit nunca fica sem abrir.
  - `.sploit/command/atualizar.md` → comando `/atualizar` (ciclo com aprovação do usuário).
  - `.gitignore` → `sploit.exe.bak` e `logs/`.
- 2026-08-08: **Validado o ciclo `/atualizar` end-to-end** com mudança real de identidade:
  - Traduzidas as dicas da TUI (`packages/tui/src/feature-plugins/home/tips-view.tsx`)
    para PT-BR (cumpre promessa do README "dicas em PT-BR") e adicionadas dicas
    exclusivas de auto-melhoria (`/retomar`, `/atualizar`, `SPLOIT_STATE.md`, `graphify`).
  - Descoberta e corrigida falha real no ciclo: o `build-sploit.ps1` tentava
    sobrescrever `sploit.exe` **em uso** pelo processo atual (IOException). O
    `self-restart.ps1` agora detecta o binário novo no `dist/`, roda o smoke test nele,
    encerra o processo, copia por cima e só então relança (rollback continua válido).
  - Segundo bug real corrigido: o `self-restart.ps1` falhava ao rodar `sploit doctor`
    porque o PowerShell 5.1 trata a saída do binário no stderr como
    `NativeCommandError` e, com `$ErrorActionPreference = "Stop"`, abortava o script.
    Fix: `$ErrorActionPreference = "Continue"` temporário durante o doctor.
  - Terceiro bug real corrigido: edições de texto removeram o **BOM UTF-8** do
    `self-restart.ps1`; sem BOM, o PowerShell 5.1 lê o arquivo como ANSI e os acentos
    corrompem o parsing (`Expressão ausente após operador unário '--'`). Fix:
    re-salvar o script com `[UTF8Encoding]::new($true)` (regra: todo .ps1 do repo
    precisa de BOM; conferir com os 3 primeiros bytes `EF BB BF` após editar).
  - Typecheck do `tui` OK. `opencode` tem 2 erros **pré-existentes** em
    `src/plugin/index.ts` (pacote duplicado `@opencode-ai/plugin@1.18.11` no
    `node_modules` vs `packages/plugin`; não relacionados a esta mudança).
  - Build OK (`0.1.0-sploit`, smoke test interno passou), `sploit.exe.bak` criado.
  - Reinício OK via `scripts/self-restart.ps1`: PID 756 (09:18) → PID 4760 (09:54),
    `sploit.exe` atualizado (09:46:59), conversa retomada com `--continue`.
  - Commits: `f6e7427` (sploit-src, dicas PT-BR), `280ba16` (raiz, fix self-restart
    cópia pós-kill), `91af5a4` (raiz, BOM) e pendente commit do fix NativeCommandError.

## Próximo passo

Ciclo de melhoria validado ✔. Iteração 1 — **base sólida**:
1. **Typecheck-clean**: investigar e resolver os 2 erros pré-existentes em
   `sploit-src/packages/opencode/src/plugin/index.ts` (pacote duplicado
   `@opencode-ai/plugin@1.18.11` no `node_modules` vs `packages/plugin`). Prioridade
   alta: sem typecheck-clean não dá para dizer que a base é sólida.
2. **Graphify indexado**: rodar `/graphify .` (a última tentativa falhou porque
   `graphify-out/graph.json` não existe). É o pilar de economia de tokens.
3. **Confirmar visualmente** as dicas PT-BR na home (usuário confirma).

Depois disso, Iteração 2 (diferenciais de identidade) com pesquisa na internet:
filtrar novidades que sirvam à identidade do Sploit, sem perseguir hype.

## Verificação

- JSON do `sploit.json` válido: `Get-Content sploit.json -Raw | ConvertFrom-Json` ✔
- Typecheck `tui`: `bun run typecheck` OK (0 erros) ✔
- Typecheck `opencode`: 2 erros **pré-existentes** em `src/plugin/index.ts` (pacote
  duplicado `@opencode-ai/plugin@1.18.11` no node_modules vs `packages/plugin`);
  confirmado via `git stash` que existem sem a mudança de dicas. Pendente tratar.
- Build: `scripts/build-sploit.ps1` OK (smoke interno `0.1.0-sploit` passou; a cópia
  para `sploit.exe` falhou por arquivo em uso — esperado, o `self-restart.ps1` agora
  faz a troca após encerrar o processo) ✔
- Backup: `sploit.exe.bak` criado (known-good) ✔
- **Validação empírica do ciclo**: `self-restart.ps1` rodado com sucesso — PID antigo
  756 (09:18) encerrado, binário novo copiado para `sploit.exe` (09:46:59), processo
  novo relançado com `--continue` (PID 4760, 09:54), conversa retomada ✔
- Dicas em PT-BR: o binário novo está rodando; confirmar visualmente na home ✔ (pendente
  de confirmação visual do usuário)
- Injeção do `SPLOIT_STATE.md`: este texto é a prova de que está no contexto ✔

## Armadilhas

- Config do Sploit **não é hot-reloaded**: qualquer mudança exige reiniciar.
- Windows/PowerShell 5.1: não usar `&&` como separador em comandos multi-etapa.
- `bun install` em `sploit-src/` falha sem Visual Studio Build Tools (tree-sitter). Não re-adicionar os três pacotes a `trustedDependencies`.
- Groq free: limite 8k TPM. Só usar em tarefas pequenas (title/small).
- Erro "Failed to fetch models.dev" no log é só o catálogo de modelos offline; não afeta o modelo configurado. Pendente investigar (rede do usuário funciona).
- **Build enquanto o Sploit roda**: `build-sploit.ps1` não consegue sobrescrever
  `sploit.exe` em uso (IOException). Isso é esperado — a troca é responsabilidade do
  `self-restart.ps1` (passo 2.5), que roda o smoke test no binário novo do `dist/`,
  encerra o processo e então copia.
- **Erros pré-existentes de typecheck em `opencode`**: `src/plugin/index.ts:75-76`
  quebram por um pacote `@opencode-ai/plugin@1.18.11` duplicado no `node_modules` (o
  workspace usa `@sploit-ai/plugin`). Não são causados por mudanças de dicas; exigem
  deduplicar o pacote antes de considerar `opencode` typecheck-clean.
- Sempre atualizar `# Próximo passo` antes de encerrar sessão. **Nunca terminar sem ele preenchido.**
