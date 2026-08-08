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


## [2026-08-08] Acesso remoto - fase 1 (rede local)
- **Feito**: scripts/sploit-web.ps1 sobe sploit web com senha (sploit-web.secret,
  gitignored, gerada na 1a execucao) + mdns. Testado: 401 sem senha, 200 com senha,
  acessivel em http://192.168.100.174:4096 (IP do PC), UI mobile (viewport).
- **Verificado**: servidor de teste subiu (PID 18000) e foi encerrado; senha
  atual: OxZsBnyrfNUeKdcA (viva em sploit-web.secret).
- **Pendente**: teste manual no celular do usuario; fase 2 = bot Telegram.
- **Referencias**: scripts/sploit-web.ps1, DECISOES.md, .gitignore
