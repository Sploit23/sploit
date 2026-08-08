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
- [ ] Criar SPLOIT_STATE.md com o ciclo de checkpoint
- [ ] Adicionar `instructions` no sploit.json (injeção automática do estado)
- [ ] Adicionar protocolo de auto-melhoria no AGENTS.md raiz
- [ ] Criar comando `/retomar` (.sploit/command/retomar.md)
- [ ] Atualizar AGENTS.md global com regra de leitura do estado
- [ ] Validar config e commitar checkpoint inicial
- [ ] Iteração 1 de melhorias (definir em nova sessão com base na análise do motor)

## Progresso

- 2026-08-08: Desenhada e aprovada a estratégia de memória de auto-melhoria.
- 2026-08-08: Diagnóstico do Groq: API funciona (chave OK, modelo existe), mas o tier
  `on_demand` tem limite de 8.000 TPM e o contexto da sessão estourava (42k–78k).
  Ajustado: `small_model: groq/openai/gpt-oss-120b` para tarefas pequenas.
- 2026-08-08: Iniciando implementação do sistema de memória (este arquivo).

## Próximo passo

Criar `SPLOIT_STATE.md` (este arquivo) completo e seguir a ordem do plano:
1. `sploit.json` → adicionar `"instructions": ["SPLOIT_STATE.md"]`.
2. `AGENTS.md` raiz → seção "Auto-melhoria" com o protocolo de checkpoint.
3. `.sploit/command/retomar.md` → comando `/retomar`.
4. `~/.config/sploit/AGENTS.md` → regra de leitura do estado.
5. Validar JSON e commit: `sploit: feat: sistema de memória de auto-melhoria`.

## Verificação

- JSON do `sploit.json` válido: `Get-Content sploit.json -Raw | ConvertFrom-Json`
- Sem mudanças em `sploit-src` nesta iteração → sem build necessário.
- Para conferir injeção: reabrir o Sploit e ver o estado no contexto (Instruções do arquivo).

## Armadilhas

- Config do Sploit **não é hot-reloaded**: qualquer mudança exige reiniciar.
- Windows/PowerShell 5.1: não usar `&&` como separador em comandos multi-etapa.
- `bun install` em `sploit-src/` falha sem Visual Studio Build Tools (tree-sitter). Não re-adicionar os três pacotes a `trustedDependencies`.
- Groq free: limite 8k TPM. Só usar em tarefas pequenas (title/small).
- Erro "Failed to fetch models.dev" no log é só o catálogo de modelos offline; não afeta o modelo configurado. Pendente investigar (rede do usuário funciona).
- Sempre atualizar `# Próximo passo` antes de encerrar sessão. **Nunca terminar sem ele preenchido.**
