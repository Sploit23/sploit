// Regenerates cli/cmd/forge/assets.ts from the canonical FORGE source under
// cli/cmd/forge/app/. Run after editing anything in app/:
//   bun run packages/opencode/script/gen-forge-assets.ts
import fs from "fs"
import path from "path"

const root = path.join(import.meta.dirname, "..", "src", "cli", "cmd", "forge")
const appDir = path.join(root, "app")
const read = (p: string) => fs.readFileSync(path.join(appDir, p), "utf8")

const out = `// Embedded FORGE assets, generated from cli/cmd/forge/app/ by
// script/gen-forge-assets.ts -- do not hand-edit. Bundled so \`sploit forge\`
// can write them out without depending on an external CDN at runtime
// (cdnjs.cloudflare.com returning 503s was the whole terminal's root cause
// once before -- never again).
export const FORGE_SERVER_JS = ${JSON.stringify(read("server.js"))}

// so o backend Linux/WSL precisa deste -- sessions-native.js (Windows) nao
// entra aqui porque o CLI do Sploit (sploit forge up) so instala via WSL.
export const FORGE_SESSIONS_TMUX_JS = ${JSON.stringify(read("sessions-tmux.js"))}

export const FORGE_INDEX_HTML = ${JSON.stringify(read("index.html"))}

export const FORGE_XTERM_JS = ${JSON.stringify(read("vendor/xterm.min.js"))}

export const FORGE_XTERM_CSS = ${JSON.stringify(read("vendor/xterm.min.css"))}

export const FORGE_XTERM_FIT_JS = ${JSON.stringify(read("vendor/xterm-addon-fit.min.js"))}

export const FORGE_QRCODE_JS = ${JSON.stringify(read("vendor/qrcode.min.js"))}
`

fs.writeFileSync(path.join(root, "assets.ts"), out)
console.log("wrote assets.ts,", out.length, "bytes")
