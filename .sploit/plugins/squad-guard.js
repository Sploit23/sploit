// squad-guard.js — bloqueia mecanicamente o coordenador (e qualquer subagente
// dele) de ler/editar direto a pasta de um agente do squad. So existe pra
// forcar delegacao de verdade em vez de depender do coordenador lembrar do
// SKILL.md. Agentes do squad rodam como processo headless proprio
// (sploit run --dir <pasta> --continue), entao esta instancia de plugin so
// existe DENTRO de uma sessao (coordenador OU agente) - detectamos qual e
// comparando instance.directory (fixo por processo) contra as pastas
// cadastradas em squad.json.
//
// Lacunas conhecidas, nao escondidas: comandos via bash (ex.: "cat
// squad/frontend/Botao.tsx") e apply_patch (o path do arquivo fica dentro do
// texto do patch, nao em um campo simples) nao sao cobertos nesta versao.
import { existsSync, readFileSync } from "fs"
import path from "path"

const GUARDED_TOOLS = new Set(["read", "edit", "write", "grep", "glob"])

export const SquadGuardPlugin = async ({ directory, worktree }) => {
  const squadRoot = [directory, worktree].find((d) => d && existsSync(path.join(d, "squad", "squad.json")))
  if (!squadRoot) return {}

  let agentes
  try {
    const cfg = JSON.parse(readFileSync(path.join(squadRoot, "squad", "squad.json"), "utf-8"))
    agentes = (cfg.agentes ?? [])
      .filter((a) => a && a.nome && a.pasta)
      .map((a) => ({ nome: a.nome, pasta: path.resolve(squadRoot, a.pasta) }))
      .filter((a) => a.pasta !== path.resolve(squadRoot))
  } catch {
    return {}
  }
  if (agentes.length === 0) return {}

  // Esta propria sessao E a de um dos agentes auditando a propria pasta -
  // nenhuma restricao se aplica a ela.
  const selfDir = path.resolve(directory)
  if (agentes.some((a) => a.pasta === selfDir)) return {}

  // Normaliza separador antes de comparar - args de tool vindos do modelo as
  // vezes usam "/" mesmo no Windows, mas path.resolve() sempre devolve "\".
  function norm(p) {
    return p.split(/[\\/]+/).join("/")
  }

  function pastaDoAlvo(absPath) {
    const alvo = norm(absPath)
    return agentes.find((a) => alvo === norm(a.pasta) || alvo.startsWith(norm(a.pasta) + "/"))
  }

  function resolveArgPath(tool, args) {
    if (tool === "read" || tool === "edit" || tool === "write") {
      const p = args.filePath
      if (!p) return undefined
      return path.isAbsolute(p) ? p : path.resolve(directory, p)
    }
    if (tool === "grep" || tool === "glob") {
      const p = args.path ?? directory
      return path.isAbsolute(p) ? p : path.resolve(directory, p)
    }
    return undefined
  }

  return {
    "tool.execute.before": async (input, output) => {
      if (!GUARDED_TOOLS.has(input.tool)) return
      const target = resolveArgPath(input.tool, output.args)
      if (!target) return
      const agente = pastaDoAlvo(target)
      if (!agente) return

      throw new Error(
        `[squad] "${path.relative(squadRoot, target)}" pertence ao agente ${agente.nome}. ` +
          `Nao leia/edite essa pasta direto - use a ferramenta task (persona de ${agente.nome}) ou ` +
          `"squad post --nome ${agente.nome}" pra perguntar/delegar, e repasse ao usuario so a resposta ` +
          `dele + status (trabalhando/salvando/postando no quadro). Nao repita esta chamada direta.`,
      )
    },
  }
}

export default SquadGuardPlugin
