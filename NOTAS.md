# NOTAS.md — Memória temporal de trabalho do Sploit

> Detalhe histórico do quê foi feito por sessão (o SPLOIT_STATE.md guarda o estado
> vivo e o DECISOES.md as decisões). Indexado no Graphify — sessões futuras
> recuperam por `graphify query`, não por texto achatado. Registrar: `/resumo`.

## [2026-08-08] Iteracao 5 — diferenciais funcionais
- **Feito**: comandos `/saude` (scripts/saude.py: tokens, custo estimado, cache,
  compactacoes, contexto efetivo), `/planejar` (impacto no grafo antes de editar)
  e `/decisao` (registro em DECISOES.md). Bug do restart corrigido com
  `scripts/relaunch.ps1` (relancamento desanexado — janela volta sozinha).
- **Verificado**: `/saude` com saida real (474 turnos, 92,4% cache, pico 144k,
  custo estimado US$ 24,18); relauncher testado isoladamente (PID 999999 -> novo
  processo vivo). Graphify reindexado: 28756 nos, 55518 arestas, 2427 comunidades.
- **Pendente**: validar relaunch desanexado em restart real com mudanca de binario.
- **Referencias**: DECISOES.md, scripts/saude.py, scripts/relaunch.ps1,
  .sploit/command/{saude,planejar,decisao,resumo}.md, SPLOIT_STATE.md
