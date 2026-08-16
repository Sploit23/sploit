import { SessionV1 } from "@sploit-ai/core/v1/session"
import { FSUtil } from "@sploit-ai/core/fs-util"
import { AppProcess } from "@sploit-ai/core/process"
import { LayerNode } from "@sploit-ai/core/effect/layer-node"
import { Effect, Layer } from "effect"
import { describe, expect } from "bun:test"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs"
import path from "path"
import { tmpdir } from "os"
import { Agent } from "../../src/agent/agent"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Permission } from "../../src/permission"
import { SessionReminders } from "../../src/session/reminders"
import { Session } from "../../src/session/session"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { ProjectV2 } from "@sploit-ai/core/project"
import { ProviderV2 } from "@sploit-ai/core/provider"
import { ModelV2 } from "@sploit-ai/core/model"
import { testEffect } from "../lib/effect"

const sessionID = SessionID.make("ses_test")
const providerID = ProviderV2.ID.make("test")
const modelID = ModelV2.ID.make("test-model")

const build: Agent.Info = {
  name: "build",
  mode: "primary",
  permission: Permission.fromConfig({ "*": "allow" }),
  options: {},
}

const session: Session.Info = {
  id: sessionID,
  slug: "test-session",
  projectID: ProjectV2.ID.make("proj_test"),
  directory: "/tmp",
  title: "Test session",
  version: "1.0.0",
  time: { created: 1, updated: 1 },
}

function userInfo(id: MessageID): SessionV1.User {
  return {
    id,
    sessionID,
    role: "user",
    time: { created: 0 },
    agent: "user",
    model: { providerID, modelID },
    tools: {},
  } as unknown as SessionV1.User
}

function assistantInfo(id: MessageID, parentID: MessageID): SessionV1.Assistant {
  return {
    id,
    sessionID,
    role: "assistant",
    time: { created: 0 },
    parentID,
    modelID,
    providerID,
    mode: "primary",
    agent: "build",
    path: { cwd: "/tmp", root: "/tmp" },
    cost: 0,
    tokens: {
      input: 0,
      output: 0,
      cache: { read: 0, write: 0 },
    },
  } as unknown as SessionV1.Assistant
}

function textPart(id: PartID, messageID: MessageID, text: string): SessionV1.TextPart {
  return {
    id,
    sessionID,
    messageID,
    type: "text",
    text,
  }
}

const user = (parts: SessionV1.Part[], id = MessageID.ascending()): SessionV1.WithParts => ({
  info: userInfo(id),
  parts,
})

const assistant = (
  parts: SessionV1.Part[],
  id = MessageID.ascending(),
  parentID = MessageID.ascending(),
): SessionV1.WithParts => ({
  info: assistantInfo(id, parentID),
  parts,
})

const toolError: SessionV1.ToolPart = {
  id: PartID.ascending(),
  messageID: MessageID.ascending(),
  sessionID,
  type: "tool",
  callID: "call-1",
  tool: "grep",
  state: {
    status: "error",
    input: {},
    error: "ripgrep failed",
    time: { start: 1, end: 2 },
  },
}

const toolCompleted: SessionV1.ToolPart = {
  ...toolError,
  state: {
    status: "completed",
    input: {},
    output: "",
    title: "grep",
    metadata: {},
    time: { start: 1, end: 2 },
  },
}

const layer = Layer.mergeAll(
  RuntimeFlags.layer({ experimentalPlanMode: false }),
  LayerNode.compile(FSUtil.node),
  Layer.mock(Session.Service, {
    updatePart: <T extends SessionV1.Part>(part: T) => Effect.succeed(part),
  }),
  Layer.mock(AppProcess.Service, {
    run: () =>
      Effect.succeed({
        exitCode: mockVerify.exitCode,
        stdout: Buffer.from(mockVerify.stdout),
        stderr: Buffer.from(mockVerify.stderr),
        stdoutTruncated: false,
        stderrTruncated: false,
      } as unknown as never),
  }),
)

const mockVerify: { exitCode: number; stdout: string; stderr: string } = {
  exitCode: 0,
  stdout: "",
  stderr: "",
}

const it = testEffect(layer)

const captured: { messages: SessionV1.Info[]; parts: SessionV1.Part[] } = { messages: [], parts: [] }

const gateLayer = Layer.mergeAll(
  RuntimeFlags.layer({ experimentalPlanMode: false }),
  LayerNode.compile(FSUtil.node),
  Layer.mock(Session.Service, {
    updateMessage: <T extends SessionV1.Info>(msg: T) => {
      captured.messages.push(msg)
      return Effect.succeed(msg)
    },
    updatePart: <T extends SessionV1.Part>(part: T) => {
      captured.parts.push(part)
      return Effect.succeed(part)
    },
  }),
  Layer.mock(AppProcess.Service, {
    run: () =>
      Effect.succeed({
        exitCode: mockVerify.exitCode,
        stdout: Buffer.from(mockVerify.stdout),
        stderr: Buffer.from(mockVerify.stderr),
        stdoutTruncated: false,
        stderrTruncated: false,
      } as unknown as never),
  }),
)

const gateIt = testEffect(gateLayer)

