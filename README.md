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
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
irm https://raw.githubusercontent.com/Sploit23/sploit/dev/packages/opencode/src/cli/cmd/forge/app/win-native-install.ps1 | iex
```

(a primeira linha força TLS 1.2 -- sem ela, o PowerShell do Windows
costuma usar um TLS antigo que o GitHub recusa, e o download falha
silenciosamente)

Instala Node/Tailscale/opencode/claude via `winget`/`npm`, registra o
FORGE como Serviço do Windows (`node-windows`) e imprime o link de
pareamento. Idempotente -- seguro rodar de novo. Detalhes em
`packages/opencode/src/cli/cmd/forge/app/win-native-install.ps1`.

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
