/// <reference path="../markdown.d.ts" />

export * as SkillPlugin from "./skill"

import { define } from "./internal"
import { Effect } from "effect"
import { AbsolutePath } from "../schema"
import { SkillV2 } from "../skill"
import customizeSploitContent from "./skill/customize-sploit.md" with { type: "text" }

export const CustomizeSploitContent = customizeSploitContent

export const Plugin = define({
  id: "skill",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.skill.transform((draft) => {
      draft.source(
        SkillV2.EmbeddedSource.make({
          type: "embedded",
          skill: SkillV2.Info.make({
            name: "customize-sploit",
            description:
              "Use ONLY when the user is editing or creating sploit's own configuration: sploit.json, sploit.jsonc, files under .sploit/, or files under ~/.config/sploit/. Also use when creating or fixing sploit agents, subagents, commands, skills, plugins, MCP servers, or permission rules. Do not use for the user's own application code, or for any project that is not configuring sploit itself.",
            location: AbsolutePath.make("/builtin/customize-sploit.md"),
            content: CustomizeSploitContent,
          }),
        }),
      )
    })
  }),
})
