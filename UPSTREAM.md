# Sincronização com o upstream (opencode)

O Sploit é um fork do [opencode](https://github.com/anomalyco/opencode). O código do
motor vive em `sploit-src/` e herda o histórico do upstream — manter o fork sincronizado
é o que garante correções, novos modelos e melhorias de graça, sem refazer trabalho.

## Setup (já feito neste PC)

```
git remote add upstream https://github.com/anomalyco/opencode.git
```

- `origin` → `Sploit23/sploit` (seu fork, onde o trabalho é commitado)
- `upstream` → `anomalyco/opencode` (somente leitura; branch padrão `dev`)
- Nunca pushar para `upstream`.

## Processo de sync (diff-apply — merge NÃO funciona)

> **Importante**: o histórico do fork foi reconstruído no push forçado de 16/08/2026
> (`sploit-src/` movido para subpasta). Não existe ancestral comum com o upstream —
> `git merge upstream/dev` falha ("unrelated histories") e `git diff master...upstream`
> não produz nada útil. O método correto é **diff-apply**: gerar patches do upstream
> desde o último baseline e aplicá-los remapeando os caminhos.

O baseline fica em `.upstream-sync` (BASE = ponto de partida do fork, SYNCED = até
onde o upstream já foi aplicado).

1. **Buscar o upstream e medir o tamanho do sync:**
   ```
   git fetch upstream
   git log --oneline <SYNCED>..upstream/dev | Measure-Object -Line
   ```

2. **Criar branch de sync:**
   ```
   git checkout -b sync-upstream-<aaaammdd>
   ```

3. **Aplicar arquivo por arquivo** (o `git apply -3` é ATÔMICO: se qualquer hunk
   falhar, o arquivo inteiro é rejeitado — por isso o loop por arquivo):
   ```powershell
   $base = "<SYNCED do .upstream-sync>"
   $files = git diff --name-only $base upstream/dev -- . ':!sploit-src'
   # para cada arquivo: pular os que o fork não carrega; para o resto:
   git diff --output=$env:TEMP\opencode\p.patch $base upstream/dev -- <arquivo>
   git apply -3 --directory=sploit-src $env:TEMP\opencode\p.patch
   ```
   Regras do loop:
   - **Nunca usar redirecionamento `>`** para gerar o patch (PowerShell grava UTF-16
     e corrompe) — sempre `--output=` do git.
   - `--output=` deve vir **antes** do separador `--` do pathspec.
   - Registrar OK/SKIP/CONFLICT por arquivo num log (ex.: `$env:TEMP\opencode\sync_log.txt`).
   - SKIP = arquivos que o fork não carrega (identidade, docs de marca, infra de
     console/billing, `.github` de release do upstream etc.).

4. **Resolver conflitos.** Convenções:
   - **Escopo renomeado**: manter `@sploit-ai/*` nos imports (o upstream usa
     `@opencode-ai/*`). Exceções que JÁ são assim no fork: `@opencode-ai/cli`,
     `@opencode-ai/plugin` → `packages/plugin-legacy`, `@opencode-ai/console-core`.
   - **package.json**: adotar versões novas do upstream, manter nome/versão do fork.
   - **Mudanças próprias no motor** (retryDelayFromBody, anchors do buildPrompt,
     reminders): preservar as duas partes quando possível.
   - **Arquivos novos do upstream**: depois do apply, varrer os mudados procurando
     imports `@opencode-ai/` e renomear para `@sploit-ai/` onde o pacote existir.
     Arquivo novo que importa pacote que o fork não tem (ex.: `console-core`) → **apagar**.
   - **bun.lock**: nunca resolver na mão — voltar ao nosso e regenerar com `bun install`.

5. **Regenerar lockfile** (na raiz `sploit-src/`):
   ```
   & "$env:APPDATA\npm\bun.cmd" install
   ```
   Se o upstream subiu deps rápidas e bater a política `minimumReleaseAge` (3 dias),
   zere temporariamente `minimumReleaseAge` no `bunfig.toml`, rode o install e
   **restaure o valor** antes de commitar.

6. **Validar** (obrigatório antes de commitar):
   ```
   # na raiz sploit-src/ (PATH precisa achar o bun para o turbo):
   $env:Path = "$env:APPDATA\npm;$env:Path"
   & "$env:APPDATA\npm\bun.cmd" run typecheck    # cobre todos os workspaces
   ```
   ```
   .\scripts\build-sploit.ps1               # smoke test incluído
   ```

7. **Fechar o sync:**
   - Atualizar `.upstream-sync`: `SYNCED=<sha do upstream/dev>` + data.
   - Commit atômico do sync na branch, merge na master, push.

8. **Publicar para os outros PCs:**
   ```
   git push origin master
   .\scripts\release.ps1                    # gera pacote; ver fluxo em scripts/release.ps1
   ```
   Nos outros PCs: rodar o instalador do novo pacote (mesmo fluxo de atualização
   de sempre).

## Cadência recomendada

- **Sync leve a cada 2–4 semanas** (ou antes de precisar de feature/correção nova).
- Quanto mais tempo sem sincronizar, maior o conflito acumulado — syncs pequenos e
  frequentes são muito mais baratos.
- Se um merge ficar grande demais, dividir: primeiro arquivos sem conflito, depois
  os pontos quentes um a um, validando o build entre etapas (`git add -p` ajuda).

## Checklist rápido

- [ ] `git fetch upstream` + comparar com SYNCED do `.upstream-sync`
- [ ] Branch `sync-upstream-<aaaammdd>` criada
- [ ] Loop diff-apply por arquivo (log OK/SKIP/CONFLICT)
- [ ] Conflitos: escopo `@sploit-ai` mantido? Mutações próprias preservadas?
- [ ] Varrer imports `@opencode-ai/` nos arquivos novos
- [ ] `bun install` (lockfile regenerado; `minimumReleaseAge` restaurado)
- [ ] `bun run typecheck` na raiz (16/16) + `.\scripts\build-sploit.ps1` com smoke test
- [ ] `.upstream-sync` atualizado (SYNCED = upstream/dev) + commit + merge na master
- [ ] `sploit run` ponta a ponta num projeto real
- [ ] `git push origin master` + release para os outros PCs