const reminders = (messages: SessionV1.WithParts[]) =>
  messages
    .find((msg) => msg.info.role === "user")!
    .parts.filter((part): part is SessionV1.TextPart & { synthetic: true } => part.type === "text" && part.synthetic === true)

const graphChecks = (messages: SessionV1.WithParts[]) =>
  reminders(messages).filter((part) => part.text.includes("knowledge graph"))

describe("SessionReminders root cause (IteraÃ§Ã£o B â€” gene G-causaraiz)", () => {
  it.effect("injects root cause reminder when a tool failed", () =>
    Effect.gen(function* () {
      const userMessageID = MessageID.ascending()
      const messages = [user([textPart(PartID.ascending(), userMessageID, "retry the grep")]), assistant([toolError])]
      const result = yield* SessionReminders.apply({ messages, agent: build, session })
      const found = reminders(result)
      expect(found).toHaveLength(1)
      expect(found[0].text).toContain("root cause")
      expect(found[0].text).toContain("Before retrying")
    }),
  )

  it.effect("does not inject when no tool failed", () =>
    Effect.gen(function* () {
      const userMessageID = MessageID.ascending()
      const messages = [user([textPart(PartID.ascending(), userMessageID, "continue")]), assistant([toolCompleted])]
      const result = yield* SessionReminders.apply({ messages, agent: build, session })
      expect(reminders(result)).toHaveLength(0)
    }),
  )

  it.effect("does not duplicate the reminder in a single turn", () =>
    Effect.gen(function* () {
      const userMessageID = MessageID.ascending()
      const messages = [user([textPart(PartID.ascending(), userMessageID, "retry the grep")]), assistant([toolError])]
      const once = yield* SessionReminders.apply({ messages, agent: build, session })
      const twice = yield* SessionReminders.apply({ messages: once, agent: build, session })
      expect(reminders(twice)).toHaveLength(1)
    }),
  )

  it.effect("ignores stale tool errors from older turns", () =>
    Effect.gen(function* () {
      const firstUserMessageID = MessageID.ascending()
      const latestUserMessageID = MessageID.ascending()
      const messages = [
        user([textPart(PartID.ascending(), firstUserMessageID, "first attempt")]),
        assistant([toolError]),
        user([textPart(PartID.ascending(), latestUserMessageID, "keep going")]),
        assistant([toolCompleted]),
      ]
      const result = yield* SessionReminders.apply({ messages, agent: build, session })
      expect(reminders(result)).toHaveLength(0)
    }),
  )
})

