# SPLOIT_STATE.md — Memória de Auto-Melhoria

> Memória viva do Sploit, lida em toda sessão (via `instructions` no `sploit.json`).
> **REGRA DE OURO:** antes de encerrar sessão, atualize `# Próximo passo` e `# Progresso`.
> **REGRA 2:** este arquivo custa ~3k tokens/turno — mantenha-o enxuto. Detalhes
> históricos vão para o Graphify (`graphify-out/`), não para cá.

## Missão

Transformar o Sploit em ferramenta de codificação indispensável — rápida, confiável,
com identidade própria forte ("não consigo mais programar sem o Sploit").

Princípios:
- **Básico bem feito > quantidade de recursos**; mudanças com propósito claro.
- **Economia de tokens é estratégica** (memória, grafo, compactação, tools certas).
- **Identidade própria**: cada iteração deve afastar o Sploit do fork opencode
  (TUI, idioma, UX, marca, diferenciais).
- Verificável: typecheck/build/test antes de concluir passo.
- Pequenos commits atômicos (`sploit: <tipo>: <descrição>`, PT-BR); nunca quebrar o raiz.
- Memória é a fundação: SPLOIT_STATE.md é a fonte da verdade entre sessões.
- Pesquisar novidades com parcimônia: observar, filtrar, adotar só o que serve.

## Plano

- [x] Memória persistente (SPLOIT_STATE.md + instructions + /retomar)
- [x] Modelos (plan/build = big-pickle; small_model = groq/gpt-oss-120b)
- [x] Ciclo de auto-atualização seguro (build com backup + smoke test + rollback + /atualizar)
- [x] Iteração 1: base sólida (typecheck-clean + Graphify + dicas PT-BR)
- [x] Iteração 2: TUI 100% PT-BR (traduções validadas no binário)
- [x] Iteração 3: economia de tokens (poda do estado -55%, diagnóstico, disciplina de tools)
- [x] Iteração 4: identidade (marca PT-BR no rodapé — validada no binário PID 17976)
- [ ] Iteração 5: diferenciais funcionais (`/saude`, `/planejar` — feitos; avaliar próximos)

## Progresso

- **Memória** (d0fd696): SPLOIT_STATE.md + `instructions` no sploit.json + AGENTS.md
  raiz ("Auto-melhoria") + `/retomar` + AGENTS.md global (ler estado no início).
- **Ciclo seguro de auto-atualização**: `build-sploit.ps1` gera `sploit.exe.bak`
  (known-good); `self-restart.ps1` roda `sploit doctor` antes de matar o processo,
  relança `--continue`, restaura `.bak` se o binário novo morrer; `/atualizar`.
  Bugs corrigidos: cópia pós-kill (arquivo em uso), `NativeCommandError` do PS 5.1
  no doctor (`$ErrorActionPreference="Continue"` temporário), BOM UTF-8 obrigatório
  em .ps1 (senão acentos corrompem o parse).
- **Iteração 1** ✔: typecheck-clean do monorepo via shim `packages/plugin-legacy`
  (nome `@opencode-ai/plugin` → re-exporta `@sploit-ai/plugin`, exports
  `.`/`./tool`/`./tui`/`./v2/effect`/`./v2/promise`) + `overrides` no package.json
  do sploit-src (`"@opencode-ai/plugin": "workspace:packages/plugin-legacy"`). NÃO
  funciona: `paths` no tsconfig (tsgo ignora node_modules) e junction do bun. tsconfig
  do shim precisa `lib: ["ESNext","DOM","DOM.Iterable"]`. Commit `9093011`. Graphify
  indexado: 28737 nós, 55500 arestas, 2415 comunidades (`graphify-out/`, gitignored).
  Validado no binário via self-restart (PID 2576).
- **Iteração 2** ✔: TUI 100% PT-BR — 165 trechos em 23 arquivos (permissões, diálogos,
  toasts, menus da sessão, placeholders, which-key, diff-viewer, sidebar/mcp,
  autocomplete). Textos OpenCode Zen/Go mantidos (links funcionais para keys grátis).
  Commit `815535f`. Validado no binário (10:36:06, PID 19732), usuário aprovou.
