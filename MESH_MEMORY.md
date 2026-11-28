# Memória da malha

Fatos e decisões que valem pra **qualquer projeto, qualquer PC, qualquer
engine** da malha Sploit-Forge — não só o projeto onde foram aprendidos.
Diferente do `.sploit-handoff.md` de cada projeto (que é local daquele
projeto), isto aqui é compartilhado: toda sessão, em qualquer PC, lê isto
antes de agir em algo que pareça mais amplo que o pedido atual, e
acrescenta uma linha aqui quando aprende algo reaproveitável — nunca
reescreve o arquivo inteiro, só acrescenta.

Ver a convenção completa em `AGENTS.md`/`CLAUDE.md` (bloco "Memória da
malha (Sploit-Forge)").

## Convenções gerais

- `opencode mcp add`/`claude mcp add --header` exige o formato
  `CHAVE=VALOR` (igual), não `Chave: Valor` (dois pontos) — o erro de
  sintaxe errada pode ecoar o valor do header de volta em texto puro na
  mensagem de erro, então nunca testar essa sintaxe com um segredo real
  sem necessidade.
- Git Bash/MSYS mangla path Windows (`C:\...`) quando vai dentro de um
  argumento de linha de comando (ex: JSON pro `curl -d`) — usar barra
  normal (`C:/...`) ou escrever o JSON num arquivo e mandar com
  `curl -d @arquivo.json`.

## Peculiaridades de hardware/PC conhecidas

- Tailscale SSH (`tailscale set --ssh`) não é suportado no Windows —
  só em Linux/ARM. Confirmado testando direto (erro explícito do
  próprio `tailscale`), não é só falta de permissão/ACL de conta.
- O Serviço do Windows do FORGE roda como `LocalSystem` e não enxerga o
  Git Credential Manager do usuário: `git push` HTTPS pra GitHub trava
  esperando credencial (ou falha com "could not read Username") quando
  disparado pelo agente. Commit local funciona; push tem que ser feito
  no terminal do próprio usuário (ou com token explícito).

## APIs/serviços externos usados em mais de um projeto

- `raw.githubusercontent.com` (GitHub raw) serve versão em cache antiga
  às vezes — sempre anexar um query param anti-cache (`?v=<timestamp>`)
  e `Cache-Control: no-cache` em qualquer fetch que precise do conteúdo
  mais recente de verdade.

## Espelhamento de projetos nos pilotos

- Todo projeto usado em operação deve existir **idêntico nos dois PCs pilotos** (Escritorio e Casa). O git remoto é a fonte da verdade; nenhum piloto é singular.
- Cada piloto registra sua cópia com **alias próprio**: `Natal_Kiosk` no Escritorio e `Natal_Kiosk_Casa` na Casa. Nunca usar o mesmo alias nas duas máquinas — a resolução do Coordenador fica ambígua.
- Antes de qualquer trabalho: `git pull --rebase` na pasta do projeto. Depois: atualizar `.sploit-handoff.md`, `git add`, `git commit` e `git push`.
- Se um piloto estiver fora, o outro assume sem depender dele. Nunca editar as duas cópias ao mesmo tempo sem sincronizar antes.
- `transfer_project` serve apenas para semear a cópia inicial; **não é sincronização contínua**.
- Arquivos com token (`.env`, `.mcp.json`, `opencode.json`) são locais por PC e nunca entram no git. Use `opencode.example.json` como modelo e copie para `opencode.json` em cada piloto, trocando o placeholder pelo token daquela máquina.
- Projetos na malha (PWA): `FORGE_MESH_PROJECTS` de cada piloto deve listar todos os aliases que ele deve ver, incluindo as cópias espelhadas.
- Alias canônico do motor local na malha: `FMM` (path `D:/FMM_MASTER_STABLE_V5.4_SLIM` no Escritorio), incluído no `FORGE_MESH_PROJECTS` dos pilotos e do Servidor.
- Ponte do modelo: usar o Servidor como endpoint OpenAI-compatible fixo (`/api/llm/v1/chat/completions`, modelo `fmm-local`); ele repassa a inferência pra máquina com GPU. O motor acorda só na primeira pergunta e dorme após 10 min parado, pra não atrapalhar o uso normal do PC.
