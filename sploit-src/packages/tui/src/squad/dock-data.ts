export type SquadPost = {
  nome: string
  estado: "feito" | "pendente" | "bloqueado"
  msg: string
  data: string
}

export type SquadAgent = {
  nome: string
  pasta: string
  papel?: string
}

export type SquadCfg = {
  projeto?: string
  modo?: string
  agentes?: SquadAgent[]
}

export type Atividade = {
  rotulo: "rodando" | "editando" | "postando" | "delegando" | "pensando" | "aguardando"
  texto: string
}

const QUADRO_RE = /^\*\*\[(.+)\] \((feito|pendente|bloqueado)\) (.*?)\s+[-—]\s+\[(.+)\]\*\*$/
const ANSI_RE = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function parseQuadro(text: string) {
  const posts: SquadPost[] = []
  for (const line of text.split(/\r?\n/)) {
    const m = QUADRO_RE.exec(line)
    if (m) posts.push({ nome: m[1], estado: m[2] as SquadPost["estado"], msg: m[3], data: m[4] })
  }
  return posts
}

function tarefaPendente(posts: SquadPost[], nome: string) {
  const rx = new RegExp(`${escapeRegExp(nome)}\\s*:`)
  for (let i = posts.length - 1; i >= 0; i--) {
    const p = posts[i]
    if (p.estado !== "pendente") continue
    if (p.nome !== nome && !rx.test(p.msg)) continue
    if (posts.slice(i + 1).some((q) => q.nome === nome)) continue
    return { post: p, index: i }
  }
  return undefined
}

export function estadoAgente(posts: SquadPost[], nome: string): { estado: SquadPost["estado"]; acao: string } {
  const iUp = posts.findLastIndex((p) => p.nome === nome)
  const tp = tarefaPendente(posts, nome)
  if (tp && tp.index >= iUp) return { estado: "pendente", acao: tp.post.msg }
  if (iUp >= 0) return { estado: posts[iUp].estado, acao: posts[iUp].msg }
  return { estado: "pendente", acao: "aguardando" }
}

export function trabalhando(est: { estado: SquadPost["estado"]; acao: string }) {
  return est.estado === "pendente" && est.acao !== "aguardando"
}

function limparAnsi(texto: string) {
  return texto.replace(ANSI_RE, "")
}

function descreverLinha(linha: string): Atividade {
  const m = /^\$\s*(.+)$/.exec(linha)
  if (m) return { rotulo: "rodando", texto: m[1].slice(0, 90) }
  const mEdit = /^(?:Edit|Write|Apply(?:_patch)?)\s+(.+)$/.exec(linha)
  if (mEdit) return { rotulo: "editando", texto: mEdit[1].split(/[\\/]/).pop() ?? mEdit[1] }
  if (/squad\.py\s+.*\bpost\b/.test(linha)) return { rotulo: "postando", texto: "postando no quadro" }
  if (/Explore Agent|General Agent|subagent|task\(/.test(linha)) return { rotulo: "delegando", texto: "delegando subagente" }
  return { rotulo: "pensando", texto: linha.slice(0, 90) }
}

export async function lerAtividade(logPath: string): Promise<Atividade | undefined> {
  const f = Bun.file(logPath)
  if (!(await f.exists())) return undefined
  const size = await f.size
  const text = size > 8192 ? await f.slice(size - 8192).text() : await f.text()
  const linhas = limparAnsi(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^[+\-] /.test(l) && !/^Index: /.test(l) && !/^===/.test(l))
  if (linhas.length === 0) return undefined
  return descreverLinha(linhas[linhas.length - 1])
}

export async function lerLogCompleto(logPath: string, maxBytes = 6000): Promise<string[]> {
  const f = Bun.file(logPath)
  if (!(await f.exists())) return []
  const size = await f.size
  const text = size > maxBytes ? await f.slice(size - maxBytes).text() : await f.text()
  return limparAnsi(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^[+\-] /.test(l) && !/^Index: /.test(l) && !/^===/.test(l))
}
