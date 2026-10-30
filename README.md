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
irm https://raw.githubusercontent.com/Sploit23/sploit/dev/packages/opencode/src/cli/cmd/forge/app/win-native-install.ps1 | iex
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
nele, sem ícone nenhum visível -- só shell/`/api/exec`), dá pra pular
opencode/Claude Code *e* o app de bandeja (nenhum dos dois é essencial;
uma falha de rede ao instalá-los também não derruba mais o resto do
instalador, mas dá pra pular de propósito):

```powershell
$env:FORGE_HEADLESS = 1
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
irm https://raw.githubusercontent.com/Sploit23/sploit/dev/packages/opencode/src/cli/cmd/forge/app/win-native-install.ps1 | iex
```

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
