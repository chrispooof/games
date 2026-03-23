import {
  createOrMergeGameState,
  getFoundationSlotPosition,
  processAction,
  processFlipStock,
  type GameAction,
  type InitialPileData,
  type NertzGameState,
} from "../logic/nertz"
import type {
  BuildRoomStateExtrasContext,
  GameModuleResult,
  HandleGameActionContext,
  HandleSetStateContext,
  SocketGameModule,
} from "./types"

/** Builds nertz pile counts and top card IDs from game state for broadcast */
const buildNertzInfo = (players: NertzGameState["players"]) => {
  const nertzCounts: Record<string, number> = {}
  const nertzTops: Record<string, string | null> = {}
  for (const p of players) {
    nertzCounts[p.playerId] = p.nertzPile.length
    nertzTops[p.playerId] = p.nertzPile.length > 0 ? p.nertzPile[p.nertzPile.length - 1] : null
  }
  return { nertzCounts, nertzTops }
}

const illegalMoveResult = (cardId = "") => ({
  target: "actor" as const,
  event: "action-result",
  payload: { ok: false, cardId, reason: "illegal-move" },
})

const asNertzState = (state: Record<string, unknown> | null): NertzGameState | null => {
  if (!state) return null
  const maybe = state as unknown as NertzGameState
  return Array.isArray(maybe.players) ? maybe : null
}

const asGameAction = (action: unknown): GameAction | null => {
  if (!action || typeof action !== "object") return null
  const maybe = action as Partial<GameAction>
  return typeof maybe.type === "string" ? (action as GameAction) : null
}

const asSetStatePayload = (
  payload: unknown,
): { positions: Record<string, { x: number; z: number }>; pileState: InitialPileData } | null => {
  if (!payload || typeof payload !== "object") return null
  const maybe = payload as {
    positions?: Record<string, { x: number; z: number }>
    pileState?: InitialPileData
  }
  if (!maybe.positions || !maybe.pileState) return null
  if (!Array.isArray(maybe.pileState.nertzPile)) return null
  if (!Array.isArray(maybe.pileState.workPiles) || maybe.pileState.workPiles.length !== 4) return null
  if (!Array.isArray(maybe.pileState.stock) || !Array.isArray(maybe.pileState.waste)) return null
  return {
    positions: maybe.positions,
    pileState: maybe.pileState,
  }
}

const buildRoomStateExtras = (ctx: BuildRoomStateExtrasContext): Record<string, unknown> => {
  const nertzState = asNertzState(ctx.gameState)
  return nertzState ? buildNertzInfo(nertzState.players) : {}
}

const handleGameAction = (ctx: HandleGameActionContext): GameModuleResult => {
  const action = asGameAction(ctx.action)
  if (!action) return { emits: [illegalMoveResult()] }

  if (action.type === "flip-stock") {
    const nertzState = asNertzState(ctx.gameState)
    if (!nertzState) return { emits: [illegalMoveResult()] }

    const { result, gameStateUpdate } = processFlipStock(ctx.playerId, nertzState)
    const emits: GameModuleResult["emits"] = [
      { target: "actor", event: "action-result", payload: result },
    ]

    if (result.ok && gameStateUpdate) {
      emits.push({
        target: "others",
        event: "game-state-update",
        payload: {
          cardPositions: gameStateUpdate.cardPositions,
          ...buildNertzInfo(nertzState.players),
        },
      })
      return { emits, nextState: nertzState as unknown as Record<string, unknown> }
    }
    return { emits }
  }

  if (action.type === "move-card") {
    const state = (ctx.gameState ?? {}) as Record<string, unknown>
    const cardPositions = (state.cardPositions as Record<string, { x: number; z: number }>) ?? {}
    cardPositions[action.cardId] = action.position
    return {
      emits: [{ target: "others", event: "game-action", payload: action }],
      nextState: { ...state, cardPositions },
    }
  }

  const nertzState = asNertzState(ctx.gameState)
  if (!nertzState) return { emits: [illegalMoveResult(action.cardId)] }

  let resolvedPosition = { x: 0, z: 0 }
  if (action.type === "play-to-foundation") {
    const slotPos = getFoundationSlotPosition(action.slotIndex, nertzState.numPlayers)
    if (!slotPos) return { emits: [illegalMoveResult(action.cardId)] }
    resolvedPosition = slotPos
  }

  const { result, gameStateUpdate, isGameOver } = processAction(
    action,
    ctx.playerId,
    nertzState,
    resolvedPosition,
  )

  const emits: GameModuleResult["emits"] = [{ target: "actor", event: "action-result", payload: result }]

  if (result.ok && gameStateUpdate) {
    emits.push({
      target: "others",
      event: "game-state-update",
      payload: {
        cardPositions: gameStateUpdate.cardPositions,
        ...(gameStateUpdate.foundations ? { foundations: gameStateUpdate.foundations } : {}),
        ...buildNertzInfo(nertzState.players),
      },
    })
    if (isGameOver) {
      emits.push({
        target: "room",
        event: "game-over",
        payload: { winnerId: nertzState.winnerId },
      })
    }
    return { emits, nextState: nertzState as unknown as Record<string, unknown> }
  }

  return { emits }
}

const handleSetState = (ctx: HandleSetStateContext): GameModuleResult => {
  const parsed = asSetStatePayload(ctx.payload)
  if (!parsed) {
    return {
      emits: [{ target: "actor", event: "error", payload: { message: "Invalid set-state payload" } }],
    }
  }

  const sortedPlayers = [...ctx.players].sort(
    (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime(),
  )
  const playerIndex = sortedPlayers.findIndex((p) => p.playerId === ctx.playerId)
  const existing = asNertzState(ctx.gameState)

  const newState = createOrMergeGameState(
    ctx.playerId,
    playerIndex >= 0 ? playerIndex : 0,
    ctx.numPlayers,
    parsed.positions,
    parsed.pileState,
    existing,
  )

  return {
    emits: [
      {
        target: "others",
        event: "game-state-update",
        payload: {
          cardPositions: newState.cardPositions,
          ...buildNertzInfo(newState.players),
        },
      },
    ],
    nextState: newState as unknown as Record<string, unknown>,
  }
}

export const nertzSocketModule: SocketGameModule = {
  gameType: "nertz",
  buildRoomStateExtras,
  handleGameAction,
  handleSetState,
}
