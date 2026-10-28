import fs from "fs"
import os from "os"
import path from "path"
import {
  FORGE_INDEX_HTML,
  FORGE_QRCODE_JS,
  FORGE_SERVER_JS,
  FORGE_SESSIONS_TMUX_JS,
  FORGE_XTERM_CSS,
  FORGE_XTERM_FIT_JS,
  FORGE_XTERM_JS,
} from "./assets"
import type { ExecTarget } from "./platform"

export const FORGE_DIR = "/opt/forge"
export const FORGE_PORT = 7777

function buildInstallScript(): string {
  return `set -e
FORGE_DIR="${FORGE_DIR}"
mkdir -p "$FORGE_DIR"

echo "==> Instalando dependencias do sistema..."
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
  echo "==> Instalando o opencode (CLI que roda dentro de cada sessao)..."
  curl -fsSL https://opencode.ai/install | bash
fi

if ! command -v claude >/dev/null 2>&1; then
  echo "==> Instalando o Claude Code (segunda opcao de CLI dentro de cada sessao)..."
  npm install -g @anthropic-ai/claude-code
fi

cat > "$FORGE_DIR/server.js" <<'__SPLOIT_FORGE_SERVER_JS__'
${FORGE_SERVER_JS}
__SPLOIT_FORGE_SERVER_JS__

cat > "$FORGE_DIR/sessions-tmux.js" <<'__SPLOIT_FORGE_SESSIONS_TMUX_JS__'
${FORGE_SESSIONS_TMUX_JS}
__SPLOIT_FORGE_SESSIONS_TMUX_JS__

cat > "$FORGE_DIR/index.html" <<'__SPLOIT_FORGE_INDEX_HTML__'
${FORGE_INDEX_HTML}
__SPLOIT_FORGE_INDEX_HTML__

mkdir -p "$FORGE_DIR/vendor"
cat > "$FORGE_DIR/vendor/xterm.min.js" <<'__SPLOIT_FORGE_XTERM_JS__'
${FORGE_XTERM_JS}
__SPLOIT_FORGE_XTERM_JS__

cat > "$FORGE_DIR/vendor/xterm.min.css" <<'__SPLOIT_FORGE_XTERM_CSS__'
${FORGE_XTERM_CSS}
__SPLOIT_FORGE_XTERM_CSS__

cat > "$FORGE_DIR/vendor/xterm-addon-fit.min.js" <<'__SPLOIT_FORGE_XTERM_FIT_JS__'
${FORGE_XTERM_FIT_JS}
__SPLOIT_FORGE_XTERM_FIT_JS__

cat > "$FORGE_DIR/vendor/qrcode.min.js" <<'__SPLOIT_FORGE_QRCODE_JS__'
${FORGE_QRCODE_JS}
__SPLOIT_FORGE_QRCODE_JS__

cd "$FORGE_DIR"
echo "==> Instalando dependencias node (ws, node-pty)..."
npm i ws node-pty web-push --silent

if [ -f "$FORGE_DIR/.env" ] && grep -q '^FORGE_TOKEN=' "$FORGE_DIR/.env"; then
  echo "==> Token existente mantido."
else
  TOKEN=$(openssl rand -hex 16)
  echo "FORGE_TOKEN=$TOKEN" > "$FORGE_DIR/.env"
  chmod 600 "$FORGE_DIR/.env"
  echo "==> Novo token gerado."
fi

NODE_BIN="$(command -v node)"
cat > /etc/systemd/system/forge.service <<EOF
[Unit]
Description=FORGE (sploit remote control)
After=network.target

[Service]
WorkingDirectory=$FORGE_DIR
EnvironmentFile=$FORGE_DIR/.env
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
  # 'enable --now' não reinicia um serviço já ativo -- rodando 'sploit forge up'
  # de novo pra atualizar, o processo antigo continuaria rodando com o
  # server.js velho. Restart explícito sempre pega o código atual.
  systemctl restart forge
  echo "SPLOIT_FORGE_SYSTEMD_OK"
else
  echo "SPLOIT_FORGE_SYSTEMD_MISSING"
fi
`
}

export function writeInstallScript(): string {
  const scriptPath = path.join(os.tmpdir(), `sploit-forge-install-${Date.now()}.sh`)
  fs.writeFileSync(scriptPath, buildInstallScript(), { mode: 0o700 })
  return scriptPath
}

export async function runInstall(target: ExecTarget): Promise<{ ok: boolean; systemd: boolean }> {
  const scriptPath = writeInstallScript()
  try {
    const code = await target.runStreamed(["bash", target.toPath(scriptPath)])
    if (code !== 0) return { ok: false, systemd: false }
    const check = target.runCaptured(["bash", "-c", "systemctl is-active forge 2>/dev/null || true"])
    return { ok: true, systemd: check.stdout.trim() === "active" }
  } finally {
    fs.rm(scriptPath, { force: true }, () => {})
  }
}

export function serviceStatus(target: ExecTarget): { installed: boolean; active: boolean } {
  const installed = target.runCaptured(["test", "-f", `${FORGE_DIR}/server.js`]).code === 0
  const active =
    target.runCaptured(["bash", "-c", "systemctl is-active forge 2>/dev/null || true"]).stdout.trim() === "active"
  return { installed, active }
}

export function stopService(target: ExecTarget): boolean {
  const res = target.runCaptured(["bash", "-c", "systemctl disable --now forge 2>&1 || true"])
  return res.code === 0
}
