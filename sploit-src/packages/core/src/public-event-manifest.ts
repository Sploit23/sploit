export * as PublicEventManifest from "./public-event-manifest"

import { Event } from "@sploit-ai/schema/event"
import { EventManifest } from "@sploit-ai/schema/event-manifest"

export const Definitions = EventManifest.ServerDefinitions
export const Latest = Event.latest(Definitions)
