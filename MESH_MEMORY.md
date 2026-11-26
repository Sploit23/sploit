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

## APIs/serviços externos usados em mais de um projeto

- `raw.githubusercontent.com` (GitHub raw) serve versão em cache antiga
  às vezes — sempre anexar um query param anti-cache (`?v=<timestamp>`)
  e `Cache-Control: no-cache` em qualquer fetch que precise do conteúdo
  mais recente de verdade.
