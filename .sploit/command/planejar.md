---
description: Planeja uma mudanca mapeando primeiro o impacto real no codigo (via grafo Graphify)
---

Planeje a mudanca pedida com consciencia de impacto REAL no codigo, usando o grafo de conhecimento:

1. **Entenda a tarefa**: leia o pedido e reescreva em uma frase o objetivo e o que deve continuar funcionando.

2. **Mapeie o impacto antes de editar** (diferencial do Sploit):
   - Consulte o grafo (Graphify) com a questao focada na mudanca: `graphify query` ou `graphify_get_node`/`graphify_get_neighbors` nos modulos envolvidos.
   - Identifique as **comunidades afetadas** e os **consumidores** dos modulos que serao tocados (quem importa/carrega aquilo).
   - Liste arquivos-alvo E arquivos-de-risco (dependencias que podem quebrar).

3. **Gere o plano de verificacao** com o impacto mapeado:
   - Quais arquivos editar (com caminho exato).
   - Quais dependencias/consumidores conferir depois.
   - Quais verificacoes rodar (typecheck, build, testes — sempre as aplicaveis).
   - Se a mudanca for em `sploit-src/`: `bun typecheck` em `sploit-src/packages/opencode` + `scripts/build-sploit.ps1`.

4. **Mostre o plano ao usuario** em PT-BR ANTES de editar, incluindo a secao de impacto ("Esta mudanca toca X, consumido por Y; risco em Z").

5. So depois da aprovacao, edite — e execute o plano de verificacao ponto a ponto, marcando cada etapa.

6. Ao concluir, diga em PT-BR o que foi verificado e se ficou algo pendente (ex.: reindexar Graphify com `/graphify .`).