describe("SessionReminders graph check (mutação do gene G-grafo)", () => {
  const editCentral: SessionV1.ToolPart = {
    id: PartID.ascending(),
    messageID: MessageID.ascending(),
    sessionID,
    type: "tool",
    callID: "call-edit",
    tool: "edit",
    state: {
      status: "completed",
      input: { filePath: path.join("src", "core.ts") },
      output: "",
      title: "edit",
      metadata: {},
      time: { start: 1, end: 2 },
    },
  }

  const editSide: SessionV1.ToolPart = {
    ...editCentral,
    callID: "call-edit-side",
    state: {
      status: "completed",
      input: { filePath: path.join("src", "side.ts") },
      output: "",
      title: "edit",
      metadata: {},
      time: { start: 1, end: 2 },
    },
  }

  function makeGraph(directory: string) {
    const graphDir = path.join(directory, "graphify-out")
    mkdirSync(graphDir, { recursive: true })
    const fillerNodes = Array.from({ length: 20 }, (_, i) => ({
      id: `f${i}`,
      label: `filler${i}.ts`,
      file_type: "code",
      source_file: `src/filler${i}.ts`,
    }))
    const fillerLinks = fillerNodes.flatMap((node) => [
      { source: node.id, target: "core" },
      { source: node.id, target: node.id },
    ])
    writeFileSync(
      path.join(graphDir, "graph.json"),
      JSON.stringify({
        nodes: [
          { id: "core", label: "core.ts", file_type: "code", source_file: "src/core.ts" },
          { id: "side", label: "side.ts", file_type: "code", source_file: "src/side.ts" },
          ...fillerNodes,
        ],
        links: [
          ...fillerLinks,
          { source: "side", target: "side" },
        ],
      }),
      "utf-8",
    )
  }

  it.live("injects graph check when a central file was edited", () =>
    Effect.gen(function* () {
      const dir = mkdtempSync(path.join(tmpdir(), "reminders-graph-"))
      try {
        makeGraph(dir)
        const sessionInfo: Session.Info = { ...session, directory: dir }
        const userMessageID = MessageID.ascending()
        const messages = [user([textPart(PartID.ascending(), userMessageID, "edit the core file")]), assistant([editCentral])]
        const result = yield* SessionReminders.apply({ messages, agent: build, session: sessionInfo })
        const found = graphChecks(result)
        expect(found).toHaveLength(1)
        expect(found[0].text).toContain("knowledge graph")
        expect(found[0].text).toContain("central file")
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }),
  )

  it.live("does not inject when a non-central file was edited", () =>
    Effect.gen(function* () {
      const dir = mkdtempSync(path.join(tmpdir(), "reminders-graph-"))
      try {
        makeGraph(dir)
        const sessionInfo: Session.Info = { ...session, directory: dir }
        const userMessageID = MessageID.ascending()
        const messages = [user([textPart(PartID.ascending(), userMessageID, "edit the side file")]), assistant([editSide])]
        const result = yield* SessionReminders.apply({ messages, agent: build, session: sessionInfo })
        expect(graphChecks(result)).toHaveLength(0)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }),
  )

  it.live("does not inject when the project has no graph", () =>
    Effect.gen(function* () {
      const userMessageID = MessageID.ascending()
      const messages = [user([textPart(PartID.ascending(), userMessageID, "edit the core file")]), assistant([editCentral])]
      const result = yield* SessionReminders.apply({ messages, agent: build, session })
      expect(graphChecks(result)).toHaveLength(0)
    }),
  )

  it.live("does not duplicate the graph check in a single turn", () =>
    Effect.gen(function* () {
      const dir = mkdtempSync(path.join(tmpdir(), "reminders-graph-"))
      try {
        makeGraph(dir)
        const sessionInfo: Session.Info = { ...session, directory: dir }
        const userMessageID = MessageID.ascending()
        const messages = [user([textPart(PartID.ascending(), userMessageID, "edit the core file")]), assistant([editCentral])]
        const once = yield* SessionReminders.apply({ messages, agent: build, session: sessionInfo })
        const twice = yield* SessionReminders.apply({ messages: once, agent: build, session: sessionInfo })
        expect(graphChecks(twice)).toHaveLength(1)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }),
  )
})

describe("SessionReminders verify after code change (Geração 5 — gene G-verificacao)", () => {
  const editCode: SessionV1.ToolPart = {
    id: PartID.ascending(),
    messageID: MessageID.ascending(),
    sessionID,
    type: "tool",
    callID: "call-edit-code",
    tool: "edit",
    state: {
      status: "completed",
      input: { filePath: path.join("src", "util.ts") },
      output: "",
      title: "edit",
      metadata: {},
      time: { start: 1, end: 2 },
    },
  }

  const editDoc: SessionV1.ToolPart = {
    ...editCode,
    callID: "call-edit-doc",
    state: {
      status: "completed",
      input: { filePath: path.join("docs", "readme.md") },
      output: "",
      title: "edit",
      metadata: {},
      time: { start: 1, end: 2 },
    },
  }

  const verifyTool: SessionV1.ToolPart = {
    id: PartID.ascending(),
    messageID: MessageID.ascending(),
    sessionID,
    type: "tool",
    callID: "call-verify",
    tool: "bash",
    state: {
      status: "completed",
      input: { command: "bun typecheck" },
      output: "",
      title: "bun typecheck",
      metadata: {},
      time: { start: 1, end: 2 },
    },
  }

  it.live("injects verify reminder after editing code without verification", () =>
    Effect.gen(function* () {
      const userMessageID = MessageID.ascending()
      const messages = [user([textPart(PartID.ascending(), userMessageID, "update util")]), assistant([editCode])]
      const result = yield* SessionReminders.apply({ messages, agent: build, session })
      const found = reminders(result)
      expect(found).toHaveLength(1)
      expect(found[0].text).toContain("verification")
      expect(found[0].text).toContain("typecheck")
    }),
  )

  it.live("does not inject when no code was edited (docs only)", () =>
    Effect.gen(function* () {
      const userMessageID = MessageID.ascending()
      const messages = [user([textPart(PartID.ascending(), userMessageID, "update readme")]), assistant([editDoc])]
      const result = yield* SessionReminders.apply({ messages, agent: build, session })
      expect(reminders(result)).toHaveLength(0)
    }),
  )

  it.live("does not inject when verification already ran in the same turn", () =>
    Effect.gen(function* () {
      const userMessageID = MessageID.ascending()
      const messages = [user([textPart(PartID.ascending(), userMessageID, "update util and verify")]), assistant([editCode, verifyTool])]
      const result = yield* SessionReminders.apply({ messages, agent: build, session })
      expect(reminders(result)).toHaveLength(0)
    }),
  )

  it.live("does not duplicate the verify reminder in a single turn", () =>
    Effect.gen(function* () {
      const userMessageID = MessageID.ascending()
      const messages = [user([textPart(PartID.ascending(), userMessageID, "update util")]), assistant([editCode])]
      const once = yield* SessionReminders.apply({ messages, agent: build, session })
      const twice = yield* SessionReminders.apply({ messages: once, agent: build, session })
      expect(reminders(twice)).toHaveLength(1)
    }),
  )
})

describe("SessionReminders auto-verify (Geração 6 — o harness roda a verificação de verdade)", () => {
  const editCode: SessionV1.ToolPart = {
    id: PartID.ascending(),
    messageID: MessageID.ascending(),
    sessionID,
    type: "tool",
    callID: "call-edit-code",
    tool: "edit",
    state: {
      status: "completed",
      input: { filePath: path.join("src", "util.ts") },
      output: "",
      title: "edit",
      metadata: {},
      time: { start: 1, end: 2 },
    },
  }

  const editDoc: SessionV1.ToolPart = {
    ...editCode,
    callID: "call-edit-doc",
    state: {
      status: "completed",
      input: { filePath: path.join("docs", "readme.md") },
      output: "",
      title: "edit",
      metadata: {},
      time: { start: 1, end: 2 },
    },
  }

  const verifyTool: SessionV1.ToolPart = {
    id: PartID.ascending(),
    messageID: MessageID.ascending(),
    sessionID,
    type: "tool",
    callID: "call-verify",
    tool: "bash",
    state: {
      status: "completed",
      input: { command: "bun typecheck" },
      output: "",
      title: "bun typecheck",
      metadata: {},
      time: { start: 1, end: 2 },
    },
  }

  function withPackageJson(directory: string) {
    writeFileSync(
      path.join(directory, "package.json"),
      JSON.stringify({ scripts: { typecheck: "tsgo --noEmit" } }),
      "utf-8",
    )
  }

  const autoVerifyParts = (messages: SessionV1.WithParts[]) =>
    reminders(messages).filter((part) => part.text.startsWith("The harness ran a verification"))

  it.live("runs the project's typecheck and injects the real PASS result", () =>
    Effect.gen(function* () {
      const dir = mkdtempSync(path.join(tmpdir(), "reminders-verify-"))
      try {
        withPackageJson(dir)
        mockVerify.exitCode = 0
        mockVerify.stdout = "tsgo: no errors"
        mockVerify.stderr = ""
        const sessionInfo: Session.Info = { ...session, directory: dir }
        const userMessageID = MessageID.ascending()
        const messages = [user([textPart(PartID.ascending(), userMessageID, "update util")]), assistant([editCode])]
        const result = yield* SessionReminders.apply({ messages, agent: build, session: sessionInfo })
        const found = autoVerifyParts(result)
        expect(found).toHaveLength(1)
        expect(found[0].text).toContain("PASS")
        expect(found[0].text).toContain("bun run typecheck")
        expect(found[0].text).toContain("tsgo: no errors")
        expect(found[0].text).not.toContain("The change does not pass verification")
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }),
  )

  it.live("injects FAIL with the real error output when typecheck fails", () =>
    Effect.gen(function* () {
      const dir = mkdtempSync(path.join(tmpdir(), "reminders-verify-"))
      try {
        withPackageJson(dir)
        mockVerify.exitCode = 1
        mockVerify.stdout = ""
        mockVerify.stderr = "src/util.ts:5:3 error TS2322: Type 'string' is not assignable to type 'number'"
        const sessionInfo: Session.Info = { ...session, directory: dir }
        const userMessageID = MessageID.ascending()
        const messages = [user([textPart(PartID.ascending(), userMessageID, "update util")]), assistant([editCode])]
        const result = yield* SessionReminders.apply({ messages, agent: build, session: sessionInfo })
        const found = autoVerifyParts(result)
        expect(found).toHaveLength(1)
        expect(found[0].text).toContain("FAIL")
        expect(found[0].text).toContain("TS2322")
        expect(found[0].text).toContain("fix the root cause before concluding")
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }),
  )

  it.live("falls back to the verify reminder when the project has no package.json", () =>
    Effect.gen(function* () {
      const dir = mkdtempSync(path.join(tmpdir(), "reminders-verify-"))
      try {
        const sessionInfo: Session.Info = { ...session, directory: dir }
        const userMessageID = MessageID.ascending()
        const messages = [user([textPart(PartID.ascending(), userMessageID, "update util")]), assistant([editCode])]
        const result = yield* SessionReminders.apply({ messages, agent: build, session: sessionInfo })
        const found = reminders(result)
        expect(found).toHaveLength(1)
        expect(found[0].text).toContain("verification")
        expect(found[0].text).toContain("typecheck")
        expect(found[0].text).not.toContain("The harness ran a verification")
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }),
  )

  it.live("does not inject anything when docs were edited (no code change)", () =>
    Effect.gen(function* () {
      const dir = mkdtempSync(path.join(tmpdir(), "reminders-verify-"))
      try {
        withPackageJson(dir)
        mockVerify.exitCode = 0
        mockVerify.stdout = "tsgo: no errors"
        mockVerify.stderr = ""
        const sessionInfo: Session.Info = { ...session, directory: dir }
        const userMessageID = MessageID.ascending()
        const messages = [user([textPart(PartID.ascending(), userMessageID, "update readme")]), assistant([editDoc])]
        const result = yield* SessionReminders.apply({ messages, agent: build, session: sessionInfo })
        expect(autoVerifyParts(result)).toHaveLength(0)
        expect(reminders(result)).toHaveLength(0)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }),
  )

  it.live("does not auto-verify when verification already ran in the same turn", () =>
    Effect.gen(function* () {
      const dir = mkdtempSync(path.join(tmpdir(), "reminders-verify-"))
      try {
        withPackageJson(dir)
        mockVerify.exitCode = 1
        mockVerify.stderr = "should never run"
        const sessionInfo: Session.Info = { ...session, directory: dir }
        const userMessageID = MessageID.ascending()
        const messages = [
          user([textPart(PartID.ascending(), userMessageID, "update util and verify")]),
          assistant([editCode, verifyTool]),
        ]
        const result = yield* SessionReminders.apply({ messages, agent: build, session: sessionInfo })
        expect(autoVerifyParts(result)).toHaveLength(0)
        expect(reminders(result)).toHaveLength(0)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }),
  )

  it.live("does not auto-verify mid-work (assistant still calling tools)", () =>
    Effect.gen(function* () {
      const dir = mkdtempSync(path.join(tmpdir(), "reminders-verify-"))
      try {
        withPackageJson(dir)
        mockVerify.exitCode = 1
        mockVerify.stderr = "should never run"
        const sessionInfo: Session.Info = { ...session, directory: dir }
        const userMessageID = MessageID.ascending()
        const messages = [
          user([textPart(PartID.ascending(), userMessageID, "update util")]),
          { info: { ...assistantInfo(MessageID.ascending(), MessageID.ascending()), finish: "tool-calls" }, parts: [editCode] },
        ]
        const result = yield* SessionReminders.apply({ messages, agent: build, session: sessionInfo })
        expect(autoVerifyParts(result)).toHaveLength(0)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }),
  )
})

describe("SessionReminders enforce turn verification (Geração 7 — proof-gate)", () => {
  const editCode: SessionV1.ToolPart = {
    id: PartID.ascending(),
    messageID: MessageID.ascending(),
    sessionID,
    type: "tool",
    callID: "call-edit-code",
    tool: "edit",
    state: {
      status: "completed",
      input: { filePath: path.join("src", "util.ts") },
      output: "",
      title: "edit",
      metadata: {},
      time: { start: 1, end: 2 },
    },
  }

  const editDoc: SessionV1.ToolPart = {
    ...editCode,
    callID: "call-edit-doc",
    state: {
      status: "completed",
      input: { filePath: path.join("docs", "readme.md") },
      output: "",
      title: "edit",
      metadata: {},
      time: { start: 1, end: 2 },
    },
  }

  const verifyTool: SessionV1.ToolPart = {
    id: PartID.ascending(),
    messageID: MessageID.ascending(),
    sessionID,
    type: "tool",
    callID: "call-verify",
    tool: "bash",
    state: {
      status: "completed",
      input: { command: "bun typecheck" },
      output: "",
      title: "bun typecheck",
      metadata: {},
      time: { start: 1, end: 2 },
    },
  }

  function withPackageJson(directory: string) {
    writeFileSync(
      path.join(directory, "package.json"),
      JSON.stringify({ scripts: { typecheck: "tsgo --noEmit" } }),
      "utf-8",
    )
  }

  const gateUser = (text: string, id = MessageID.ascending()): SessionV1.WithParts => ({
    info: userInfo(id),
    parts: [{ id: PartID.ascending(), messageID: id, sessionID, type: "text", text, synthetic: true }],
  })

  const resetCaptured = () => {
    captured.messages = []
    captured.parts = []
  }

  gateIt.live("reopens the turn with the real FAIL output when verification fails", () =>
    Effect.gen(function* () {
      const dir = mkdtempSync(path.join(tmpdir(), "reminders-gate-"))
      try {
        resetCaptured()
        withPackageJson(dir)
        mockVerify.exitCode = 1
        mockVerify.stdout = ""
        mockVerify.stderr = "src/util.ts:5:3 error TS2322: Type 'string' is not assignable to type 'number'"
        const sessionInfo: Session.Info = { ...session, directory: dir }
        const userMessageID = MessageID.ascending()
        const messages = [user([textPart(PartID.ascending(), userMessageID, "update util")]), assistant([editCode])]
        const verdict = yield* SessionReminders.enforceTurnVerification({ messages, session: sessionInfo, sessionID })
        expect(verdict).toBe("continue")
        expect(captured.messages).toHaveLength(1)
        expect(captured.messages[0].role).toBe("user")
        expect(captured.messages[0].id).not.toBe(userMessageID)
        expect((captured.messages[0] as SessionV1.User).agent).toBe("user")
        expect((captured.messages[0] as SessionV1.User).model.providerID).toBe(providerID)
        const text = captured.parts.find((part): part is SessionV1.TextPart => part.type === "text")
        expect(text?.text).toContain("The harness ran a verification")
        expect(text?.text).toContain("FAIL")
        expect(text?.text).toContain("TS2322")
        expect(text?.synthetic).toBe(true)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }),
  )

  gateIt.live("closes the turn with proof when verification passes", () =>
    Effect.gen(function* () {
      const dir = mkdtempSync(path.join(tmpdir(), "reminders-gate-"))
      try {
        resetCaptured()
        withPackageJson(dir)
        mockVerify.exitCode = 0
        mockVerify.stdout = "tsgo: no errors"
        mockVerify.stderr = ""
        const sessionInfo: Session.Info = { ...session, directory: dir }
        const userMessageID = MessageID.ascending()
        const messages = [user([textPart(PartID.ascending(), userMessageID, "update util")]), assistant([editCode])]
        const verdict = yield* SessionReminders.enforceTurnVerification({ messages, session: sessionInfo, sessionID })
        expect(verdict).toBe("break")
        expect(captured.messages).toHaveLength(0)
        expect(captured.parts).toHaveLength(0)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }),
  )

  gateIt.live("closes the turn when the project has no package.json", () =>
    Effect.gen(function* () {
      const dir = mkdtempSync(path.join(tmpdir(), "reminders-gate-"))
      try {
        resetCaptured()
        mockVerify.exitCode = 1
        mockVerify.stderr = "should never run"
        const sessionInfo: Session.Info = { ...session, directory: dir }
        const userMessageID = MessageID.ascending()
        const messages = [user([textPart(PartID.ascending(), userMessageID, "update util")]), assistant([editCode])]
        const verdict = yield* SessionReminders.enforceTurnVerification({ messages, session: sessionInfo, sessionID })
        expect(verdict).toBe("break")
        expect(captured.messages).toHaveLength(0)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }),
  )

  gateIt.live("does not reopen when the turn already verified itself", () =>
    Effect.gen(function* () {
      const dir = mkdtempSync(path.join(tmpdir(), "reminders-gate-"))
      try {
        resetCaptured()
        withPackageJson(dir)
        mockVerify.exitCode = 1
        mockVerify.stderr = "should never run"
        const sessionInfo: Session.Info = { ...session, directory: dir }
        const userMessageID = MessageID.ascending()
        const messages = [
          user([textPart(PartID.ascending(), userMessageID, "update util and verify")]),
          assistant([editCode, verifyTool]),
        ]
        const verdict = yield* SessionReminders.enforceTurnVerification({ messages, session: sessionInfo, sessionID })
        expect(verdict).toBe("break")
        expect(captured.messages).toHaveLength(0)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }),
  )

  gateIt.live("does not reopen when no code was edited (docs only)", () =>
    Effect.gen(function* () {
      const dir = mkdtempSync(path.join(tmpdir(), "reminders-gate-"))
      try {
        resetCaptured()
        withPackageJson(dir)
        mockVerify.exitCode = 1
        mockVerify.stderr = "should never run"
        const sessionInfo: Session.Info = { ...session, directory: dir }
        const userMessageID = MessageID.ascending()
        const messages = [user([textPart(PartID.ascending(), userMessageID, "update readme")]), assistant([editDoc])]
        const verdict = yield* SessionReminders.enforceTurnVerification({ messages, session: sessionInfo, sessionID })
        expect(verdict).toBe("break")
        expect(captured.messages).toHaveLength(0)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }),
  )

  gateIt.live("gives up after the retry budget is exhausted", () =>
    Effect.gen(function* () {
      const dir = mkdtempSync(path.join(tmpdir(), "reminders-gate-"))
      try {
        resetCaptured()
        withPackageJson(dir)
        mockVerify.exitCode = 1
        mockVerify.stderr = "should never run"
        const sessionInfo: Session.Info = { ...session, directory: dir }
        const userMessageID = MessageID.ascending()
        const messages = [
          user([textPart(PartID.ascending(), userMessageID, "update util")]),
          assistant([editCode]),
          gateUser("The harness ran a verification automatically after your last code change (bun run typecheck)."),
          gateUser("The harness ran a verification automatically after your last code change (bun run typecheck)."),
          gateUser("The harness ran a verification automatically after your last code change (bun run typecheck)."),
        ]
        const verdict = yield* SessionReminders.enforceTurnVerification({ messages, session: sessionInfo, sessionID })
        expect(verdict).toBe("break")
        expect(captured.messages).toHaveLength(0)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }),
  )

  gateIt.live("apply skips the verify reminder when the last user message is a harness gate", () =>
    Effect.gen(function* () {
      const userMessageID = MessageID.ascending()
      const messages = [
        gateUser(
          "The harness ran a verification automatically after your last code change (bun run typecheck).\nVerification result: FAIL.",
          userMessageID,
        ),
        assistant([editCode]),
      ]
      const result = yield* SessionReminders.apply({ messages, agent: build, session })
      const verifyPrompts = result
        .find((msg) => msg.info.role === "user")!
        .parts.filter((part) => part.type === "text" && part.text.startsWith("You just changed code"))
      expect(verifyPrompts).toHaveLength(0)
    }),
  )
})

describe("SessionReminders file memory (Geração 8 — o arquivo lembra)", () => {
  const utilPath = path.join("src", "util.ts")

  const editCode: SessionV1.ToolPart = {
    id: PartID.ascending(),
    messageID: MessageID.ascending(),
    sessionID,
    type: "tool",
    callID: "call-edit-code",
    tool: "edit",
    state: {
      status: "completed",
      input: { filePath: utilPath },
      output: "",
      title: "edit",
      metadata: {},
      time: { start: 1, end: 2 },
    },
  }

  const failedEdit: SessionV1.ToolPart = {
    id: PartID.ascending(),
    messageID: MessageID.ascending(),
    sessionID,
    type: "tool",
    callID: "call-failed-edit",
    tool: "edit",
    state: {
      status: "error",
      input: { filePath: utilPath },
      error: "Path not found: src/util.ts",
      time: { start: 1, end: 2 },
    },
  }

  const failedBash: SessionV1.ToolPart = {
    ...failedEdit,
    callID: "call-failed-bash",
    tool: "bash",
    state: {
      status: "error",
      input: { command: "npm run build" },
      error: "command not found",
      time: { start: 1, end: 2 },
    },
  }

  const assistantWithTime = (parts: SessionV1.Part[], created: number): SessionV1.WithParts => ({
    info: { ...assistantInfo(MessageID.ascending(), MessageID.ascending()), time: { created } },
    parts,
  })

  const fileMemoryParts = (result: SessionV1.WithParts[]) =>
    result
      .find((msg) => msg.info.role === "user")!
      .parts.filter(
        (part): part is SessionV1.TextPart =>
          part.type === "text" && part.text.startsWith("This file had a tool error"),
      )

  it.live("injects the known file error before editing the same file again", () =>
    Effect.gen(function* () {
      const dir = mkdtempSync(path.join(tmpdir(), "reminders-filemem-"))
      try {
        const sessionInfo: Session.Info = { ...session, directory: dir }
        const userMessageID = MessageID.ascending()
        const messages = [
          user([textPart(PartID.ascending(), userMessageID, "fix util")]),
          assistantWithTime([failedEdit], 100),
          assistantWithTime([editCode], 200),
        ]
        const result = yield* SessionReminders.apply({ messages, agent: build, session: sessionInfo })
        const found = fileMemoryParts(result)
        expect(found).toHaveLength(1)
        expect(found[0].text).toContain("src/util.ts")
        expect(found[0].text).toContain("Path not found: src/util.ts")
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }),
  )

  it.live("stays silent when the edited file has no known errors", () =>
    Effect.gen(function* () {
      const dir = mkdtempSync(path.join(tmpdir(), "reminders-filemem-"))
      try {
        const sessionInfo: Session.Info = { ...session, directory: dir }
        const userMessageID = MessageID.ascending()
        const messages = [
          user([textPart(PartID.ascending(), userMessageID, "fix util")]),
          assistantWithTime([failedEdit], 100),
          assistantWithTime([{ ...editCode, state: { ...editCode.state, input: { filePath: path.join("src", "other.ts") } } }], 200),
        ]
        const result = yield* SessionReminders.apply({ messages, agent: build, session: sessionInfo })
        expect(fileMemoryParts(result)).toHaveLength(0)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }),
  )

  it.live("does not treat the error of the current turn as file memory (root-cause covers it)", () =>
    Effect.gen(function* () {
      const dir = mkdtempSync(path.join(tmpdir(), "reminders-filemem-"))
      try {
        const sessionInfo: Session.Info = { ...session, directory: dir }
        const userMessageID = MessageID.ascending()
        const messages = [
          user([textPart(PartID.ascending(), userMessageID, "fix util")]),
          assistantWithTime([failedEdit, editCode], 100),
        ]
        const result = yield* SessionReminders.apply({ messages, agent: build, session: sessionInfo })
        expect(fileMemoryParts(result)).toHaveLength(0)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }),
  )

  it.live("does not duplicate the file memory in the same turn", () =>
    Effect.gen(function* () {
      const dir = mkdtempSync(path.join(tmpdir(), "reminders-filemem-"))
      try {
        const sessionInfo: Session.Info = { ...session, directory: dir }
        const userMessageID = MessageID.ascending()
        const messages = [
          user([textPart(PartID.ascending(), userMessageID, "fix util")]),
          assistantWithTime([failedEdit], 100),
          assistantWithTime([editCode], 200),
        ]
        const once = yield* SessionReminders.apply({ messages, agent: build, session: sessionInfo })
        const twice = yield* SessionReminders.apply({ messages: once, agent: build, session: sessionInfo })
        expect(fileMemoryParts(twice)).toHaveLength(1)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }),
  )
})

describe("SessionReminders idempotency (Geração 9 — gene G-idempotencia)", () => {
  const bashTool = (command: string): SessionV1.ToolPart => ({
    id: PartID.ascending(),
    messageID: MessageID.ascending(),
    sessionID,
    type: "tool",
    callID: `call-bash-${command.length}-${Math.random().toString(36).slice(2, 8)}`,
    tool: "bash",
    state: {
      status: "completed",
      input: { command },
      output: "",
      title: command,
      metadata: {},
      time: { start: 1, end: 2 },
    },
  })

  const idempotencyParts = (result: SessionV1.WithParts[]) =>
    result
      .find((msg) => msg.info.role === "user")!
      .parts.filter(
        (part): part is SessionV1.TextPart =>
          part.type === "text" && part.text.startsWith("The harness detected a command that may write persistent state"),
      )

  it.live("injects the idempotency reminder after a stateful command ran once", () =>
    Effect.gen(function* () {
      const dir = mkdtempSync(path.join(tmpdir(), "reminders-idem-"))
      try {
        const sessionInfo: Session.Info = { ...session, directory: dir }
        const userMessageID = MessageID.ascending()
        const messages = [
          user([textPart(PartID.ascending(), userMessageID, "seed the database")]),
          assistant([bashTool("bun run db:seed")]),
        ]
        const result = yield* SessionReminders.apply({ messages, agent: build, session: sessionInfo })
        const found = idempotencyParts(result)
        expect(found).toHaveLength(1)
        expect(found[0].text).toContain("bun run db:seed")
        expect(found[0].text).toContain("idempotent")
        expect(found[0].text).toContain("does NOT duplicate")
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }),
  )

  it.live("stays silent when the stateful command already ran twice", () =>
    Effect.gen(function* () {
      const dir = mkdtempSync(path.join(tmpdir(), "reminders-idem-"))
      try {
        const sessionInfo: Session.Info = { ...session, directory: dir }
        const userMessageID = MessageID.ascending()
        const messages = [
          user([textPart(PartID.ascending(), userMessageID, "seed the database")]),
          assistant([bashTool("bun run db:seed"), bashTool("bun run db:seed")]),
        ]
        const result = yield* SessionReminders.apply({ messages, agent: build, session: sessionInfo })
        expect(idempotencyParts(result)).toHaveLength(0)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }),
  )

  it.live("stays silent for read-only commands", () =>
    Effect.gen(function* () {
      const dir = mkdtempSync(path.join(tmpdir(), "reminders-idem-"))
      try {
        const sessionInfo: Session.Info = { ...session, directory: dir }
        const userMessageID = MessageID.ascending()
        const messages = [
          user([textPart(PartID.ascending(), userMessageID, "check the build")]),
          assistant([bashTool("bun typecheck")]),
        ]
        const result = yield* SessionReminders.apply({ messages, agent: build, session: sessionInfo })
        expect(idempotencyParts(result)).toHaveLength(0)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }),
  )

  it.live("does not duplicate the idempotency reminder in a single turn", () =>
    Effect.gen(function* () {
      const dir = mkdtempSync(path.join(tmpdir(), "reminders-idem-"))
      try {
        const sessionInfo: Session.Info = { ...session, directory: dir }
        const userMessageID = MessageID.ascending()
        const messages = [
          user([textPart(PartID.ascending(), userMessageID, "seed the database")]),
          assistant([bashTool("bun run db:seed")]),
        ]
        const once = yield* SessionReminders.apply({ messages, agent: build, session: sessionInfo })
        const twice = yield* SessionReminders.apply({ messages: once, agent: build, session: sessionInfo })
        expect(idempotencyParts(twice)).toHaveLength(1)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }),
  )

  it.live("injects one reminder per unproven stateful command", () =>
    Effect.gen(function* () {
      const dir = mkdtempSync(path.join(tmpdir(), "reminders-idem-"))
      try {
        const sessionInfo: Session.Info = { ...session, directory: dir }
        const userMessageID = MessageID.ascending()
        const messages = [
          user([textPart(PartID.ascending(), userMessageID, "set up the database")]),
          assistant([bashTool("bun run db:seed"), bashTool("npx prisma migrate dev")]),
        ]
        const result = yield* SessionReminders.apply({ messages, agent: build, session: sessionInfo })
        const found = idempotencyParts(result)
        expect(found).toHaveLength(1)
        expect(found[0].text).toContain("bun run db:seed")
        expect(found[0].text).toContain("npx prisma migrate dev")
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }),
  )
})

describe("SessionReminders persistence (G10 — o corpo deixa rastro)", () => {
  const persisted: SessionV1.Part[] = []
  const persistLayer = Layer.mergeAll(
    RuntimeFlags.layer({ experimentalPlanMode: false }),
    LayerNode.compile(FSUtil.node),
    Layer.mock(Session.Service, {
      updatePart: <T extends SessionV1.Part>(part: T) => {
        persisted.push(part)
        return Effect.succeed(part)
      },
    }),
    Layer.mock(AppProcess.Service, {
      run: () =>
        Effect.succeed({
          exitCode: 0,
          stdout: Buffer.from(""),
          stderr: Buffer.from(""),
          stdoutTruncated: false,
          stderrTruncated: false,
        } as unknown as never),
    }),
  )
  const persistIt = testEffect(persistLayer)

  const editCode: SessionV1.ToolPart = {
    id: PartID.ascending(),
    messageID: MessageID.ascending(),
    sessionID,
    type: "tool",
    callID: "call-edit-g10",
    tool: "edit",
    state: {
      status: "completed",
      input: { filePath: "src/util.ts", oldString: "a", newString: "b" },
      output: "",
      title: "edit",
      metadata: {},
      time: { start: 1, end: 2 },
    },
  }

  persistIt.live("persists the root-cause reminder via updatePart", () =>
    Effect.gen(function* () {
      persisted.length = 0
      const userMessageID = MessageID.ascending()
      const messages = [
        user([textPart(PartID.ascending(), userMessageID, "retry the grep")], userMessageID),
        assistant([toolError]),
      ]
      yield* SessionReminders.apply({ messages, agent: build, session })
      const saved = persisted.find(
        (part): part is SessionV1.TextPart => part.type === "text" && part.text.includes("root cause"),
      )
      expect(saved).toBeDefined()
      expect(saved?.messageID).toBe(userMessageID)
      expect(saved?.synthetic).toBe(true)
    }),
  )

  persistIt.live("persists the verification prompt when code changed without verifying", () =>
    Effect.gen(function* () {
      persisted.length = 0
      const dir = mkdtempSync(path.join(tmpdir(), "reminders-persist-"))
      try {
        const sessionInfo: Session.Info = { ...session, directory: dir }
        const userMessageID = MessageID.ascending()
        const messages = [
          user([textPart(PartID.ascending(), userMessageID, "update code")], userMessageID),
          assistant([editCode]),
        ]
        yield* SessionReminders.apply({ messages, agent: build, session: sessionInfo })
        const saved = persisted.find(
          (part): part is SessionV1.TextPart => part.type === "text" && part.text.includes("You just changed code"),
        )
        expect(saved).toBeDefined()
        expect(saved?.messageID).toBe(userMessageID)
        expect(saved?.synthetic).toBe(true)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }),
  )
})