- **Iteração 3** ✔ (concluída): diagnóstico da sessão — 1,93M tokens de entrada, 31,8M
  cache read, 395 turnos, pico ~98k contexto, ~4,9k tokens novos/turno (caching OK),
  compactação ativa (9 eventos). Custo fixo por turno ≈ 8,2k tokens de instruções.
  Poda do SPLOIT_STATE.md: 3.344 → ~1.500 tokens/turno (-55%), commit `bda293d`.
  Flag de injeção condicional descartada (custo/benefício ruim). Disciplina de contexto
  adotada (Graphify antes de grep; read com limits). Medição: `%TEMP%\sploit\tokens*.py`
  contra `~\.local\share\sploit\opencode-sploit.db`.
- **Iteração 4** ✔: identidade — marca do rodapé em PT-BR ("Criado por Flávio
  Alex", "obrigado por usar o sploit ♥"), commit `d1cc754` no sploit-src; binário
  novo (11:03:42) validado no processo atual (PID 17976). Graphify reindexado
  após Iterações 2-3 (28737 nós, 55500 arestas). `sploit-master.zip` (download
  duplicado, 83MB) adicionado ao `.gitignore`.
- **Iteração 5** (em curso): diferenciais funcionais — `/saude` (script
  `scripts/saude.py` lê o DB e reporta tokens/custo/cache/compactações/contexto
  efetivo em PT-BR) e `/planejar` (mapeia impacto no grafo antes de editar;
  comunidades afetadas + plano de verificação). Diagnóstico real: 2,85M tokens
  de entrada, 37,5M cache read (92,7% eficiente), 455 turnos, pico 144k,
  6 compactações, 518 chamadas de ferramenta. Config não é hot-reloaded.

## Próximo passo

Iteração 5 em curso — diferenciais funcionais. `/saude` e `/planejar` prontos e
validados (saída real do DB acima). Próximos candidatos, em ordem de valor:
  1. Continuar na cola de diferenciais funcionais (ex.: memória de decisões
     indexada no grafo para retomar contexto entre sessões).
  2. Rodar `/saude` periodicamente para medir impacto das mudanças na economia.
  3. Avaliar com o usuário quais diferenciais valem o esforço de build no motor.

## Verificação

- Typecheck monorepo: **0 erros** (shim plugin-legacy + overrides) ✔
- Typecheck `tui`: OK (0 erros) após traduções PT-BR ✔
- Build: `scripts/build-sploit.ps1` OK (smoke `0.1.0-sploit`; cópia falha por arquivo
  em uso — esperado, a troca é do `self-restart.ps1`) ✔
- self-restart validado 2x (Iterações 1 e 2): smoke OK, `.bak` criado, conversa
  retomada com `--continue` ✔
- Iteração 2 validada no binário (PID 19732); usuário confirmou ("ficou muito bom") ✔
- Iteração 4 validada no binário (PID 17976) — marca PT-BR no rodapé ✔
- Iteração 5: `/saude` rodado com saída real (455 turnos, 92,7% cache, pico 144k) ✔
- Injeção do `SPLOIT_STATE.md`: este texto é a prova de que está no contexto ✔

## Armadilhas

- Config do Sploit **não é hot-reloaded**: qualquer mudança exige reiniciar.
- Windows/PowerShell 5.1: não usar `&&`; todo `.ps1` do repo precisa de BOM UTF-8
  (3 primeiros bytes `EF BB BF`) — conferir após editar.
- `bun install` em `sploit-src/` falha sem Visual Studio Build Tools (tree-sitter).
  Não re-adicionar os 3 pacotes a `trustedDependencies`.
- Groq free: limite 8k TPM. Só usar em tarefas pequenas (title/small).
- Erro "Failed to fetch models.dev" no log: só o catálogo de modelos offline; não
  afeta o modelo configurado.
- **Build enquanto o Sploit roda**: `build-sploit.ps1` não sobrescreve `sploit.exe`
  em uso (IOException esperado). A troca é do `self-restart.ps1` (smoke no `dist/`,
  encerra o processo, copia, relança).
- **Typecheck do opencode**: erros em `src/plugin/index.ts` RESOLVIDOS via shim
  plugin-legacy + overrides. Se voltarem, checar se o lockfile re-registrou
  `opencode-gitlab-auth/@opencode-ai/plugin@1.18.11` do npm.
- **tsgo não aplica `paths` a imports dentro de node_modules**: redirecionar pacote
  npm duplicado exige shim de workspace + overrides.
- Sempre atualizar `# Próximo passo` antes de encerrar sessão. Nunca terminar sem ele.
