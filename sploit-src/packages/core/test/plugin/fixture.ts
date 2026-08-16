import { AgentV2 } from "@sploit-ai/core/agent"
import { AISDK } from "@sploit-ai/core/aisdk"
import { Catalog } from "@sploit-ai/core/catalog"
import { CommandV2 } from "@sploit-ai/core/command"
import { Credential } from "@sploit-ai/core/credential"
import { AppNodeBuilder } from "@sploit-ai/core/effect/app-node-builder"
import { LayerNodePlatform } from "@sploit-ai/core/effect/app-node-platform"
import { LayerNode } from "@sploit-ai/core/effect/layer-node"
import { EventV2 } from "@sploit-ai/core/event"
import { FileSystem } from "@sploit-ai/core/filesystem"
import { FSUtil } from "@sploit-ai/core/fs-util"
import { Integration } from "@sploit-ai/core/integration"
import { Location } from "@sploit-ai/core/location"
import { Npm } from "@sploit-ai/core/npm"
import { PluginV2 } from "@sploit-ai/core/plugin"
import { Reference } from "@sploit-ai/core/reference"
import { SkillV2 } from "@sploit-ai/core/skill"
import { Effect, Layer } from "effect"
import { tempLocationLayer } from "../fixture/location"

const npmLayer = Layer.succeed(
  Npm.Service,
  Npm.Service.of({
    add: () => Effect.succeed({ directory: "", entrypoint: undefined }),
    install: () => Effect.void,
    which: () => Effect.succeed(undefined),
  }),
)

export const PluginTestLayer = AppNodeBuilder.build(
  LayerNode.group([
    FileSystem.node,
    FSUtil.node,
    Location.node,
    Npm.node,
    Credential.node,
    EventV2.node,
    LayerNodePlatform.httpClient,
    PluginV2.node,
    AgentV2.node,
    AISDK.node,
    Catalog.node,
    CommandV2.node,
    Integration.node,
    Reference.node,
    SkillV2.node,
  ]),
  [
    [Location.node, tempLocationLayer],
    [Npm.node, npmLayer],
  ],
)
