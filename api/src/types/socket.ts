import type { GamePlayer } from "./db"
import type { ZodType } from "zod"
import { z } from "zod"
import { ROOM_CODE_LENGTH } from "../utils/constants"

/** Runtime schema for inbound `join-room` payload validation. */
export const JoinRoomSchema = z.object({
  roomCode: z.string().length(ROOM_CODE_LENGTH),
  playerId: z.string().min(1),
})

export type SocketEmitTarget = "actor" | "others" | "room"

/** Envelope describing one socket emission and its target audience. */
export interface SocketEmitMessage {
  target: SocketEmitTarget
  event: string
  payload: unknown
}

/** Context provided when augmenting room-state payloads per game module. */
export interface BuildRoomStateExtrasContext {
  gameState: Record<string, unknown> | null
}

/** Context for game-action dispatch into a game module. */
export interface HandleGameActionContext {
  action: unknown
  playerId: string
  roomCode: string
  gameState: Record<string, unknown> | null
}

/** Context for set-state dispatch into a game module. */
export interface HandleSetStateContext {
  payload: unknown
  playerId: string
  numPlayers: number
  players: GamePlayer[]
  gameState: Record<string, unknown> | null
}

/** Module execution result: emitted events and optional persisted state. */
export interface GameModuleResult {
  emits: SocketEmitMessage[]
  nextState?: Record<string, unknown>
}

/** Contract implemented by each game-specific socket module. */
export interface SocketGameModule {
  gameType: string
  gameActionSchema?: ZodType<unknown>
  setStateSchema?: ZodType<unknown>
  buildRoomStateExtras?: (ctx: BuildRoomStateExtrasContext) => Record<string, unknown>
  handleGameAction: (ctx: HandleGameActionContext) => GameModuleResult
  handleSetState?: (ctx: HandleSetStateContext) => GameModuleResult
}
