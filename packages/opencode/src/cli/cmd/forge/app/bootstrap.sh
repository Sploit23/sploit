#!/usr/bin/env bash
# FORGE — instalador de uma linha, pra um PC novo virar servidor sem precisar
# do CLI do Sploit instalado. Idempotente: seguro rodar de novo no mesmo PC.
#
#   curl -fsSL https://raw.githubusercontent.com/Sploit23/sploit/dev/packages/opencode/src/cli/cmd/forge/app/bootstrap.sh | sudo bash
#
# Roda como root de propósito (mesmo usuário que o serviço systemd vai usar) —
# senão o opencode/claude acabam instalados no $HOME de um usuário e o
# serviço (que roda como root) nunca acha os binários nem a pasta certa.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode como root (é o mesmo usuário que o serviço vai usar depois):"
  echo ""
  echo "  curl -fsSL <esta-url> | sudo bash"
  exit 1
fi

FORGE_DIR="/opt/forge"
ENV_FILE="$FORGE_DIR/.env"
PORT=7777
BASE_URL="https://raw.githubusercontent.com/Sploit23/sploit/dev/packages/opencode/src/cli/cmd/forge/app"
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)"

echo "==> Pasta do FORGE: $FORGE_DIR"
mkdir -p "$FORGE_DIR"

echo "==> Instalando dependências do sistema (apt)..."
apt-get update -y
apt-get install -y tmux git xvfb xdotool imagemagick build-essential python3 curl ca-certificates openssl

if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 20 ]; then
  echo "==> Instalando Node.js 20.x..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

if ! command -v tailscale >/dev/null 2>&1; then
  echo "==> Instalando Tailscale..."
  curl -fsSL https://tailscale.com/install.sh | sh
fi

if [ ! -x "$HOME/.opencode/bin/opencode" ]; then
  echo "==> Instalando o opencode (CLI que roda dentro de cada sessão)..."
  curl -fsSL https://opencode.ai/install | bash
fi
export PATH="$HOME/.opencode/bin:$PATH"

if ! command -v claude >/dev/null 2>&1; then
  echo "==> Instalando o Claude Code (segunda opção de CLI dentro de cada sessão)..."
  npm install -g @anthropic-ai/claude-code
fi

# Busca os arquivos de uma cópia local (se este script foi baixado junto com
# os outros, ex. clone do repo) ou do GitHub direto (caso do curl|bash puro).
fetch_asset() {
  local name="$1" dest="$2"
  if [ -n "$SELF_DIR" ] && [ -f "$SELF_DIR/$name" ]; then
    cp -f "$SELF_DIR/$name" "$dest"
  else
    curl -fsSL "$BASE_URL/$name" -o "$dest"
  fi
}
echo "==> Baixando server.js, sessions-tmux.js, index.html, mcp-coordinator.js e vendor/..."
fetch_asset server.js "$FORGE_DIR/server.js"
fetch_asset sessions-tmux.js "$FORGE_DIR/sessions-tmux.js"
fetch_asset index.html "$FORGE_DIR/index.html"
fetch_asset mcp-coordinator.js "$FORGE_DIR/mcp-coordinator.js"
mkdir -p "$FORGE_DIR/vendor"
for f in xterm.min.js xterm.min.css xterm-addon-fit.min.js qrcode.min.js; do
  fetch_asset "vendor/$f" "$FORGE_DIR/vendor/$f"
done

cd "$FORGE_DIR"
echo "==> Instalando dependências node (ws, node-pty, web-push)..."
npm i ws node-pty web-push @modelcontextprotocol/sdk zod --silent

if [ -f "$ENV_FILE" ] && grep -q '^FORGE_TOKEN=' "$ENV_FILE"; then
  echo "==> Token existente mantido (evita invalidar o app já pareado no celular)."
else
  TOKEN=$(openssl rand -hex 16)
  echo "FORGE_TOKEN=$TOKEN" > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "==> Novo token gerado."
fi

NODE_BIN="$(command -v node)"
cat > /etc/systemd/system/forge.service <<EOF
[Unit]
Description=FORGE (sploit remote control)
After=network.target

[Service]
WorkingDirectory=$FORGE_DIR
EnvironmentFile=$ENV_FILE
Environment=PATH=$HOME/.opencode/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=$NODE_BIN $FORGE_DIR/server.js
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

if command -v systemctl >/dev/null 2>&1 && systemctl list-units >/dev/null 2>&1; then
  systemctl daemon-reload
  systemctl enable forge
  # 'enable --now' NÃO reinicia um serviço que já está ativo (só garante que
  # está ligado) -- rodando este script de novo pra atualizar o FORGE, o
  # server.js novo ia pro disco mas o processo node antigo continuava rodando
  # sem saber, ignorando o endpoint/fix que acabou de ser instalado. Restart
  # explícito sempre pega o código atual, ativo ou não.
  systemctl restart forge
  echo "==> FORGE rodando como serviço. Logs: journalctl -u forge -f"
else
  echo "==> systemd não disponível ainda (comum logo após instalar uma WSL nova)."
  echo "    Adicione ao /etc/wsl.conf:"
  echo "      [boot]"
  echo "      systemd=true"
  echo "    Depois, no Windows: wsl --shutdown, abra o Ubuntu de novo e rode este script outra vez."
  exit 0
fi

echo ""
echo "==> Tailscale..."
if ! tailscale status --json 2>/dev/null | grep -q '"BackendState":[[:space:]]*"Running"'; then
  echo ""
  echo "Escaneie o QR com o app do Tailscale no celular (mesma conta dos outros FORGE):"
  echo ""
  tailscale up --qr --accept-routes=false
fi

echo "==> Habilitando Tailscale Serve na porta $PORT..."
SERVE_OUT="$(tailscale serve --bg "$PORT" 2>&1)" && SERVE_OK=1 || SERVE_OK=0
if [ "$SERVE_OK" -ne 1 ]; then
  echo "$SERVE_OUT"
  echo ""
  echo "O recurso Serve ainda não está habilitado nesta conta Tailscale (só precisa uma vez)."
  echo "Abra o link acima no navegador pra habilitar, depois rode este script de novo."
  exit 0
fi

DNSNAME="$(tailscale status --json | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);process.stdout.write((j.Self&&j.Self.DNSName||'').replace(/\.\$/,''))}catch{}})")"
TOKEN="$(grep '^FORGE_TOKEN=' "$ENV_FILE" | cut -d= -f2)"

echo ""
echo "==================================================================="
echo " FORGE instalado e rodando em: $FORGE_DIR"
if [ -n "$DNSNAME" ]; then
  echo ""
  echo " Abra no celular (mesma conta Tailscale):"
  echo ""
  echo "   https://$DNSNAME/#t=$TOKEN"
else
  echo " Rode 'tailscale status' pra pegar o endereço e monte o link:"
  echo "   https://SEU-DNSNAME/#t=$TOKEN"
fi
echo ""
echo " A WSL desliga sozinha depois de ficar ociosa, o que derruba o FORGE"
echo " junto. Numa PowerShell comum do Windows (fora da WSL, não precisa ser"
echo " admin), rode uma vez pra manter ligada:"
echo ""
echo "   irm $BASE_URL/keepalive.ps1 | iex"
echo "==================================================================="
