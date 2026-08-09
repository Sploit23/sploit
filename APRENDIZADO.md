# APRENDIZADO.md — lições destiladas do uso real

> Memória coletiva do Sploit: o que qualquer instância aprendeu, todas sabem.
> Este arquivo viaja no git e é lido no início de toda sessão (instruction).
> Formato: cada lição é 1-3 linhas, em português, sem jargão de motor.
> As lições são gravadas automaticamente pelo diagnóstico — ninguém digita comando.
> Manter enxuto: conhecimento destilado, nunca logs nem dados brutos.
> IDs (L-edit, L-bash, ...) são estáveis e gerados pelo diagnostico.py.

## Lições

- **L-git — Para desfazer UMA feature, usar `git revert <commit>`, não `reset` para um commit-base** (origem: G5 perdida).
  O reset desfaz tudo que veio depois do commit-base. Um revert da small_model
  fez `reset` para 2bbca6e e jogou fora a Geração 5 (72851dd) junto — a memória
  (SPLOIT_STATE) ficou registrando "G5 ativada" e o binário nunca teve a mutação.

- **L-bash — Nunca rodar servidor/daemon de forma síncrona** (origem: 3 aborts no sploit-web).
  Um servidor rodado na tool de shell trava até o timeout de 120s. Usar
  `Start-Process`/`-Detached`/`start /b` e retornar na hora.

- **L7 — Arquivo grande: não ler inteiro repetido** (origem: pico de contexto de 132k).
  Ler arquivo de 27-66 KB inteiro de novo enche o contexto. Usar `offset`/`limit`
  no read e `grep` para localizar o trecho antes.

- **L8 — Erros de ferramenta precisam ser acionáveis** (origem: "ripgrep execution failed").
  Um erro opaco engole a causa. O erro deve dizer o que o agente pode fazer
  (ex.: "Path not found: <caminho>"). Agente: se um erro não indica o problema,
  investigar a causa raiz antes de tentar de novo.

- **L10 — Prompt de retomada com espaços precisa de aspas no relaunch** (origem: restart 20:04).
  `Start-Process -ArgumentList` do PowerShell 5.1 junta arrays sem re-quotar.
  Qualquer texto com espaços/parênteses passado como argumento precisa de aspas embutidas.

## Regras para o agente (automatizadas)

- Quando o diagnóstico detecta uma falha de disciplina cuja lição ainda não está
  registrada aqui, gravar automaticamente (sem pedir comando ao usuário).
- Se uma melhoria de motor é aprovada, registrar a lição aqui também.
- Nunca duplicar: mesma lição com mesmo título = pular.

- **L-edit — Reler o arquivo antes de editar** (origem: oldString obsoleto).
  Se o arquivo mudou desde a ultima leitura, reler antes de editar.
