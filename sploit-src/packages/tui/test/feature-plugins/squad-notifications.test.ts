import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { TuiAttentionNotifyInput } from "@sploit-ai/plugin/tui"
import { tick } from "../../src/feature-plugins/system/squad-notifications"
import { createTuiPluginApi } from "../fixture/tui-plugin"

async function makeSquadDir() {
  const dir = await mkdtemp(path.join(tmpdir(), "sploit-squad-test-"))
  await mkdir(path.join(dir, "squad"), { recursive: true })
  return dir
}

async function writeSquad(dir: string, projeto: string, quadro: string) {
  await writeFile(
    path.join(dir, "squad", "squad.json"),
    JSON.stringify({
      projeto,
      agentes: [
        { nome: "Carla", pasta: "front" },
        { nome: "Serafim", pasta: "scripts" },
      ],
    }),
  )
  await writeFile(path.join(dir, "squad", "quadro.md"), quadro)
}

function harness() {
  const notifications: TuiAttentionNotifyInput[] = []
  const api = createTuiPluginApi({
    attention: {
      async notify(input) {
        notifications.push(input)
        return { ok: true, notification: true, sound: true }
      },
    },
    state: { path: { state: "", config: "", worktree: "", directory: "" } },
  })
  return { api, notifications }
}

describe("squad notifications plugin", () => {
  let dirs: string[] = []

  beforeEach(() => {
    dirs = []
  })

  afterEach(async () => {
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })))
  })

  async function tempDir() {
    const dir = await makeSquadDir()
    dirs.push(dir)
    return dir
  }

  test("does nothing for a project without a squad configured", async () => {
    const dir = await tempDir()
    const { api, notifications } = harness()
    api.state.path.directory = dir

    await tick(api, { anteriores: {}, filaAtiva: false, avisadoTravado: new Set<string>() })

    expect(notifications).toEqual([])
  })

  test("notifies a block, a completion, and the queue clearing in order", async () => {
    const dir = await tempDir()
    const { api, notifications } = harness()
    api.state.path.directory = dir
    const memoria = { anteriores: {}, filaAtiva: false, avisadoTravado: new Set<string>() }

    await writeSquad(
      dir,
      "demo",
      [
        "**[Carla] (pendente) revisando os testes de login - [14/08/2026 10:00]**",
        "**[Serafim] (pendente) empacotando o build - [14/08/2026 10:01]**",
      ].join("\n"),
    )
    await tick(api, memoria)
    expect(notifications).toEqual([])

    await writeSquad(
      dir,
      "demo",
      [
        "**[Carla] (pendente) revisando os testes de login - [14/08/2026 10:00]**",
        "**[Serafim] (pendente) empacotando o build - [14/08/2026 10:01]**",
        "**[Serafim] (bloqueado) faltou variavel de ambiente no CI - [14/08/2026 10:05]**",
      ].join("\n"),
    )
    await tick(api, memoria)
    expect(notifications).toEqual([
      {
        title: "Squad",
        message: "Serafim travou: faltou variavel de ambiente no CI",
        notification: { when: "blurred" },
        sound: { name: "error", when: "always" },
      },
    ])

    await writeSquad(
      dir,
      "demo",
      [
        "**[Carla] (pendente) revisando os testes de login - [14/08/2026 10:00]**",
        "**[Serafim] (pendente) empacotando o build - [14/08/2026 10:01]**",
        "**[Serafim] (bloqueado) faltou variavel de ambiente no CI - [14/08/2026 10:05]**",
        "**[Carla] (feito) testes de login passando - [14/08/2026 10:10]**",
      ].join("\n"),
    )
    await tick(api, memoria)
    expect(notifications.slice(1)).toEqual([
      {
        title: "Squad",
        message: "Carla terminou uma tarefa",
        notification: { when: "blurred" },
        sound: { name: "subagent_done", when: "always" },
      },
      {
        title: "Squad",
        message: "demo: fila zerada, squad em espera",
        notification: { when: "blurred" },
        sound: { name: "done", when: "always" },
      },
    ])
  })

  test("notifies once when an agent's log goes stale while still working", async () => {
    const dir = await tempDir()
    const { api, notifications } = harness()
    api.state.path.directory = dir
    const memoria = { anteriores: {}, filaAtiva: false, avisadoTravado: new Set<string>() }

    await writeSquad(dir, "demo", "**[Carla] (pendente) revisando os testes de login - [14/08/2026 10:00]**")
    const logsDir = path.join(dir, "squad", "logs")
    await mkdir(logsDir, { recursive: true })
    const carlaLog = path.join(logsDir, "Carla.log")
    await writeFile(carlaLog, "\n> build · big-pickle\n\n")
    const antigo = new Date(Date.now() - 5 * 60_000)
    await utimes(carlaLog, antigo, antigo)

    await tick(api, memoria)
    expect(notifications.length).toBe(1)
    expect(notifications[0]?.title).toBe("Squad")
    expect(notifications[0]?.message).toContain("Carla travado")
    expect(notifications[0]?.notification).toEqual({ when: "always" })
    expect(notifications[0]?.sound).toEqual({ name: "error", when: "always" })

    // Segundo tick com o mesmo log parado não deve repetir o aviso.
    await tick(api, memoria)
    expect(notifications.length).toBe(1)
  })

  test("does not fire a false transition when switching to a different project", async () => {
    const dirA = await tempDir()
    const dirB = await tempDir()
    const { api, notifications } = harness()
    const memoria = { anteriores: {}, filaAtiva: false, avisadoTravado: new Set<string>() }

    api.state.path.directory = dirA
    await writeSquad(dirA, "projeto-a", "**[Serafim] (pendente) subindo o deploy - [14/08/2026 10:00]**")
    await tick(api, memoria)
    expect(notifications).toEqual([])

    // projeto-b já nasce com o Serafim bloqueado — sem histórico real disso,
    // não deve soar como "acabou de travar".
    api.state.path.directory = dirB
    await writeSquad(dirB, "projeto-b", "**[Serafim] (bloqueado) erro de permissão - [14/08/2026 09:00]**")
    await tick(api, memoria)

    expect(notifications).toEqual([])
  })
})
