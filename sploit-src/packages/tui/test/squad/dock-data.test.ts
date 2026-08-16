import { describe, expect, test } from "bun:test"
import { estadoAgente, parseQuadro, trabalhando } from "../../src/squad/dock-data"

describe("squad dock-data", () => {
  describe("parseQuadro", () => {
    test("parses well-formed posts and ignores unrelated lines", () => {
      const texto = `algumas notas soltas
**[Carla] (pendente) revisando os testes de login - [14/08/2026 10:00]**
não é um post
**[Serafim] (bloqueado) faltou variavel de ambiente - [14/08/2026 10:05]**
`
      expect(parseQuadro(texto)).toEqual([
        { nome: "Carla", estado: "pendente", msg: "revisando os testes de login", data: "14/08/2026 10:00" },
        { nome: "Serafim", estado: "bloqueado", msg: "faltou variavel de ambiente", data: "14/08/2026 10:05" },
      ])
    })

    test("returns an empty list when nothing matches the post format", () => {
      expect(parseQuadro("nada aqui\nsó texto solto\n[Carla] sem os asteriscos")).toEqual([])
    })

    test("rejects a double-hyphen separator (must be a single - or —)", () => {
      // Regressão: "--" não bate com [-—], que casa um único caractere separador.
      expect(parseQuadro("**[Carla] (feito) tarefa -- [14/08/2026 10:00]**")).toEqual([])
    })
  })

  describe("estadoAgente", () => {
    test("defaults to aguardando when the agent never posted", () => {
      expect(estadoAgente([], "Carla")).toEqual({ estado: "pendente", acao: "aguardando" })
    })

    test("uses the agent's own last post when there is no delegated pending task", () => {
      const posts = parseQuadro("**[Carla] (feito) testes passando - [14/08/2026 10:10]**")
      expect(estadoAgente(posts, "Carla")).toEqual({ estado: "feito", acao: "testes passando" })
    })

    test("detects a pending task delegated by another agent (Nome: mensagem)", () => {
      const posts = parseQuadro("**[Coordenador] (pendente) Carla: revisa o PR 42 - [14/08/2026 09:00]**")
      expect(estadoAgente(posts, "Carla")).toEqual({ estado: "pendente", acao: "Carla: revisa o PR 42" })
    })

    test("a delegated task stops counting once the agent posts again", () => {
      const posts = parseQuadro(
        [
          "**[Coordenador] (pendente) Carla: revisa o PR 42 - [14/08/2026 09:00]**",
          "**[Carla] (feito) PR 42 revisado - [14/08/2026 09:30]**",
        ].join("\n"),
      )
      expect(estadoAgente(posts, "Carla")).toEqual({ estado: "feito", acao: "PR 42 revisado" })
    })
  })

  describe("trabalhando", () => {
    test("is true only when estado is pendente and acao isn't aguardando", () => {
      expect(trabalhando({ estado: "pendente", acao: "revisando PR" })).toBe(true)
      expect(trabalhando({ estado: "pendente", acao: "aguardando" })).toBe(false)
      expect(trabalhando({ estado: "feito", acao: "revisando PR" })).toBe(false)
      expect(trabalhando({ estado: "bloqueado", acao: "revisando PR" })).toBe(false)
    })
  })
})
