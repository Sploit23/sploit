import path from "path"
import { SessionV1 } from "@sploit-ai/core/v1/session"
import { SessionCompaction } from "@sploit-ai/core/session/compaction"
import { AppProcess } from "@sploit-ai/core/process"
import { Duration, Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { Agent } from "@/agent/agent"
import { FSUtil } from "@sploit-ai/core/fs-util"
import { InstanceState } from "@/effect/instance-state"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { MessageID, PartID, SessionID } from "./schema"
import { MessageV2 } from "./message-v2"
import { Session } from "./session"
import PROMPT_PLAN from "./prompt/plan.txt"
import BUILD_SWITCH from "./prompt/build-switch.txt"
import PLAN_MODE from "./prompt/plan-mode.txt"

const ROOT_CAUSE_PROMPT = `A tool call just failed. Before retrying the same tool, investigate the root cause: check the exact error, whether the file/path/state changed since you last saw it, and whether the input you passed was correct. Fix the source, not the symptom — retrying a failing call with the same arguments is rarely useful.`

const GRAPH_CHECK_PROMPT = `You just modified a central file (high degree node in the project's knowledge graph). Changes to central files can break many dependents. Before making further edits, consult the knowledge graph (graphify-out/graph.json or the graph query tool) to see which modules depend on this file and which community it belongs to. Verify the impact of your edit before continuing.`

const VERIFY_PROMPT = `You just changed code. Before declaring the task done or moving on, run the project's verification: typecheck, build, or tests (whichever applies). Do not conclude without proof that your change compiles and passes. If a verification command already ran in this turn, no need to run it again.`

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".rs",
  ".go",
  ".java",
  ".c",
  ".h",
  ".cpp",
  ".hpp",
  ".cs",
  ".rb",
  ".php",
  ".swift",
  ".kt",
  ".sh",
  ".ps1",
  ".zig",
  ".ex",
  ".exs",
  ".dart",
])

