import { access, mkdir, writeFile } from "fs/promises"
import path from "path"
import { nomeSugestaoPara } from "./detectar"

export interface AreaConfigurada {
  tipo: string
  path: string
  nome: string
}

export interface AgenteGerado {
  nome: string
  pasta: string
  papel: string
  criado: string
  memoria: string
}

export interface SquadGerado {
  projeto: string
  diretorio: string
  agentes: AgenteGerado[]
}

const PAPEIS: Record<string, string> = {
  backend: "API e servidor",
  frontend: "telas e visual",
  mobile: "aplicativo mobile",
  infra: "infraestrutura e deploys",
  qa: "testes e qualidade",
  docs: "documentação",
  scripts: "automação e ferramentas",
  db: "banco de dados",
  app: "aplicação geral",
  projeto: "visão geral do projeto",
}

export function papelParaTipo(tipo: string) {
  return PAPEIS[tipo] ?? "área do projeto"
}

export function nomeSugestaoPadrao(tipo: string) {
  return nomeSugestaoPara(tipo)
}

function dataAtual() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function quadroHeader(projeto: string) {
  return (
    `# Quadro do squad - ${projeto}\n` +
    `\n` +
    `> Conversa compartilhada entre os agentes. Formato:\n` +
    `> ` + "`[nome] (feito|pendente|bloqueado) mensagem - [data hora]`\n" +
    `> O coordenador lê este quadro para ordenar o próximo ciclo.\n` +
    `\n` +
    `---\n`
  )
}

export function memoriaTemplate(nome: string, pasta: string) {
  return (
    `# Memoria de ${nome} - agente de ${pasta}\n` +
    `\n` +
    `> Dono da pasta \`${pasta}\`. O que ${nome} sabe sobre o projeto:\n` +
    `- (vazio)\n`
  )
}

export class SquadJaExiste extends Error {
  constructor(public readonly projeto: string) {
    super(`squad já existe em ${projeto}`)
    this.name = "SquadJaExiste"
  }
}

export class NomesDuplicados extends Error {
  constructor(public readonly nomes: string[]) {
    super(`nomes repetidos no squad: ${nomes.join(", ")} — ajuste antes de criar`)
    this.name = "NomesDuplicados"
  }
}

/**
 * Gera a estrutura do squad no projeto (squad.json + quadro.md + memórias),
 * no mesmo formato usado pela CLI `scripts/squad.py` e pelo dock da TUI.
 * Lança `SquadJaExiste` se `squad/squad.json` já existir (não sobrescreve).
 */
export async function gerarSquad(
  projectRoot: string,
  areas: AreaConfigurada[],
  projeto?: string,
): Promise<SquadGerado> {
  const squadDir = path.join(projectRoot, "squad")
  const cfgPath = path.join(squadDir, "squad.json")
  const nomeProjeto = projeto?.trim() || path.basename(projectRoot) || "projeto"

  let jaExiste = false
  try {
    await access(cfgPath)
    jaExiste = true
  } catch {
    /* não existe ainda */
  }
  if (jaExiste) throw new SquadJaExiste(nomeProjeto)

  const nomesFinais = areas.map((a) => a.nome.trim() || nomeSugestaoPara(a.tipo))
  const repetidos = [...new Set(nomesFinais.filter((n, i) => nomesFinais.indexOf(n) !== i))]
  if (repetidos.length > 0) throw new NomesDuplicados(repetidos)

  await mkdir(path.join(squadDir, "memoria"), { recursive: true })
  await mkdir(path.join(squadDir, "logs"), { recursive: true })

  const agentes: AgenteGerado[] = areas.map((a) => ({
    nome: a.nome.trim() || nomeSugestaoPara(a.tipo),
    pasta: a.path,
    papel: papelParaTipo(a.tipo),
    criado: dataAtual(),
    memoria: `squad/memoria/${a.nome.trim() || nomeSugestaoPara(a.tipo)}.md`,
  }))

  const cfg = { projeto: nomeProjeto, agentes }
  await writeFile(cfgPath, JSON.stringify(cfg, null, 2) + "\n", "utf-8")
  await writeFile(
    path.join(squadDir, "quadro.md"),
    quadroHeader(nomeProjeto) + "\n",
    "utf-8",
  )
  for (const a of agentes) {
    await writeFile(
      path.join(squadDir, "memoria", `${a.nome}.md`),
      memoriaTemplate(a.nome, a.pasta),
      "utf-8",
    )
  }
  await writeFile(
    path.join(squadDir, "quadro.md"),
    `**[Coordenador] (feito) time formado: ${agentes
      .map((a) => `${a.nome} (${a.pasta})`)
      .join(", ")} - [${dataAtual()}]**\n`,
    { flag: "a", encoding: "utf-8" },
  )

  return { projeto: nomeProjeto, diretorio: squadDir, agentes }
}
