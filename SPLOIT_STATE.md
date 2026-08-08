# SPLOIT_STATE.md — Memória de Auto-Melhoria

> Este arquivo é a memória viva do Sploit. É lido automaticamente em toda sessão
> (via `instructions` no `sploit.json`). **REGRA DE OURO:** antes de encerrar qualquer
> sessão de auto-melhoria, atualize `# Próximo passo` e `# Progresso`. Quem acordar
> amanhã precisa saber exatamente onde parou.

## Missão

Transformar o Sploit em uma das melhores ferramentas de codificação do mercado —
rápida, confiável, com identidade própria forte e reconhecimento mundial.

Princípios:
- Qualidade acima de quantidade; cada mudança deve ter propósito claro.
- Verificável: typecheck/build/test antes de considerar um passo concluído.
- Pequenos commits atômicos; nunca quebrar a árvore do repo raiz.
- A memória é a fundação: SPLOIT_STATE.md é a fonte da verdade entre sessões.

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
- [ ] Validar empiricamente o ciclo (reiniciar via self-restart.ps1 em uma mudança real)
- [ ] Iteração 1 de melhorias (definir com análise do motor)

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

## Próximo passo

Validar o ciclo de auto-atualização end-to-end numa mudança real (ex.: pequena
melhoria de identidade/TUI), usando `/atualizar`: tipo → typecheck → build (gera
`sploit.exe.bak`) → smoke test (`sploit doctor`) → commit → `scripts/self-restart.ps1`
(relança com `--continue`). Confirmar na sessão nova que o binário mudou e que o
rollback existe (`sploit.exe.bak`) em caso de falha no boot.

## Verificação

- JSON do `sploit.json` válido: `Get-Content sploit.json -Raw | ConvertFrom-Json` ✔
- Sem mudanças em `sploit-src` nesta iteração → sem build necessário. ✔
- Para conferir injeção: reabrir o Sploit e ver o estado no contexto (Instruções do arquivo).
  **Pendente de validação empírica após reiniciar o Sploit.**
- `scripts/self-restart.ps1` testável de forma segura: o smoke test roda o binário
  atual sem tocar no processo em execução.

## Armadilhas

- Config do Sploit **não é hot-reloaded**: qualquer mudança exige reiniciar.
- Windows/PowerShell 5.1: não usar `&&` como separador em comandos multi-etapa.
- `bun install` em `sploit-src/` falha sem Visual Studio Build Tools (tree-sitter). Não re-adicionar os três pacotes a `trustedDependencies`.
- Groq free: limite 8k TPM. Só usar em tarefas pequenas (title/small).
- Erro "Failed to fetch models.dev" no log é só o catálogo de modelos offline; não afeta o modelo configurado. Pendente investigar (rede do usuário funciona).
- Sempre atualizar `# Próximo passo` antes de encerrar sessão. **Nunca terminar sem ele preenchido.**