const isCodeTarget = (target: string) => CODE_EXTENSIONS.has(path.extname(target.replace(/[?#].*$/, "")).toLowerCase())

const looksLikeVerification = (command: unknown) => {
  if (typeof command !== "string") return false
  return /(typecheck|tsgo|bun test|\btest\b|build|pytest|go test|cargo (check|test)|npm (test|run (test|typecheck|build))|pnpm|yarn (test|typecheck))/i.test(
    command,
  )
}

const extractTargetFiles = (input: unknown): string[] => {
  if (typeof input !== "object" || input === null) return []
  const record = input as Record<string, unknown>
  if (typeof record.filePath === "string") return [record.filePath]
  if (typeof record.patchText === "string") {
    const paths: string[] = []
    for (const match of record.patchText.matchAll(/(?:^|\n)(?:\+\+\+|---) (?:a|b)\/([^\n]+)/g)) {
      paths.push(match[1])
    }
    return paths
  }
  return []
}

const isCentralTarget = (target: string, anchors: readonly string[], directory: string) => {
  const normalized = target.replaceAll("\\", "/").replace(/^\.\//, "")
  const rel = path.isAbsolute(normalized) ? path.relative(directory, normalized).replaceAll("\\", "/") : normalized
  return anchors.includes(rel) || anchors.some((anchor) => rel.endsWith(`/${anchor}`))
}

const AUTO_VERIFY_PROMPT = (label: string, status: "pass" | "fail", output: string) =>
  `The harness ran a verification automatically after your last code change (${label}).
Verification result: ${status === "pass" ? "PASS" : "FAIL"}.
${
  status === "fail"
    ? `The change does not pass verification. The error is above — fix the root cause before concluding.`
    : `The change compiles and passes. You can conclude with proof.`
}
Raw output (truncated):
${output}`

const VERIFY_HARNESS_PREFIX = "The harness ran a verification"

const FILE_MEMORY_PREFIX = "This file had a tool error earlier in this session"
const fileMemoryPrompt = (target: string, error: string) =>
  `${FILE_MEMORY_PREFIX}: ${target}
Error: ${error}
Before editing it, re-read the current state of the file and understand the root cause — avoid repeating the same problem.`

const IDEMPOTENCY_PREFIX = "The harness detected a command that may write persistent state"
const idempotencyPrompt = (command: string) =>
  `${IDEMPOTENCY_PREFIX}: ${command}
Commands that scaffold, generate, migrate or seed state should be idempotent. Run it a second time and confirm the second run does NOT duplicate anything (no duplicate rows, files or records). If the second run duplicates, fix the cause before concluding.`

const MAX_AUTO_VERIFY_OUTPUT = 3000
const MAX_VERIFY_RETRIES = 3

const persistSyntheticPart = Effect.fnUntraced(function* (userMessage: SessionV1.WithParts, text: string) {
  const sessions = yield* Session.Service
  const part = yield* sessions.updatePart({
    id: PartID.ascending(),
    messageID: userMessage.info.id,
    sessionID: userMessage.info.sessionID,
    type: "text",
    synthetic: true,
    text,
  })
  userMessage.parts.push(part)
  return part
})

const detectVerifyCommand = (packageJson: unknown): string | null => {
  if (typeof packageJson !== "object" || packageJson === null) return null
  const record = packageJson as Record<string, unknown>
  if (typeof record.scripts !== "object" || record.scripts === null) return null
  const scripts = record.scripts as Record<string, unknown>
  if (typeof scripts.typecheck === "string") return "bun run typecheck"
  if (typeof scripts.build === "string") return "bun run build"
  return null
}

const editedCodeThisTurn = (assistant: SessionV1.WithParts | undefined) =>
  assistant?.parts.some(
    (part) =>
      part.type === "tool" &&
      part.state.status !== "error" &&
      extractTargetFiles(part.state.input).some(isCodeTarget),
  ) ?? false

const verifiedThisTurn = (assistant: SessionV1.WithParts | undefined) =>
  assistant?.parts.some((part) => {
    if (part.type !== "tool" || part.state.status === "error") return false
    const record = part.state.input as Record<string, unknown> | undefined
    if (record && typeof record.command === "string" && looksLikeVerification(record.command)) return true
    if (record && Array.isArray(record.commands)) {
      return record.commands.some((c: unknown) => typeof c === "string" && looksLikeVerification(c))
    }
    return false
  }) ?? false

const normalizeCommand = (command: string) => command.toLowerCase().replace(/\s+/g, " ").trim()

const looksStatefulCommand = (command: string) =>
  /(^|\s)(npm|pnpm|yarn|bun|dotnet|npx)\s+(create|init|new)\b|migrat\w*|seed\w*|scaffold\w*|generate\w*|createdb\w*|\b(prisma|drizzle(-kit)?|supabase|sequelize|typeorm|knex)\b|INSERT\s+INTO|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE/i.test(
    command,
  )

const extractBashCommands = (assistant: SessionV1.WithParts | undefined): string[] => {
  if (!assistant) return []
  return assistant.parts.flatMap((part) => {
    if (part.type !== "tool" || part.tool !== "bash" || part.state.status !== "completed") return []
    const record = part.state.input as Record<string, unknown> | undefined
    if (!record) return []
    if (typeof record.command === "string") return [record.command]
    if (Array.isArray(record.commands)) return record.commands.filter((c: unknown): c is string => typeof c === "string")
    return []
  })
}

const unprovenStatefulCommands = (assistant: SessionV1.WithParts | undefined): string[] => {
  if (!assistant) return []
  const commands = extractBashCommands(assistant)
  const counts = new Map<string, number>()
  for (const command of commands) {
    const normalized = normalizeCommand(command)
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
  }
  const seen = new Set<string>()
  const result: string[] = []
  for (const command of commands) {
    if (!looksStatefulCommand(command)) continue
    const normalized = normalizeCommand(command)
    if (seen.has(normalized)) continue
    seen.add(normalized)
    if ((counts.get(normalized) ?? 0) < 2) result.push(command)
  }
  return result
}

const runVerifyCommand = Effect.fn("AutoVerify.runCommand")(function* (directory: string) {
  const fsys = yield* FSUtil.Service
  const packageJson = yield* fsys.readFileStringSafe(path.join(directory, "package.json")).pipe(
    Effect.orElseSucceed(() => undefined),
  )
  if (packageJson === undefined) return undefined
  let command: string | null = null
  try {
    command = detectVerifyCommand(JSON.parse(packageJson))
  } catch {
    return undefined
  }
  if (!command) return undefined
  const args = command.split(" ")
  const appProcess = yield* AppProcess.Service
  const result = yield* appProcess
    .run(ChildProcess.make(args[0]!, args.slice(1), { cwd: directory, extendEnv: true, stdin: "ignore" }), {
      timeout: Duration.seconds(120),
      maxOutputBytes: MAX_AUTO_VERIFY_OUTPUT,
    })
    .pipe(Effect.orElseSucceed(() => undefined))
  if (!result) return undefined
  const stdout = result.stdout.toString("utf8")
  const stderr = result.stderr.toString("utf8")
  return {
    command,
    output: `${stdout}\n${stderr}`.trim().slice(0, MAX_AUTO_VERIFY_OUTPUT),
    passed: result.exitCode === 0,
  }
})

const runAutoVerify = Effect.fn("AutoVerify.run")(function* (directory: string, userMessage: SessionV1.WithParts) {
  if (userMessage.parts.some((part) => part.type === "text" && part.text.startsWith(VERIFY_HARNESS_PREFIX))) {
    return false
  }
  const outcome = yield* runVerifyCommand(directory)
  if (!outcome) return false
  yield* persistSyntheticPart(userMessage, AUTO_VERIFY_PROMPT(outcome.command, outcome.passed ? "pass" : "fail", outcome.output))
  return true
})

const isVerifyGateMessage = (msg: SessionV1.WithParts) =>
  msg.info.role === "user" &&
  msg.parts.some((part) => part.type === "text" && part.text.startsWith(VERIFY_HARNESS_PREFIX))

const findFileErrors = (messages: SessionV1.WithParts[], beforeTime: number | undefined) => {
  const errors = new Map<string, string>()
  for (const msg of messages) {
    if (msg.info.role !== "assistant") continue
    if (beforeTime !== undefined && msg.info.time.created >= beforeTime) continue
    for (const part of msg.parts) {
      if (part.type !== "tool" || part.state.status !== "error") continue
      const targets = extractTargetFiles(part.state.input)
      for (const target of targets) {
        if (!errors.has(target)) errors.set(target, part.state.error)
      }
    }
  }
  return errors
}

export const enforceTurnVerification = Effect.fn("SessionReminders.enforceTurnVerification")(function* (input: {
  messages: SessionV1.WithParts[]
  session: Session.Info
  sessionID: SessionID
}) {
  const lastAssistant = input.messages.findLast((msg) => msg.info.role === "assistant")
  if (!lastAssistant) return "break"
  if (!editedCodeThisTurn(lastAssistant)) return "break"
  if (verifiedThisTurn(lastAssistant)) return "break"

  // Each user prompt gets a fresh retry budget: count harness-gate messages
  // that arrived after the last real (non-gate) user message.
  const lastRealUser = input.messages.findLast((msg) => msg.info.role === "user" && !isVerifyGateMessage(msg))
  const gateCount = input.messages.filter(
    (msg) => isVerifyGateMessage(msg) && (!lastRealUser || msg.info.id > lastRealUser.info.id),
  ).length
  if (gateCount >= MAX_VERIFY_RETRIES) {
    yield* Effect.logWarning("proof-gate: verification retries exhausted; closing the turn", {
      "session.id": input.sessionID,
      messageID: lastAssistant.info.id,
      attempts: gateCount,
    })
    return "break"
  }

  const outcome = yield* runVerifyCommand(input.session.directory)
  if (!outcome) return "break"
  if (outcome.passed) {
    yield* Effect.logInfo("proof-gate: verification passed; closing the turn", {
      "session.id": input.sessionID,
      messageID: lastAssistant.info.id,
      command: outcome.command,
    })
    return "break"
  }

  const lastUser = input.messages.findLast((msg) => msg.info.role === "user")
  if (!lastUser) return "break"
  const lastUserInfo = lastUser.info.role === "user" ? lastUser.info : undefined
  if (!lastUserInfo) return "break"
  const sessions = yield* Session.Service
  const gateMsg = yield* sessions.updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID: input.sessionID,
    time: { created: Date.now() },
    agent: lastUserInfo.agent,
    model: lastUserInfo.model,
  })
  yield* sessions.updatePart({
    id: PartID.ascending(),
    messageID: gateMsg.id,
    sessionID: input.sessionID,
    type: "text",
    synthetic: true,
    text: AUTO_VERIFY_PROMPT(outcome.command, "fail", outcome.output),
  })
  yield* Effect.logWarning("proof-gate: verification failed; reopening the turn for the model to fix", {
    "session.id": input.sessionID,
    messageID: lastAssistant.info.id,
    command: outcome.command,
    gate: gateMsg.id,
  })
  return "continue"
})

export const apply = Effect.fn("SessionReminders.apply")(function* (input: {
  messages: SessionV1.WithParts[]
  agent: Agent.Info
  session: Session.Info
}) {
  const flags = yield* RuntimeFlags.Service
  const fsys = yield* FSUtil.Service
  const sessions = yield* Session.Service
  const userMessage = input.messages.findLast((msg) => msg.info.role === "user")
  if (!userMessage) return input.messages

  const lastAssistant = input.messages.findLast((msg) => msg.info.role === "assistant")
  const failedTool = lastAssistant?.parts.findLast((part) => part.type === "tool" && part.state.status === "error")
  if (failedTool && !userMessage.parts.some((part) => part.type === "text" && part.text === ROOT_CAUSE_PROMPT)) {
    yield* persistSyntheticPart(userMessage, ROOT_CAUSE_PROMPT)
  }

  const anchors = yield* SessionCompaction.loadAnchorFiles(input.session.directory)
  if (anchors.length > 0) {
    const editedCentral = lastAssistant?.parts.some(
      (part) =>
        part.type === "tool" &&
        part.state.status !== "error" &&
        extractTargetFiles(part.state.input).some((target) => isCentralTarget(target, anchors, input.session.directory)),
    )
    if (editedCentral && !userMessage.parts.some((part) => part.type === "text" && part.text === GRAPH_CHECK_PROMPT)) {
      yield* persistSyntheticPart(userMessage, GRAPH_CHECK_PROMPT)
    }
  }

  const editedCode = editedCodeThisTurn(lastAssistant)
  const didVerify = verifiedThisTurn(lastAssistant)

  const editedTargets = lastAssistant?.parts.flatMap((part) =>
    part.type === "tool" && part.state.status !== "error" ? extractTargetFiles(part.state.input) : [],
  ) ?? []
  const fileErrors = findFileErrors(input.messages, lastAssistant?.info.time.created)
  const pendingFileErrors = editedTargets
    .map((target) => ({ target, error: fileErrors.get(target) }))
    .filter((entry): entry is { target: string; error: string } => entry.error !== undefined)
  if (
    pendingFileErrors.length > 0 &&
    !userMessage.parts.some((part) => part.type === "text" && part.text.startsWith(FILE_MEMORY_PREFIX))
  ) {
    yield* persistSyntheticPart(
      userMessage,
      pendingFileErrors.map((entry) => fileMemoryPrompt(entry.target, entry.error)).join("\n\n---\n\n"),
    )
  }

  const unprovenStateful = unprovenStatefulCommands(lastAssistant)
  if (
    unprovenStateful.length > 0 &&
    !userMessage.parts.some((part) => part.type === "text" && part.text.startsWith(IDEMPOTENCY_PREFIX))
  ) {
    yield* persistSyntheticPart(
      userMessage,
      unprovenStateful.map(idempotencyPrompt).join("\n\n---\n\n"),
    )
  }

  if (editedCode && !didVerify) {
      const finishedTurn =
      lastAssistant && (lastAssistant.info as SessionV1.Assistant).finish !== "tool-calls"
    if (!finishedTurn) {
      // The assistant is mid-work (it will keep calling tools); wait for the
      // final turn before verifying to avoid checking half-finished changes.
    } else if (yield* runAutoVerify(input.session.directory, userMessage)) {
      // The harness ran the verification itself and injected the real result
      // (PASS/FAIL with output) — the model now has proof to build on.
    } else if (
      !userMessage.parts.some(
        (part) => part.type === "text" && (part.text === VERIFY_PROMPT || part.text.startsWith(VERIFY_HARNESS_PREFIX)),
      )
    ) {
      yield* persistSyntheticPart(userMessage, VERIFY_PROMPT)
    }
  }

  if (!flags.experimentalPlanMode) {
    if (input.agent.name === "plan") {
      userMessage.parts.push({
        id: PartID.ascending(),
        messageID: userMessage.info.id,
        sessionID: userMessage.info.sessionID,
        type: "text",
        text: PROMPT_PLAN,
        synthetic: true,
      })
    }
    const wasPlan = input.messages.some((msg) => msg.info.role === "assistant" && msg.info.agent === "plan")
    if (wasPlan && input.agent.name === "build") {
      userMessage.parts.push({
        id: PartID.ascending(),
        messageID: userMessage.info.id,
        sessionID: userMessage.info.sessionID,
        type: "text",
        text: BUILD_SWITCH,
        synthetic: true,
      })
    }
    return input.messages
  }

  const assistantMessage = input.messages.findLast((msg) => msg.info.role === "assistant")
  if (input.agent.name !== "plan" && assistantMessage?.info.agent === "plan") {
    const ctx = yield* InstanceState.context
    const plan = Session.plan(input.session, ctx)
    const exists = yield* fsys.existsSafe(plan)
    const part = yield* sessions.updatePart({
      id: PartID.ascending(),
      messageID: userMessage.info.id,
      sessionID: userMessage.info.sessionID,
      type: "text",
      text: exists
        ? `${BUILD_SWITCH}\n\nA plan file exists at ${plan}. You should execute on the plan defined within it`
        : BUILD_SWITCH,
      synthetic: true,
    })
    userMessage.parts.push(part)
    return input.messages
  }

  if (input.agent.name !== "plan" || assistantMessage?.info.agent === "plan") return input.messages

  const ctx = yield* InstanceState.context
  const plan = Session.plan(input.session, ctx)
  const exists = yield* fsys.existsSafe(plan)
  if (!exists) yield* fsys.ensureDir(path.dirname(plan)).pipe(Effect.catch(Effect.die))
  const part = yield* sessions.updatePart({
    id: PartID.ascending(),
    messageID: userMessage.info.id,
    sessionID: userMessage.info.sessionID,
    type: "text",
    text: PLAN_MODE.replace("${planInfo}", () =>
      exists
        ? `A plan file already exists at ${plan}. You can read it and make incremental edits using the edit tool.`
        : `No plan file exists yet. You should create your plan at ${plan} using the write tool.`,
    ),
    synthetic: true,
  })
  userMessage.parts.push(part)
  return input.messages
})

export * as SessionReminders from "./reminders"
