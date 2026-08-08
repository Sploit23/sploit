---
description: Registra uma decisao de arquitetura no DECISOES.md (o por que, nao o que)
---

Registre a decisao pedida na memoria de decisoes do Sploit:

1. Leia o arquivo `DECISOES.md` na raiz do repo para entender o formato e evitar duplicacao.
2. Anexe a entrada no fim da secao `## Decisoes`, seguindo exatamente o formato:
   ```
   ## [AAAA-MM-DD] Titulo curto
   - **Decisao**: ...
   - **Motivo**: ...
   - **Alternativas rejeitadas**: ...
   - **Status**: ativa | substituida (por ...)
   ```
3. Regras:
   - Registre o POR QUE (decisao e razao), nao o como tecnicamente — detalhes vao para o Graphify.
   - Se a decisao substitui outra, marque a antiga como "substituida (por ...)".
   - Se a decisao ja existe, apenas atualize-a (nao duplique).
4. Confirme ao usuario em PT-BR o que foi registrado.
5. Se a decisao envolveu mudanca de config/skill/plugin, lembre que precisa reiniciar o Sploit.
