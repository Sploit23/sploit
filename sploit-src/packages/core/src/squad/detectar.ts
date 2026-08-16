import * as fs from "fs"
import * as path from "path"

export interface AreaDetectada {
  tipo: string
  path: string
  nomeSugestao: string
}

export const PERSONAS: Record<string, string> = {
  backend: "Bruno",
  frontend: "Ana",
  mobile: "Camila",
  infra: "Igor",
  qa: "Carla",
  docs: "Dani",
  scripts: "Serafim",
  db: "Mauricio",
}

export const AREA_PATTERNS: [string, string[]][] = [
  ["backend", ["backend", "api", "server", "services"]],
  ["frontend", ["frontend", "web", "app", "client", "ui"]],
  ["mobile", ["mobile", "android", "ios"]],
  ["infra", ["infra", "devops", ".github/workflows", "docker"]],
  ["qa", ["test", "spec", "__tests__"]],
  ["docs", ["docs", "documentation", "mkdocs"]],
  ["scripts", ["scripts", "tools", "bin"]],
  ["db", ["database", "db", "migrations"]],
]

export function nomeSugestaoPara(tipo: string) {
  return PERSONAS[tipo] || tipo.charAt(0).toUpperCase() + tipo.slice(1)
}

export function detectarAreasProjeto(projectRoot: string): AreaDetectada[] {
  const areas: AreaDetectada[] = []
  // 1. Busca por pastas típicas
  for (const [tipo, dirs] of AREA_PATTERNS) {
    for (const d of dirs) {
      const dirPath = path.join(projectRoot, d)
      if (fs.existsSync(dirPath) && fs.lstatSync(dirPath).isDirectory()) {
        areas.push({
          tipo,
          path: d,
          nomeSugestao: nomeSugestaoPara(tipo),
        })
      }
    }
  }
  // 2. Monorepo detection (apps/packages/services)
  for (const parent of ["apps", "packages", "services"]) {
    const parentPath = path.join(projectRoot, parent)
    if (fs.existsSync(parentPath) && fs.lstatSync(parentPath).isDirectory()) {
      for (const sub of fs.readdirSync(parentPath)) {
        const subPath = path.join(parentPath, sub)
        if (fs.lstatSync(subPath).isDirectory()) {
          const tipo = inferirTipoPelaDep(subPath)
          areas.push({
            tipo,
            path: `${parent}/${sub}`,
            nomeSugestao: nomeSugestaoPara(tipo),
          })
        }
      }
    }
  }
  // 3. Fallback se nada detectado
  if (areas.length === 0) {
    areas.push({
      tipo: "projeto",
      path: ".",
      nomeSugestao: "Dev",
    })
  }
  return desambiguarSugestoes(areas)
}

/**
 * Duas áreas de tipos diferentes (ex.: "api" na raiz e "packages/api-gateway"
 * num monorepo) podem ambas sugerir o mesmo nome de persona (ex.: "Bruno").
 * Sem desambiguar, o squad.py e o supervisor da TUI colidem: `procs`/`tent`
 * são dicionários chaveados por nome, então o segundo agente com nome
 * repetido nunca roda — fica escondido atrás do primeiro. Aqui garantimos
 * sugestões únicas antes de chegar no wizard ou na CLI.
 */
export function desambiguarSugestoes(areas: AreaDetectada[]): AreaDetectada[] {
  const vistos = new Map<string, number>()
  return areas.map((a) => {
    const usos = (vistos.get(a.nomeSugestao) ?? 0) + 1
    vistos.set(a.nomeSugestao, usos)
    if (usos === 1) return a
    return { ...a, nomeSugestao: `${a.nomeSugestao} ${usos}` }
  })
}

function inferirTipoPelaDep(projPath: string): string {
  try {
    const pkgJsonPath = path.join(projPath, "package.json")
    if (fs.existsSync(pkgJsonPath)) {
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath).toString())
      const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies }
      if (deps["next"] || deps["react"]) return "frontend"
      if (deps["nestjs"] || deps["express"]) return "backend"
      if (deps["playwright"] || deps["jest"]) return "qa"
    }
    // Adicionar lógica para outros ecosistemas/languages
  } catch {
    /* fallback */
  }
  return "app"
}
