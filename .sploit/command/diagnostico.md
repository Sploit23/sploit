---
description: Diagnostico do harness da sessao atual (falhas de ferramenta, arquivos centrais do grafo, turnos caros, compactacoes)
---

Reporte o diagnostico do harness do Sploit em PT-BR:

1. Rode `python scripts/diagnostico.py` (na raiz do repo) para coletar os dados do banco local cruzados com o grafo.
2. Se a sessao desejada nao for a mais recente, rode `python scripts/diagnostico.py <session_id>`.
3. Apresente ao usuario um resumo em PT-BR, destacando:
   - **Falhas de ferramenta**: quais ferramentas falharam, quantas vezes, e os arquivos envolvidos.
     Se uma falha se repete no mesmo arquivo/ferramenta, aponte a causa provavel (ex.: edit com oldString
     divergindo por autocrlf, bash abortado por timeout).
   - **Arquivos centrais do grafo tocados**: onde o harness concentra risco (degree alto = arquivo que muitos
     outros dependem). Editar esses arquivos tem alto custo de contexto; recomende /planejar antes.
   - **Turnos mais caros**: o que o turno fez (tools usadas) que custou tanto contexto.
   - **Compactacoes**: frequencia e se as ancoras do grafo estao sendo preservadas no resumo.
4. Compare com sessoes anteriores se existirem e aponte tendencias.
5. Fechamento: aponte UMA acao concreta mais valiosa para o harness (ex.: evitar chamada cara,
   revisar padrao de edicao, podar contexto). Nao enumere mais de 2 sugestoes.
