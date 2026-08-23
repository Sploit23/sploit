// squad-guard.js — bloqueia mecanicamente o coordenador (e qualquer subagente
// dele) de ler/editar direto a pasta de um agente do squad. So existe pra
// forcar delegacao de verdade em vez de depender do coordenador lembrar do
// SKILL.md. Agentes do squad rodam como processo headless proprio
// (sploit run --dir <pasta> --continue), entao esta instancia de plugin so
// existe DENTRO de uma sessao (coordenador OU agente) - detectamos qual e
// comparando instance.directory (fixo por processo) contra as pastas
// cadastradas em squad.json.
//
// squad.json pode estar em <projeto>/squad/squad.json (convencao padrao do
// squad.py quando --dir aponta pra raiz do projeto) OU direto em
// <projeto>/squad.json (quando a sessao interativa roda de dentro da propria
// pasta "squad/" - caso real encontrado em 23/08). Os dois sao aceitos; os
// "pasta" dos agentes sempre resolvem relativos a `directory` (onde a sessao
// atual roda), nunca relativos a onde o squad.json foi encontrado.
//
// Lacunas conhecidas, nao escondidas: comandos via bash (ex.: "cat
// squad/frontend/Botao.tsx") e apply_patch (o path do arquivo fica dentro do
// texto do patch, nao em um campo simples) nao sao cobertos nesta versao.
import { existsSync, readFileSync } from "fs"
import path from "path"

const GUARDED_TOOLS = new Set(["read", "edit", "write", "grep", "glob"])

function findSquadJson(directory, worktree) {
  for (const base of [directory, worktree]) {
    if (!base) continue
    const nested = path.join(base, "squad", "squad.json")
    if (existsSync(nested)) return nested
    const flat = path.join(base, "squad.json")
    if (existsSync(flat)) return flat
  }
  return undefined
}

export const SquadGuardPlugin = async ({ directory, worktree }) => {
  const squadJsonPath = findSquadJson(directory, worktree)
  if (!squadJsonPath) return {}

  let agentes
  try {
    const cfg = JSON.parse(readFileSync(squadJsonPath, "utf-8"))
    agentes = (cfg.agentes ?? [])
      .filter((a) => a && a.nome && a.pasta)
      .map((a) => ({ nome: a.nome, pasta: path.resolve(directory, a.pasta) }))
      .filter((a) => a.pasta !== path.resolve(directory))
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
        `[squad] "${path.relative(directory, target)}" pertence ao agente ${agente.nome}. ` +
          `Nao leia/edite essa pasta direto - use a ferramenta task (persona de ${agente.nome}) ou ` +
          `"squad post --nome ${agente.nome}" pra perguntar/delegar, e repasse ao usuario so a resposta ` +
          `dele + status (trabalhando/salvando/postando no quadro). Nao repita esta chamada direta.`,
      )
    },
  }
}

export default SquadGuardPlugin
