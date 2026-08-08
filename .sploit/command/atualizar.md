---
description: Ciclo de auto-melhoria com aprovação do usuário (editar, testar, build, reiniciar com rollback)
---

Siga o protocolo de auto-melhoria do Sploit com aprovação do usuário:

1. **Proposta**: apresente ao usuário, em PT-BR, o que será mudado e o impacto.
   Aguarde a aprovação EXPLÍCITA antes de editar qualquer código.
   NUNCA modifique `sploit-src/` sem aprovação.

2. **Edição**: faça as alterações. Cada alteração em `sploit-src/` é um commit
   atômico em separado, nunca misturada com mudanças de config.

3. **Verificação**: rode `bun typecheck` em `sploit-src/packages/opencode`.
   Se houver testes aplicáveis ao que mudou, rode-os.

4. **Build com backup**: rode `scripts/build-sploit.ps1` — ele recompila
   `sploit.exe` e cria `sploit.exe.bak` (known-good) antes de sobrescrever.

5. **Smoke test**: rode `scripts/self-restart.ps1 -SkipSmoke` NÃO — rode
   primeiro o smoke test isolado para validar o binário novo antes de reiniciar:
   `& sploit.exe doctor`. Se falhar, faça rollback manual com
   `Copy-Item sploit.exe.bak sploit.exe -Force` e corrija o código.

6. **Commit do código** com mensagem no padrão do repo (`sploit: <tipo>: <desc>`).

7. **Atualizar estado**: registre em `SPLOIT_STATE.md` o Progresso, o novo
   Próximo passo e o resultado da Verificação. Comite o estado.

8. **Reinício**: informe ao usuário que vai reiniciar e rode
   `scripts/self-restart.ps1`. O script mata o processo atual e relança
   `sploit --continue` com o binário novo. Se o binário novo morrer no boot,
   o script restaura automaticamente `sploit.exe.bak` e relança com o antigo
   (rollback — o Sploit nunca fica "sem abrir").

9. **Confirmação pós-reinício**: na sessão seguinte, verifique que o Sploit
   abriu com o binário novo (ex.: comportamento novo / `sploit doctor` sem
   erros) e registre a confirmação em `SPLOIT_STATE.md`.

Lembre-se: se o usuário recusar a proposta em qualquer etapa, NÃO prossiga —
documente a decisão no estado e aguarde nova instrução.
