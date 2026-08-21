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

## Processo de sync

1. **Buscar o upstream:**
   ```
   git fetch upstream
   ```

2. **Ver o que mudou antes de mergear** (evita surpresa):
   ```
   git log --oneline master..upstream/dev | Measure-Object -Line
   git diff --stat master...upstream/dev -- sploit-src/
   ```

3. **Mergear na sua master:**
   ```
   git checkout master
   git merge upstream/dev
   ```

4. **Resolver conflitos.** Pontos quentes conhecidos:
   - **Escopo renomeado**: o fork renomeia `@opencode-ai/*` → `@sploit-ai/*` em
     centenas de imports. Qualquer arquivo que o upstream tocar nesses imports vai
     conflitar. Regra: **manter sempre o escopo `@sploit-ai`**.
   - **Branding/identidade**: nomes, URLs e textos trocados de "opencode" para
     "sploit" conflitam em TUI, CLI, docs e configs. Regra: manter "sploit".
   - **Mudanças próprias no motor** (ex.: fix do SDK de plugin em
     `src/config/config.ts` e `src/config/tui.ts`): comparar com a intenção do
     upstream e preservar as duas partes quando possível.
   - Minimizar atrito futuro: **evite renomear/mover arquivos sem necessidade** e
     mantenha mudanças próprias pequenas e localizadas.

5. **Validar depois do merge** (obrigatório antes de commitar o merge):
   ```
   cd sploit-src/packages/opencode
   & "$env:APPDATA\npm\bun.cmd" install     # só se package.json/bun.lock mudou
   & "$env:APPDATA\npm\bun.cmd" run typecheck
   ```
   ```
   .\scripts\build-sploit.ps1               # smoke test incluído
   ```

6. **Publicar para os outros PCs:**
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

- [ ] `git fetch upstream`
- [ ] `git merge upstream/dev`
- [ ] Conflitos: escopo `@sploit-ai` mantido? Branding "sploit" mantido?
- [ ] `bun install` (se deps mudaram) + `bun typecheck`
- [ ] `.\scripts\build-sploit.ps1` com smoke test passando
- [ ] `sploit run` ponta a ponta num projeto real
- [ ] `git push origin master` + release para os outros PCs
