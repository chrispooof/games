import type { GamePlayer } from "../../db/game-store"

export type SocketEmitTarget = "actor" | "others" | "room"

export interface SocketEmitMessage {
  target: SocketEmitTarget
  event: string
  payload: unknown
}

export interface BuildRoomStateExtrasContext {
  gameState: Record<string, unknown> | null
}

export interface HandleGameActionContext {
  action: unknown
  playerId: string
  roomCode: string
  gameState: Record<string, unknown> | null
}

export interface HandleSetStateContext {
  payload: unknown
  playerId: string
  numPlayers: number
  players: GamePlayer[]
  gameState: Record<string, unknown> | null
}

export interface GameModuleResult {
  emits: SocketEmitMessage[]
  nextState?: Record<string, unknown>
}

export interface SocketGameModule {
  gameType: string
  buildRoomStateExtras?: (ctx: BuildRoomStateExtrasContext) => Record<string, unknown>
  handleGameAction: (ctx: HandleGameActionContext) => GameModuleResult
  handleSetState?: (ctx: HandleSetStateContext) => GameModuleResult
}
