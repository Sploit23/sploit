---
description: Diagnostico de saude da sessao atual (tokens, custo, cache, compactacoes, contexto efetivo)
---

Reporte a saude da sessao atual do Sploit em PT-BR:

1. Rode `python scripts/saude.py` (na raiz do repo) para coletar os dados do banco local.
2. Se a sessao desejada nao for a mais recente, rode `python scripts/saude.py <session_id>`.
3. Apresente ao usuario um resumo em PT-BR, destacando:
   - **Contexto efetivo** (pico de cache read): quanto o modelo carrega por turno.
   - **Eficiencia de cache**: % dos tokens vindos do cache (alto = barato e rapido).
   - **Materia nova por turno** (media de input novo): se estiver subindo, ha desvio de contexto.
   - **Compactacoes**: frequencia de compactacao do historico.
   - **Custo e tokens totais** da sessao.
4. Compare com sessoes anteriores (tabela no final do script) e aponte tendencias ou anomalias.
5. Se algo estiver fora do normal (ex.: contexto pico acima de ~90% do limite, muitas compactacoes,
   eficiencia de cache caindo), sugira acoes concretas (podar estado, fechar sessao, /retomar).
