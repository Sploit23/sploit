## Sploit-Forge work (multi-PC remote control product)

Before doing anything in this area, read `PROJECT_STATUS.md` at the repo
root — it has the current architecture, which machines are real/online,
what already works, known gotchas, and the deploy workflow. Don't
rebuild that context from scratch or guess at it.

See `AGENTS.md` for general repo/style conventions.

## Continuidade entre PCs (Sploit-Forge)

Este projeto pode ser trabalhado em mais de um PC da malha Sploit-Forge
(ex: Casa, Escritório), por engines diferentes (opencode ou Claude Code).

- No INÍCIO de qualquer sessão: leia `.sploit-handoff.md` (se existir) pra
  saber onde a última sessão parou. Se este projeto for um repositório git
  com remote configurado, dê `git pull` antes de começar.
- No FIM de qualquer sessão (ou de qualquer pedido que mudou algo):
  reescreva `.sploit-handoff.md` com data/hora, o que foi feito, estado
  atual e o próximo passo. Se houve mudança de código e existe remote
  git, comite e dê `git push`.
- Nunca pule esses dois passos -- é assim que a pessoa consegue continuar
  o mesmo projeto de outro PC ou do celular depois.
