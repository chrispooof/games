import type { Server } from "socket.io"
import {
  addPlayer,
  removePlayer,
  getGame,
  getGameState,
  getPlayers,
  updatePlayerSocket,
  updateGameState,
} from "../db/game-store"
import {
  createOrMergeGameState,
  processAction,
  processFlipStock,
  getFoundationSlotPosition,
  type GameAction,
  type NertzGameState,
  type InitialPileData,
} from "./logic/nertz"
import { computeDealPiles, computeSeat } from "./logic/geometry"

/** How long (ms) to keep a disconnected player's session alive before removing them */
const RECONNECT_GRACE_MS = 30_000

/** socketId → { roomCode, playerId } — tracks which room/player each socket belongs to */
const socketToPlayer = new Map<string, { roomCode: string; playerId: string }>()

/** playerId → timeout handle — pending removal after disconnect grace period */
const disconnectTimers = new Map<string, NodeJS.Timeout>()

/**
 * Registers all Socket.io event handlers on the server.
 * Handles player join/reconnect, disconnect with grace period, and game actions.
 */
export const registerSocketHandlers = (io: Server): void => {
  io.on("connection", (socket) => {
    console.log(`[socket] connected: ${socket.id}`)

    /**
     * Client joins (or rejoins) a game room.
     * Payload: { roomCode, playerId } — playerId is the stable localStorage UUID.
     */
    socket.on(
      "join-room",
      async ({ roomCode, playerId }: { roomCode: string; playerId: string }) => {
        socket.join(roomCode)
        socketToPlayer.set(socket.id, { roomCode, playerId })
        // Validate if room exists
        const game = await getGame(roomCode)
        if (!game) {
          console.log(`[socket] Room ${roomCode} not found`)
          socket.emit("error", { message: "Room not found" })
        } else {
          // Cancel any pending removal from a previous disconnect
          const pendingTimer = disconnectTimers.get(playerId)
          if (pendingTimer) {
            clearTimeout(pendingTimer)
            disconnectTimers.delete(playerId)
          }

          // Determine if this is a reconnection or a fresh join
          const currentPlayers = await getPlayers(roomCode)
          const isReconnect = currentPlayers.some((p) => p.playerId === playerId)

          if (isReconnect) {
            await updatePlayerSocket(roomCode, playerId, socket.id)
            io.to(roomCode).emit("player-reconnected", { playerId })
            console.log(`[socket] ${playerId} reconnected to room ${roomCode}`)
          } else {
            await addPlayer(roomCode, playerId, socket.id)
            io.to(roomCode).emit("player-joined", { playerId })
            console.log(`[socket] ${playerId} joined room ${roomCode}`)
          }

          // Send the joining player the current room state — players sorted by join order
          const [players, gameState] = await Promise.all([
            getPlayers(roomCode),
            getGameState(roomCode),
          ])
          const sortedPlayers = [...players].sort(
            (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime(),
          )
          socket.emit("room-state", {
            players: sortedPlayers,
            maxPlayers: game?.playerCount ?? 1,
            gameState: gameState?.state ?? null,
          })
        }
      },
    )

    /**
     * Client explicitly leaves a room (e.g. navigating away intentionally).
     * Immediate removal — no grace period.
     */
    socket.on("leave-room", async () => {
      const entry = socketToPlayer.get(socket.id)
      if (!entry) return
      const { roomCode, playerId } = entry
      socketToPlayer.delete(socket.id)
      await removePlayer(roomCode, playerId)
      io.to(roomCode).emit("player-left", { playerId })
      socket.leave(roomCode)
    })

    /**
     * Client performs a game action.
     *
     * Typed actions (play-to-foundation, play-to-work-pile) are validated by the server:
     *   - Acting socket receives `action-result { ok, cardId, reason? }`
     *   - On success: `game-state-update { cardPositions }` is broadcast to the room
     *
     * Legacy move-card actions are forwarded without validation (free card movement).
     */
    socket.on("game-action", async (action: GameAction) => {
      const entry = socketToPlayer.get(socket.id)
      if (!entry) return
      const { roomCode, playerId } = entry

      // Flip-stock: move up to 3 cards from stock → waste (or cycle waste → stock)
      if (action.type === "flip-stock") {
        const current = await getGameState(roomCode)
        const nertzState = current?.state
          ? (current.state as unknown as NertzGameState)
          : null
        if (!nertzState?.players) {
          socket.emit("action-result", { ok: false, cardId: "", reason: "illegal-move" })
          return
        }
        const { result, gameStateUpdate } = processFlipStock(playerId, nertzState)
        socket.emit("action-result", result)
        if (result.ok && gameStateUpdate) {
          await updateGameState(roomCode, "nertz", nertzState as unknown as Record<string, unknown>)
          socket.to(roomCode).emit("game-state-update", {
            cardPositions: gameStateUpdate.cardPositions,
          })
        }
        return
      }

      // Legacy free move — merge position and broadcast unchanged
      if (action.type === "move-card") {
        const current = await getGameState(roomCode)
        const state = (current?.state ?? {}) as Record<string, unknown>
        const cardPositions = (state.cardPositions as Record<string, { x: number; z: number }>) ?? {}
        cardPositions[action.cardId] = action.position
        await updateGameState(roomCode, "nertz", { ...state, cardPositions })
        socket.to(roomCode).emit("game-action", action)
        return
      }

      // Typed action — validate and respond
      const current = await getGameState(roomCode)
      if (!current?.state) {
        socket.emit("action-result", { ok: false, cardId: action.cardId, reason: "illegal-move" })
        return
      }

      const nertzState = current.state as unknown as NertzGameState
      if (!nertzState.players) {
        socket.emit("action-result", { ok: false, cardId: action.cardId, reason: "illegal-move" })
        return
      }

      // For foundation plays, resolve the canonical slot position server-side
      // (client coordinates are not trusted). Work pile positions are computed
      // inside applyWorkPilePlay using server geometry.
      let resolvedPosition = { x: 0, z: 0 }
      if (action.type === "play-to-foundation") {
        const slotPos = getFoundationSlotPosition(action.slotIndex, nertzState.numPlayers)
        if (!slotPos) {
          socket.emit("action-result", { ok: false, cardId: action.cardId, reason: "illegal-move" })
          return
        }
        resolvedPosition = slotPos
      }

      const { result, gameStateUpdate, isGameOver } = processAction(
        action,
        playerId,
        nertzState,
        resolvedPosition,
      )

      // Always respond to the acting socket
      socket.emit("action-result", result)

      if (result.ok && gameStateUpdate) {
        // Persist updated state
        await updateGameState(roomCode, "nertz", nertzState as unknown as Record<string, unknown>)

        // Broadcast position delta to the room so other clients update card rendering.
        // Include foundation state when a foundation play happened so clients can
        // keep their smart-snap foundation tracking in sync.
        socket.to(roomCode).emit("game-state-update", {
          cardPositions: gameStateUpdate.cardPositions,
          ...(gameStateUpdate.foundations ? { foundations: gameStateUpdate.foundations } : {}),
        })

        if (isGameOver) {
          io.to(roomCode).emit("game-over", { winnerId: nertzState.winnerId })
          console.log(`[socket] game over in ${roomCode} — winner: ${nertzState.winnerId}`)
        }
      }
    })

    /**
     * Client bulk-saves all card positions and pile ordering after the intro animation completes.
     * Builds authoritative NertzGameState on the server and broadcasts the position map to others.
     *
     * Payload: { positions: Record<cardId, {x,z}>, pileState: InitialPileData }
     */
    socket.on(
      "set-state",
      async (payload: {
        positions: Record<string, { x: number; z: number }>
        pileState: InitialPileData
      }) => {
        const entry = socketToPlayer.get(socket.id)
        if (!entry) return
        const { roomCode, playerId } = entry

        const [game, current, players] = await Promise.all([
          getGame(roomCode),
          getGameState(roomCode),
          getPlayers(roomCode),
        ])

        const numPlayers = game?.playerCount ?? 1

        // Determine this player's index from sorted join order
        const sortedPlayers = [...players].sort(
          (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime(),
        )
        const playerIndex = sortedPlayers.findIndex((p) => p.playerId === playerId)

        const existing = current?.state ? (current.state as unknown as NertzGameState) : null
        const newState = createOrMergeGameState(
          playerId,
          playerIndex >= 0 ? playerIndex : 0,
          numPlayers,
          payload.positions,
          payload.pileState,
          existing,
        )

        await updateGameState(roomCode, "nertz", newState as unknown as Record<string, unknown>)

        // Let other players update their view with the new card positions
        socket.to(roomCode).emit("game-state-update", { cardPositions: newState.cardPositions })
      },
    )

    /**
     * Socket disconnected (network drop, tab close, etc.).
     * Notifies the room and starts a 30s grace period before permanently removing the player.
     */
    socket.on("disconnect", async () => {
      const entry = socketToPlayer.get(socket.id)
      if (!entry) {
        console.log(`[socket] disconnected (no room): ${socket.id}`)
        return
      }
      const { roomCode, playerId } = entry
      socketToPlayer.delete(socket.id)

      io.to(roomCode).emit("player-disconnected", { playerId })
      console.log(`[socket] ${playerId} disconnected from room ${roomCode}`)

      // Remove the player after the grace period if they don't reconnect
      const timer = setTimeout(async () => {
        disconnectTimers.delete(playerId)
        await removePlayer(roomCode, playerId)
        io.to(roomCode).emit("player-left", { playerId })
        console.log(`[socket] grace period expired: removed ${playerId} from ${roomCode}`)
      }, RECONNECT_GRACE_MS)

      disconnectTimers.set(playerId, timer)
    })
  })
}
