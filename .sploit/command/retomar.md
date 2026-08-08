---
description: Retoma a auto-melhoria do Sploit a partir do estado salvo em SPLOIT_STATE.md
---

Leia o arquivo `SPLOIT_STATE.md` na raiz do repositório.

Siga o protocolo de auto-melhoria:

1. Identifique a seção `# Próximo passo` e o checklist em `# Plano`.
2. Continue exatamente de onde o estado indica que a sessão anterior parou — não recomece do zero.
3. Execute o próximo passo pendente, com verificação (typecheck/build/test quando aplicável).
4. Ao concluir o passo, atualize `SPLOIT_STATE.md`: marque o item no `# Plano`, registre o que fez em `# Progresso` (com data e hash de commit) e defina o novo `# Próximo passo`.
5. Faça um commit atômico da mudança com mensagem no padrão do repo (`sploit: <tipo>: <descrição>`, PT-BR).
6. Informe ao usuário o que foi feito e se é necessário reiniciar o Sploit (config/skills/plugins não são hot-reloaded).

Se não houver próximo passo pendente, proponha a próxima iteração de melhorias e pergunte ao usuário antes de executar.
