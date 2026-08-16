import os, { EOL } from "os"
import { Cause, Effect } from "effect"
import { Global } from "@sploit-ai/core/global"
import { Database } from "@sploit-ai/core/database/database"
import {
  InstallationVersion,
  InstallationChannel,
} from "@sploit-ai/core/installation/version"
import { Flag } from "@sploit-ai/core/flag/flag"
import { effectCmd } from "../effect-cmd"
import { UI } from "../ui"
import { Auth } from "@/auth"

const ok = (message: string) =>
  UI.println(UI.Style.TEXT_SUCCESS_BOLD + `✓ ${message}` + UI.Style.TEXT_NORMAL)
const issue = (message: string) =>
  UI.println(UI.Style.TEXT_DANGER_BOLD + `✗ ${message}` + UI.Style.TEXT_NORMAL)
const info = (message: string) => UI.println(`  ${message}`)
const heading = (title: string) =>
  UI.println(EOL + UI.Style.TEXT_NORMAL_BOLD + title + UI.Style.TEXT_NORMAL)

export const DoctorCommand = effectCmd({
  command: "doctor",
  describe: "diagnose the local Sploit setup (environment, config, auth, database)",
  instance: false,
  handler: Effect.fn("Cli.doctor")(function* () {
    const problems: string[] = []

    UI.println(
      UI.Style.TEXT_NORMAL_BOLD +
        `Sploit ${InstallationVersion}` +
        UI.Style.TEXT_NORMAL +
        UI.Style.TEXT_DIM +
        ` (${InstallationChannel})` +
        UI.Style.TEXT_NORMAL,
    )

    heading("Environment")
    const termProgram = process.env.TERM_PROGRAM
      ? `${process.env.TERM_PROGRAM}${process.env.TERM_PROGRAM_VERSION ? ` ${process.env.TERM_PROGRAM_VERSION}` : ""}`
      : undefined
    const terminal = [termProgram, process.env.TERM].filter(Boolean).join(" / ")
    info(`OS: ${os.type()} ${os.release()} (${os.arch()})`)
    info(`Runtime: Bun ${process.versions.bun} on ${process.release.name}`)
    if (terminal) ok(`Terminal: ${terminal}`)
    else info("Terminal: not detected (non-interactive or no TERM_PROGRAM/TERM)")
    info(`Working directory: ${process.cwd()}`)
    if (Flag.OPENCODE_PURE) info("External plugins disabled (OPENCODE_PURE)")
    if (Flag.SPLOIT_CONFIG_DIR) info(`Config dir override: ${Flag.SPLOIT_CONFIG_DIR}`)
    if (Flag.OPENCODE_DB) info(`Database override: ${Flag.OPENCODE_DB}`)

    heading("Paths")
    for (const [key, value] of Object.entries(Global.Path)) {
      if (typeof value === "string") info(`${key}: ${value}`)
    }

    heading("Config")
    const { Config } = yield* Effect.promise(() => import("@/config/config"))
    const configResult = yield* Config.Service.use((cfg) => cfg.getGlobal()).pipe(
      Effect.match({
        onFailure: (cause) => `could not load global config: ${Cause.pretty(cause)}`,
        onSuccess: () => "ok",
      }),
    )
    if (configResult === "ok") ok("Global config parsed successfully")
    else {
      problems.push(configResult)
      issue(configResult)
    }

    heading("Auth")
    const auth = yield* Auth.Service
    const credentials = yield* auth.all().pipe(
      Effect.match({
        onFailure: () => "failed to read auth.json",
        onSuccess: (creds) => creds,
      }),
    )
    const providerIDs = Object.keys(credentials)
    if (typeof credentials === "string") {
      problems.push(credentials)
      issue(credentials)
    } else if (providerIDs.length === 0) {
      problems.push("no provider credentials found; run `sploit auth login`")
      issue("No credentials configured")
      info("Run `sploit auth login` to authenticate a provider")
    } else {
      ok(`${providerIDs.length} provider credential(s) configured`)
      for (const providerID of providerIDs) {
        info(`  ${providerID} (${credentials[providerID].type})`)
      }
    }

    heading("Database")
    const dbStatus = yield* Database.Service.pipe(
      Effect.match({
        onFailure: (cause) => `could not open database: ${Cause.pretty(cause)}`,
        onSuccess: () => "ok",
      }),
    )
    if (dbStatus === "ok") ok(`Connected to ${Database.path()}`)
    else {
      problems.push(dbStatus)
      issue(dbStatus)
    }

    heading("Summary")
    if (problems.length === 0) {
      ok("All checks passed")
    } else {
      issue(`${problems.length} problem(s) found`)
      for (const problem of problems) info(`  - ${problem}`)
      process.exitCode = 1
    }
  }),
})

export * as Doctor from "./doctor"
