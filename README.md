<p align="center">
  <strong>SPLOIT</strong>
</p>
<p align="center">CLI de agente de código (fork do <a href="https://github.com/sst/opencode">opencode</a>) + FORGE, controle remoto de sessões pelo celular.</p>

---

### O que é

- **Sploit** — CLI de agente de código no terminal, com um agente extra,
  o **coordinator**, que registra projetos e roteia instruções entre
  sessões de diretórios diferentes (`src/coordinator/`,
  `src/tool/coordinator.ts`).
- **FORGE** — PWA + servidor Node que dá controle remoto, pelo celular,
  de sessões de terminal (opencode/claude/shell) rodando num PC, via
  Tailscale. Código em `packages/opencode/src/cli/cmd/forge/`.

### Arquitetura recomendada: 1 PC gráfico + N bots

Não existe servidor central — cada PC roda seu próprio FORGE
independente (mesh via Tailscale, cada um com seu token). Mas isso não
significa que todo PC precisa de ícone, atalho ou app de bandeja
aparecendo: o jeito recomendado de montar a rede é

- **um PC "base"**, com a instalação gráfica completa (app de
  bandeja, atalho na Área de Trabalho, opencode/Claude Code
  instalados) — é o link que a pessoa de fato abre no celular/PWA
  pra ver e gerenciar tudo;
- **os demais PCs como "bots"**, instalados com `-Headless` no Windows
  (ou `FORGE_HEADLESS=1` no Linux/ARM) — nenhum ícone, nenhum app visível, só o
  serviço rodando em segundo plano, controlado inteiramente pela
  malha (pelo app do PC base, pelo Coordenador, ou por qualquer CLI
  conectado via MCP).

Gerenciar projeto, apagar, mover, conversar, navegar/baixar/enviar
arquivo e checar atualização já funcionam em qualquer PC bot sem
precisar abrir o link dele — tudo isso é repassado pela malha usando
o token de cada device (ver `/api/projects/:alias`, `/api/browse`,
`/api/files/send`, `/api/check-updates` em
`packages/opencode/src/cli/cmd/forge/app/server.js`). A única coisa
que ainda exige trocar pro link de um PC bot é abrir uma sessão de
terminal de verdade (▶ opencode/▶ claude/▶ shell) nele — isso depende
de WebSocket preso à origem daquele PC especificamente.

Se um PC já foi instalado "cheio" (com app de bandeja) e você decidir
depois que ele deveria ser só um bot, dá pra remover a parte visual
sem reinstalar nada: mata o processo do app de bandeja, apaga o
atalho da Área de Trabalho e o de Startup, e apaga a pasta
`%LOCALAPPDATA%\SploitForgeTray` daquele PC. O serviço do FORGE
continua rodando normalmente durante e depois disso.

### Como falar com os PCs (MCP no `opencode`)

A barra flutuante do app de bandeja é **só visual**: azul = PC
principal (controlador), verde = bot, bolinha acesa = online. Não muda
nada no comando — **o MCP é o mesmo para os dois**. O agente resolve o
PC pelo nome que aparece na barra (`Escritorio`, `Casa`, `Servidor`,
`raspberrypi`), então você não precisa saber IP, token ou tipo.

Ferramentas usadas pelo agente (todas em `mcp-coordinator.js`):

| Ferramenta | Para que serve |
| --- | --- |
| `list_devices` | descobre PC por nome e diz quem está online |
| `run_command` | roda shell em qualquer PC (`machine:"Servidor"`, por exemplo) |
| `read_file` / `write_file` / `edit_file` / `list_dir` | mexem em arquivos de qualquer PC |
| `list_projects` | lista projetos de todos os PCs |
| `transfer_project` | move um projeto inteiro para outro PC |
| `dispatch` | manda uma instrução para a sessão de um projeto remoto |

Exemplos que você pode digitar no `opencode`:

```text
quais PCs estão online?              -> o agente chama list_devices
manda o projeto Kauanne_Natal para o Servidor
copia C:\Users\Maxx\Desktop\arquivo.x para o PC Casa
analisa porque a impressora parou no Servidor   (o agente roda comandos de leitura lá)
```

Configuração é **uma vez só**. No PC principal, pegue o `FORGE_TOKEN`
de `C:\ProgramData\SploitForge\.env`, declare como variável de
usuário `FORGE_TOKEN` (`setx FORGE_TOKEN <token>`) e configure o MCP:

```jsonc
// %USERPROFILE%\.config\opencode\opencode.jsonc
{
  "mcp": {
    "sploit-forge": {
      "type": "remote",
      "url": "http://127.0.0.1:7777/mcp",
      "oauth": false,
      "headers": { "Authorization": "Bearer {env:FORGE_TOKEN}" }
    }
  }
}
```

Depois disso, basta abrir um `opencode` novo: as ferramentas já vêm
carregadas. Se você já estava numa sessão, reinicie-a para a lista de
tools ser recarregada. Sempre use `127.0.0.1` (o FORGE daquele PC),
nunca o endereço de outro PC — o roteamento cross-PC é feito pelo
argumento `machine`.

PCs atuais: `Escritorio` e `Casa` são principais (azul); `Servidor` e
`raspberrypi` são bots (verde). Todos respondem ao mesmo MCP; a Casa
também aceita `run_command`/`write_file` normalmente.

### Instalar o Sploit

