---
description: Fila de auto-melhoria do arnes (propostos, aprovados, implementados)
---

Gerencie a fila de auto-melhoria do arnes do Sploit (o diferencial: o agente melhora o proprio harness):

1. Rode `python scripts/fila.py` para listar os candidatos.
2. Para cada candidato `[ ]` (proposto), apresente ao usuario:
   - o titulo, a evidencia (por que existe) e a verificacao (como provar que melhorou).
   - use `python scripts/fila.py ver <id>` para detalhes.
3. Pergunte ao usuario qual implementar (ou negar). Nao implemente sem aprovacao explicita.
4. Aprovado: rode `python scripts/fila.py fazer <id>` e implemente a melhoria:
   - se for mudanca no motor (`sploit-src/`): rode `bun typecheck` e `scripts/build-sploit.ps1`,
     depois `scripts/self-restart.ps1` para ativar. Se falhar, o binario anterior e restaurado.
   - se for mudanca de config/scripts: nao precisa rebuild, mas lembre o usuario de reiniciar se aplicavel.
5. Ao concluir e validar: `python scripts/fila.py feito <id> <commit>`.
6. Se o usuario rejeitou: `python scripts/fila.py negar <id>`. Se um rollback aconteceu: `python scripts/fila.py reverter <id>`.
7. Fechamento: diga o que ficou melhor e como foi verificado. Se houver candidato que exige rebuild,
   rode o ciclo de verificacao do AGENTS.md antes de encerrar.
