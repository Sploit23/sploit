# DECISOES.md — Memória de decisões de arquitetura do Sploit

> Registro de **decisões** (o porquê), não de tarefas (o quê). Cada entrada responde:
> "por que o Sploit é assim?". Mantenha-a enxuta — detalhes técnicos vão para o Graphify.
> Comando para registrar: `/decisao`.

## Formato

```
## [DATA] Título curto
- **Decisão**: ...
- **Motivo**: ...
- **Alternativas rejeitadas**: ...
- **Status**: ativa | substituída (por ...)
```

## Decisões

## [2026-08-08] Diferenciais funcionais primeiro, aparência depois
- **Decisão**: Iteração 5 foca em funcionalidade que nenhum outro agente tem
  (`/saude`, `/planejar`, `/decisao`) e não em cosmética.
- **Motivo**: o usuário cobrou "coisas que outros agentes ainda não têm"; identidade
  visual (Iteração 4) já estava validada.
- **Alternativas rejeitadas**: mais mudanças visuais na TUI (ganho marginal).
- **Status**: ativa

## [2026-08-08] Custo estimado local, não do provider
- **Decisão**: `/saude` calcula custo estimado com preços locais (constantes no
  script) porque o provider `opencode`/`big-pickle` não persiste custo por mensagem.
- **Motivo**: transparência de custo real por sessão; o motor calcula (session.ts:391)
  mas não grava no DB.
- **Alternativas rejeitadas**: depender do campo `cost` do banco (sempre 0).
- **Status**: ativa

## [2026-08-08] Planejamento com consciência de impacto
- **Decisão**: `/planejar` mapeia via Graphify as comunidades afetadas antes de
  qualquer edição e exige plano de verificação aprovado pelo usuário.
- **Motivo**: o Sploit é o único agente com grafo de conhecimento do próprio código;
  usá-lo elimina edição às cegas e define verificações obrigatórias (typecheck/build).
- **Alternativas rejeitadas**: editar direto e só verificar depois (comportamento padrão
  dos outros agentes).
- **Status**: ativa

## [2026-08-08] Estado enxuto em SPLOIT_STATE.md (regra 2)
- **Decisão**: SPLOIT_STATE.md é podado periodicamente (~1.500 tokens/turno); detalhes
  históricos migram para o Graphify.
- **Motivo**: o arquivo é lido em toda sessão — custo de contexto é estratégico.
- **Alternativas rejeitadas**: flag de injeção condicional no motor (custo/benefício ruim).
- **Status**: ativa

## [2026-08-08] Shim plugin-legacy para typecheck-clean
- **Decisão**: `packages/plugin-legacy` re-exporta `@opencode-ai/plugin` e
  `overrides` no package.json aponta para o workspace; NÃO usar `paths` do tsconfig
  nem junction do bun.
- **Motivo**: tsgo ignora `paths` dentro de node_modules; o shim foi a única via
  typecheck-clean do monorepo.
- **Alternativas rejeitadas**: `paths` no tsconfig, junction do bun (não funcionam),
  re-add dos tree-sitter a trustedDependencies (requer Build Tools).
- **Status**: ativa (não desfazer)

## [2026-08-08] Ciclo de auto-atualização com rollback
- **Decisão**: toda mudança no motor passa por build com `.bak` + smoke test +
  `self-restart.ps1` (mata, copia, relança `--continue`; restaura `.bak` se morrer).
- **Motivo**: o Sploit nunca pode ficar "sem abrir"; troca do exe em uso é impossível
  por cópia direta.
- **Alternativas rejeitadas**: sobrescrever `sploit.exe` direto (IOException em uso).
- **Status**: ativa


## [2026-08-08] Decisoes indexadas no grafo de conhecimento
- **Decisao**: DECISOES.md participa do Graphify (reindexado) e e citado no AGENTS.md
  como memoria a consultar antes de decisoes relevantes.
- **Motivo**: decisao e o ativo mais valioso entre sessoes — indexar no grafo permite
  retomar contexto por referencia (graphify query) em qualquer sessao futura.
- **Alternativas rejeitadas**: manter so no SPLOIT_STATE.md (fonte unica = ponto de falha
  e custo de contexto).
- **Status**: ativa