```bash
bun install
bun run --cwd packages/opencode src/index.ts
```

### Instalar o FORGE num servidor novo

**Opção 1 — Windows nativo (recomendado).** Sem WSL, sem Linux, sem VM
nenhuma no meio — o FORGE roda como Serviço do Windows de verdade
(auto-start no boot, reinicia sozinho se cair). Uma linha, numa
PowerShell comum (não precisa já estar como Administrador, o script
pede sozinho):

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
irm https://github.com/Sploit23/sploit/raw/refs/heads/dev/packages/opencode/src/cli/cmd/forge/app/win-native-install.ps1 | iex
```

(a 1ª linha libera rodar o script só nesta sessão do PowerShell -- a
política padrão de vários Windows bloqueia `iex` de script baixado com
`PSSecurityException: UnauthorizedAccess`, mesmo sem salvar nada em
disco; `-Scope Process` não muda nada permanente na máquina, só vale
enquanto essa janela do PowerShell estiver aberta. A 2ª linha força TLS
1.2 -- sem ela, o PowerShell do Windows costuma usar um TLS antigo que
o GitHub recusa, e o download falha silenciosamente)

Instala Node/Tailscale/opencode/claude via `winget`/`npm`, registra o
FORGE como Serviço do Windows (`node-windows`) e também instala o **app
de bandeja** (ícone + janela nativa, `packages/forge-tray/`) com atalho
na Área de Trabalho e autostart no login -- imprime o link de pareamento
no final. Idempotente -- seguro rodar de novo. Detalhes em
`packages/opencode/src/cli/cmd/forge/app/win-native-install.ps1`.

Pra um PC que só vai ser controlado remotamente (sem IA rodando local
nele, sem ícone nenhum visível -- só shell/`/api/exec`), `-Headless` pula
tudo o que o bot não usa: opencode/Claude Code, app de bandeja, UI web
(`index.html` + `vendor/`), `sessions-tmux.js`, `mcp-coordinator.js` e as
dependências npm `web-push`/`@modelcontextprotocol/sdk`/`zod`. O instalador
também grava `FORGE_HEADLESS=1` no `.env`, então o próprio `server.js`
continua enxergando o modo bot depois do restart e o auto-update só baixa
`server.js`, `sessions-native.js` e `win-service.js` (nada de UI/MCP/push).

Num PC que já tinha a instalação completa, rerodar com `-Headless` remove
`index.html`/`vendor/`, `mcp-coordinator.js`, a bandeja e os atalhos; a raiz
passa a servir `/hub` mesmo que algum `index.html` antigo tenha sobrado:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; & ([scriptblock]::Create((irm https://github.com/Sploit23/sploit/raw/refs/heads/dev/packages/opencode/src/cli/cmd/forge/app/win-native-install.ps1))) -Headless
```

Use tudo numa linha só e com `-Headless`: ele sobrevive ao re-lançamento
elevado pelo UAC, enquanto setar `$env:FORGE_HEADLESS` numa linha separada
já causou bot com tray instalado. O script imprime `Modo BOT ativo` no começo
quando o flag foi reconhecido.

Sessões de terminal usam ConPTY nativo (mesma base do terminal do VS
Code) em vez de tmux -- sobrevivem a desconectar/reconectar o celular,
mas são encerradas se o serviço for reiniciado (ex: ao atualizar o
FORGE); como `opencode --continue`/`claude --continue` já persistem a
conversa em disco, só se perde o estado bruto do terminal. A aba "tela"
(ver/controlar a telinha do PC) ainda não existe nesse caminho -- fica
escondida sozinha no app.

**Opção 2 — Windows + WSL/Linux.** Útil se quiser a aba "tela" ou já
tem uma WSL rodando. Windows do zero (instala WSL+Ubuntu sozinho):

```powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
irm https://raw.githubusercontent.com/Sploit23/sploit/dev/packages/opencode/src/cli/cmd/forge/app/win-install.ps1 | iex
```

ou, já com WSL/Linux pronto, uma linha dentro do terminal Ubuntu:

```bash
curl -fsSL https://raw.githubusercontent.com/Sploit23/sploit/dev/packages/opencode/src/cli/cmd/forge/app/bootstrap.sh | sudo bash
```

Mesmo caminho pra **Raspberry Pi** ou qualquer ARM Linux. Pra um PC que
só vai ser controlado remotamente (sem IA local, só shell/`/api/exec`
-- igual o `FORGE_HEADLESS` do lado Windows, útil em ARM onde nem
sempre tem build oficial do opencode/Claude Code): pula os dois CLIs
de propósito:

```bash
curl -fsSL https://raw.githubusercontent.com/Sploit23/sploit/dev/packages/opencode/src/cli/cmd/forge/app/bootstrap.sh | sudo FORGE_HEADLESS=1 bash
```

Se já tiver o Sploit instalado, dá pra usar o comando equivalente:

```bash
sploit forge up
sploit forge status
sploit forge down
```

A WSL desliga sozinha quando fica ociosa (derruba o FORGE junto, e é
exatamente o problema que a Opção 1 elimina). O `win-install.ps1` já
cuida disso sozinho; rodando só o `bootstrap.sh`, configure uma vez à
parte, numa PowerShell comum do Windows:

```powershell
irm https://raw.githubusercontent.com/Sploit23/sploit/dev/packages/opencode/src/cli/cmd/forge/app/keepalive.ps1 | iex
```
