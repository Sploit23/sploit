import { describe, expect, test } from "bun:test"
import {
  detectarPostsInvalidos,
  ehAuditor,
  estadoAgente,
  feedRecente,
  parseQuadro,
  trabalhando,
  ultimoPostCoordenador,
  veredictoAuditor,
} from "../../src/squad/dock-data"

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

  describe("detectarPostsInvalidos", () => {
    test("flags a post with an invented state (real bug: 'delegado' instead of pendente)", () => {
      const texto = [
        "**[Coordenador] (feito) time formado - [17/08/2026 11:12]**",
        "**[Coordenador] (delegado) Webber, integre a API - [17/08/2026 11:25]**",
      ].join("\n")
      expect(detectarPostsInvalidos(texto)).toEqual([
        { linha: 2, texto: "**[Coordenador] (delegado) Webber, integre a API - [17/08/2026 11:25]**" },
      ])
    })

    test("flags the opening line of a post whose message was pasted across multiple lines", () => {
      const texto = [
        "**[Coordenador] (pendente) Webber, veja o exemplo:",
        "```js",
        "console.log(1)",
        "```",
        "— [17/08/2026 11:25]**",
      ].join("\n")
      const achados = detectarPostsInvalidos(texto)
      expect(achados.length).toBe(1)
      expect(achados[0]?.linha).toBe(1)
    })

    test("ignores well-formed posts and unrelated prose", () => {
      const texto = [
        "# Quadro do squad",
        "> instruções de formato aqui",
        "**[Carla] (pendente) revisando os testes de login - [14/08/2026 10:00]**",
      ].join("\n")
      expect(detectarPostsInvalidos(texto)).toEqual([])
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

  describe("ehAuditor", () => {
    test("matches role descriptions that mention auditing/QA/review", () => {
      expect(ehAuditor("especialista em auditoria de qualidade")).toBe(true)
      expect(ehAuditor("QA")).toBe(true)
      expect(ehAuditor("revisor de testes")).toBe(true)
    })

    test("does not match unrelated roles", () => {
      expect(ehAuditor("backend")).toBe(false)
      expect(ehAuditor(undefined)).toBe(false)
    })
  })

  describe("feedRecente", () => {
    test("returns the last N posts, most recent first", () => {
      const posts = parseQuadro(
        [
          "**[Carla] (feito) um - [14/08/2026 10:00]**",
          "**[Carla] (feito) dois - [14/08/2026 10:01]**",
          "**[Carla] (feito) tres - [14/08/2026 10:02]**",
        ].join("\n"),
      )
      expect(feedRecente(posts, 2).map((p) => p.msg)).toEqual(["tres", "dois"])
    })

    test("returns all posts reversed when there are fewer than N", () => {
      const posts = parseQuadro("**[Carla] (feito) unico - [14/08/2026 10:00]**")
      expect(feedRecente(posts, 6).map((p) => p.msg)).toEqual(["unico"])
    })

    test("returns an empty array for empty input", () => {
      expect(feedRecente([], 6)).toEqual([])
    })
  })

  describe("ultimoPostCoordenador", () => {
    test("returns the last Coordenador post among mixed posts", () => {
      const posts = parseQuadro(
        [
          "**[Coordenador] (feito) time formado - [17/08/2026 11:12]**",
          "**[Carla] (feito) PR revisado - [17/08/2026 11:20]**",
          "**[Coordenador] (pendente) Webber: integre a API - [17/08/2026 11:25]**",
        ].join("\n"),
      )
      expect(ultimoPostCoordenador(posts)?.msg).toBe("Webber: integre a API")
    })

    test("returns undefined when the coordinator never posted", () => {
      const posts = parseQuadro("**[Carla] (feito) PR revisado - [17/08/2026 11:20]**")
      expect(ultimoPostCoordenador(posts)).toBeUndefined()
    })
  })

  describe("veredictoAuditor", () => {
    const agentes = [
      { nome: "Bruno", pasta: "backend" },
      { nome: "Auditor", pasta: "backend", papel: "especialista em auditoria de qualidade" },
    ]

    test("returns the auditor's latest non-pending post, ignoring regular agents", () => {
      const posts = parseQuadro(
        [
          "**[Bruno] (feito) implementei o endpoint - [17/08/2026 22:54]**",
          "**[Auditor] (bloqueado) rota desconhecida devolve 200 em vez de 404 - [17/08/2026 22:56]**",
        ].join("\n"),
      )
      expect(veredictoAuditor(posts, agentes)?.estado).toBe("bloqueado")
    })

    test("returns undefined when no agent has an auditor role", () => {
      const posts = parseQuadro("**[Bruno] (feito) implementei o endpoint - [17/08/2026 22:54]**")
      expect(veredictoAuditor(posts, [{ nome: "Bruno", pasta: "backend" }])).toBeUndefined()
    })

    test("returns the newer verdict after a re-audit (bloqueado -> feito)", () => {
      const posts = parseQuadro(
        [
          "**[Auditor] (bloqueado) 3 problemas encontrados - [17/08/2026 22:56]**",
          "**[Bruno] (feito) corrigido - [17/08/2026 22:58]**",
          "**[Auditor] (feito) 0 achados, aprovado - [17/08/2026 23:00]**",
        ].join("\n"),
      )
      const v = veredictoAuditor(posts, agentes)
      expect(v?.estado).toBe("feito")
      expect(v?.msg).toBe("0 achados, aprovado")
    })
  })
})
