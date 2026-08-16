import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import os from "os"
import { desambiguarSugestoes, detectarAreasProjeto, type AreaDetectada } from "@sploit-ai/core/squad/detectar"
import { gerarSquad, NomesDuplicados, SquadJaExiste } from "@sploit-ai/core/squad/gerar"

async function tmpProjeto() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "squad-test-"))
  await fs.mkdir(path.join(dir, "backend"), { recursive: true })
  await fs.mkdir(path.join(dir, "frontend"), { recursive: true })
  await fs.mkdir(path.join(dir, "test"), { recursive: true })
  return dir
}

describe("squad: detectarAreasProjeto", () => {
  test("detecta backend, frontend e qa em pastas conhecidas", async () => {
    const dir = await tmpProjeto()
    try {
      const areas = detectarAreasProjeto(dir)
      expect(areas.map((a) => a.path).sort()).toEqual(["backend", "frontend", "test"])
      expect(areas.find((a) => a.path === "backend")?.tipo).toBe("backend")
      expect(areas.find((a) => a.path === "frontend")?.tipo).toBe("frontend")
      expect(areas.find((a) => a.path === "test")?.tipo).toBe("qa")
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  test("usa fallback quando o projeto nao e reconhecido", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "squad-test-"))
    try {
      const areas = detectarAreasProjeto(dir)
      expect(areas.length).toBe(1)
      expect(areas[0].path).toBe(".")
      expect(areas[0].tipo).toBe("projeto")
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  test("desambigua sugestao quando raiz e monorepo apontam pro mesmo tipo (regressao)", async () => {
    // "api/" na raiz e "packages/api-gateway/" caem os dois em "backend" ->
    // sem desambiguar, os dois sugeririam "Bruno" e colidiriam no squad.py
    // (procs/tent sao dicionarios chaveados por nome).
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "squad-test-"))
    try {
      await fs.mkdir(path.join(dir, "api"), { recursive: true })
      await fs.mkdir(path.join(dir, "packages", "api-gateway"), { recursive: true })
      await fs.writeFile(
        path.join(dir, "packages", "api-gateway", "package.json"),
        JSON.stringify({ dependencies: { express: "^4" } }),
      )
      const areas = detectarAreasProjeto(dir)
      const nomes = areas.map((a) => a.nomeSugestao)
      expect(new Set(nomes).size).toBe(nomes.length)
      expect(nomes).toContain("Bruno")
      expect(nomes).toContain("Bruno 2")
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})

describe("squad: desambiguarSugestoes", () => {
  function area(tipo: string, p: string, nomeSugestao: string): AreaDetectada {
    return { tipo, path: p, nomeSugestao }
  }

  test("mantem nomes ja unicos intactos", () => {
    const areas = [area("backend", "backend", "Bruno"), area("frontend", "frontend", "Ana")]
    expect(desambiguarSugestoes(areas).map((a) => a.nomeSugestao)).toEqual(["Bruno", "Ana"])
  })

  test("numera a partir da segunda ocorrencia de um nome repetido", () => {
    const areas = [
      area("backend", "api", "Bruno"),
      area("backend", "packages/api-2", "Bruno"),
      area("backend", "packages/api-3", "Bruno"),
    ]
    expect(desambiguarSugestoes(areas).map((a) => a.nomeSugestao)).toEqual(["Bruno", "Bruno 2", "Bruno 3"])
  })

  test("nao mexe no path/tipo, so no nomeSugestao", () => {
    const areas = [area("backend", "api", "Bruno"), area("backend", "packages/api-2", "Bruno")]
    const out = desambiguarSugestoes(areas)
    expect(out[1].path).toBe("packages/api-2")
    expect(out[1].tipo).toBe("backend")
  })
})

describe("squad: gerarSquad", () => {
  test("gera squad.json, quadro.md e memorias no formato do squad.py", async () => {
    const dir = await tmpProjeto()
    try {
      const areas = detectarAreasProjeto(dir)
        .filter((a) => a.path !== ".")
        .map((a) => ({ tipo: a.tipo, path: a.path, nome: a.nomeSugestao }))
      const gerado = await gerarSquad(dir, areas, "meu-projeto")

      expect(gerado.agentes.length).toBe(3)
      const brunos = gerado.agentes.filter((a) => a.nome === "Bruno")
      expect(brunos[0].papel).toBe("API e servidor")
      expect(brunos[0].pasta).toBe("backend")
      expect(brunos[0].memoria).toBe("squad/memoria/Bruno.md")

      const squadDir = path.join(dir, "squad")
      const json = JSON.parse(await fs.readFile(path.join(squadDir, "squad.json"), "utf-8"))
      expect(json.projeto).toBe("meu-projeto")
      expect(json.agentes.map((a: { nome: string }) => a.nome).sort()).toEqual([
        "Ana",
        "Bruno",
        "Carla",
      ])

      const quadro = await fs.readFile(path.join(squadDir, "quadro.md"), "utf-8")
      expect(quadro).toContain("**[Coordenador] (feito) time formado:")
      expect(quadro).toMatch(/feito\) time formado:.*Bruno/)

      for (const nome of ["Bruno", "Ana", "Carla"]) {
        const mem = await fs.readFile(path.join(squadDir, "memoria", `${nome}.md`), "utf-8")
        expect(mem).toContain(`# Memoria de ${nome}`)
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  test("recusa sobrescrever squad existente", async () => {
    const dir = await tmpProjeto()
    try {
      const areas = detectarAreasProjeto(dir)
        .filter((a) => a.path !== ".")
        .map((a) => ({ tipo: a.tipo, path: a.path, nome: a.nomeSugestao }))
      await gerarSquad(dir, areas, "meu-projeto")
      await expect(gerarSquad(dir, areas, "meu-projeto")).rejects.toBeInstanceOf(SquadJaExiste)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  test("recusa nomes duplicados mesmo sem SquadJaExiste (renomeio manual colidente)", async () => {
    const dir = await tmpProjeto()
    try {
      await expect(
        gerarSquad(
          dir,
          [
            { tipo: "backend", path: "backend", nome: "Bruno" },
            { tipo: "frontend", path: "frontend", nome: "Bruno" },
          ],
          "meu-projeto",
        ),
      ).rejects.toBeInstanceOf(NomesDuplicados)
      // nao deve ter deixado squad.json pela metade
      await expect(fs.access(path.join(dir, "squad", "squad.json"))).rejects.toThrow()
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  test("homenageia nome customizado no arquivo de memoria", async () => {
    const dir = await tmpProjeto()
    try {
      await gerarSquad(dir, [{ tipo: "backend", path: "backend", nome: "Zé da Silva" }], "meu-projeto")
      const json = JSON.parse(
        await fs.readFile(path.join(dir, "squad", "squad.json"), "utf-8"),
      )
      expect(json.agentes[0].nome).toBe("Zé da Silva")
      expect(json.agentes[0].memoria).toContain("Zé da Silva")
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})
