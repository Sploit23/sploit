import { FORGE_DIR } from "./install"
import type { ExecTarget } from "./platform"

export function readToken(target: ExecTarget): string | undefined {
  const res = target.runCaptured(["bash", "-c", `grep '^FORGE_TOKEN=' ${FORGE_DIR}/.env 2>/dev/null | cut -d= -f2`])
  const token = res.stdout.trim()
  return token.length > 0 ? token : undefined
}
