---
description: Indexa o resumo estruturado do trabalho da sessao no grafo Graphify (continuidade por referencia)
---

Gere e indexe um resumo estruturado do trabalho realizado nesta sessao, para que
sessoes futuras reconstruam contexto por consulta ao grafo (nao por texto achatado):

1. **Reconstrua o contexto da sessao**: consulte o grafo (`graphify query`) com
   foco no trabalho desta sessao para recuperar o que ja foi decidido/feito antes.

2. **Gere o resumo em formato estruturado**, cobrindo:
   - O que foi feito (mudancas, commits, arquivos tocados).
   - Decisoes tomadas (registrar com `/decisao` se relevante).
   - Verificacoes realizadas (typecheck/build/test) e seus resultados.
   - Pendentes / proximos passos.
   - Referencias a nos do grafo (arquivos, modulos, comunidades afetadas).

3. **Grave no arquivo `NOTAS.md`** (na raiz), anexando com data:
   ```
   ## [AAAA-MM-DD] Sessao <resumo curto do tema>
   - **Feito**: ...
   - **Verificado**: ...
   - **Pendente**: ...
   - **Referencias**: nos/arquivos-chave
   ```

4. **Indexe no grafo**: rode `venv\Scripts\graphify.exe update C:\Users\Hp\Desktop\sploit`
   para que `NOTAS.md` (e demais mudancas) entrem no grafo.

5. Confirme ao usuario em PT-BR o que foi indexado e que sessoes futuras poderao
   recuperar por `graphify query` (referencia), mantendo o contexto enxuto.

Regra: nao duplique conteudo do SPLOIT_STATE.md nem do DECISOES.md — `NOTAS.md` e
para o detalhe temporal (o quê/histórico); o estado e as decisoes ficam nos arquivos deles.
