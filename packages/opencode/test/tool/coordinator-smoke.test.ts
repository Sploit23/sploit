import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { ToolRegistry } from "@/tool/registry"
import { Tool } from "@/tool/tool"
import { Agent } from "@/agent/agent"
import { InstanceState } from "@/effect/instance-state"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { MessageID, SessionID } from "@/session/schema"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Config } from "@/config/config"
import { TestConfig } from "../fixture/config"
import { testEffect } from "../lib/effect"
import { tmpdir } from "../fixture/fixture"
import path from "path"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import type { TaskPromptOps } from "@/tool/task"

const configLayer = TestConfig.layer({
  directories: () => InstanceState.directory.pipe(Effect.map((dir) => [path.join(dir, ".opencode")])),
})

const root = LayerNode.group([ToolRegistry.node, Agent.node])
const it = testEffect(
  LayerNode.compile(root, [
    [Config.node, configLayer],
    [RuntimeFlags.node, RuntimeFlags.layer()],
  ]),
)

function fakeOps(reply: SessionV1.WithParts): TaskPromptOps {
  return {
    cancel: () => Effect.void,
    resolvePromptParts: (template: string) => Effect.succeed([{ type: "text", text: template }]),
    prompt: () => Effect.succeed(reply),
  }
}

function ctx(agent: string, extra?: Record<string, unknown>): Tool.Context {
  return {
    sessionID: SessionID.make("ses_coord_test"),
    messageID: MessageID.make("msg_coord_test"),
    agent,
    abort: new AbortController().signal,
    messages: [],
    extra,
    metadata: () => Effect.void,
    ask: () => Effect.void,
  } satisfies Tool.Context
}

describe("coordinator tools (smoke)", () => {
  it.instance("denies non-coordinator agents", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const list = (yield* registry.all()).find((t) => t.id === "coordinator_list_projects")
      if (!list) throw new Error("coordinator_list_projects not registered")
      const exit = yield* Effect.exit(list.execute({}, ctx("build")))
      expect(exit._tag).toBe("Failure")
    }),
  )

  it.instance("registers, lists, and dispatches to another project's directory", () =>
    Effect.gen(function* () {
      const target = yield* Effect.promise(() => tmpdir())
      const registry = yield* ToolRegistry.Service
      const all = yield* registry.all()
      const register = all.find((t) => t.id === "coordinator_register_project")
      const list = all.find((t) => t.id === "coordinator_list_projects")
      const dispatch = all.find((t) => t.id === "coordinator_dispatch")
      if (!register || !list || !dispatch) throw new Error("coordinator tools not registered")

      const registered = yield* register.execute(
        { alias: "smoke-target", directory: target.path },
        ctx("coordinator"),
      )
      expect(registered.output).toContain("smoke-target")

      const listed = yield* list.execute({}, ctx("coordinator"))
      expect(listed.output).toContain("smoke-target")

      const fakeReply = {
        info: { role: "assistant" },
        parts: [{ type: "text", text: "oi do projeto alvo!" }],
      } as unknown as SessionV1.WithParts

      const dispatched = yield* dispatch.execute(
        { project: "smoke-target", instruction: "diga oi" },
        ctx("coordinator", { promptOps: fakeOps(fakeReply) }),
      )
      expect(dispatched.output).toBe("oi do projeto alvo!")

      yield* Effect.promise(() => target[Symbol.asyncDispose]())
    }),
  )

  it.instance("fails with a helpful message for an unknown project alias", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const dispatch = (yield* registry.all()).find((t) => t.id === "coordinator_dispatch")
      if (!dispatch) throw new Error("coordinator_dispatch not registered")
      const exit = yield* Effect.exit(
        dispatch.execute(
          { project: "does-not-exist", instruction: "oi" },
          ctx("coordinator", { promptOps: fakeOps({} as SessionV1.WithParts) }),
        ),
      )
      expect(exit._tag).toBe("Failure")
    }),
  )
})
