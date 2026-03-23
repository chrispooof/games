import type { Server, Socket } from "socket.io"
import {
  addPlayer,
  removePlayer,
  getGame,
  getGameState,
  getPlayers,
  updatePlayerSocket,
  updateGameState,
} from "../db/game-store"
import { resolveGameModule } from "./registry"
import type { SocketEmitMessage, SocketLogMeta, SocketMetrics } from "../types/socket"
import { RECONNECT_GRACE_MS } from "../utils/constants"
import { JoinRoomSchema } from "../types/socket"

/** socketId → { roomCode, playerId } — tracks which room/player each socket belongs to */
const socketToPlayer = new Map<string, { roomCode: string; playerId: string }>()

/** playerId → timeout handle — pending removal after disconnect grace period */
const disconnectTimers = new Map<string, NodeJS.Timeout>()

const socketMetrics: SocketMetrics = {
  joinRoomAttempts: 0,
  joinRoomSuccess: 0,
  reconnects: 0,
  unsupportedGameType: new Map<string, number>(),
  actionRejections: new Map<string, number>(),
}

/**
 * Increments a named counter in a map-backed metrics bucket and returns the new value.
 * Used for per-key running counts such as rejection reasons and unsupported game types.
 */
const incrementCount = (bucket: Map<string, number>, key: string): number => {
  const next = (bucket.get(key) ?? 0) + 1
  bucket.set(key, next)
  return next
}

/** Emits one structured JSON log line for easier filtering/aggregation in CI/cloud logs. */
const logSocketEvent = (event: string, meta: SocketLogMeta = {}): void => {
  console.log(
    JSON.stringify({
      scope: "socket",
      event,
      at: new Date().toISOString(),
      ...meta,
    }),
  )
}

/** Tracks and logs unsupported game type occurrences per gameType. */
const trackUnsupportedGameType = (gameType: string, meta: Omit<SocketLogMeta, "gameType">): void => {
  const count = incrementCount(socketMetrics.unsupportedGameType, gameType)
  logSocketEvent("unsupported-game-type", { ...meta, gameType, details: { count } })
}

/** Tracks and logs action rejection reasons seen in emitted action-result envelopes. */
const trackActionRejection = (
  reason: "illegal-move" | "foundation-conflict" | "not-your-pile" | string,
  meta: Omit<SocketLogMeta, "reason">,
): void => {
  const count = incrementCount(socketMetrics.actionRejections, reason)
  logSocketEvent("action-rejected", { ...meta, reason, details: { count } })
}

/**
 * Emits one or more prebuilt socket envelopes to the actor, others, or entire room.
 * Keeps dispatch semantics centralized so game modules only return declarative messages.
 */
const emitMessages = (
  io: Server,
  socket: Socket,
  roomCode: string,
  messages: SocketEmitMessage[],
): void => {
  for (const msg of messages) {
    if (msg.event === "action-result" && typeof msg.payload === "object" && msg.payload !== null) {
      const maybeResult = msg.payload as { ok?: boolean; reason?: string }
      if (maybeResult.ok === false && typeof maybeResult.reason === "string") {
        trackActionRejection(maybeResult.reason, { roomCode, socketId: socket.id })
      }
    }

    if (msg.target === "actor") {
      socket.emit(msg.event, msg.payload)
    } else if (msg.target === "others") {
      socket.to(roomCode).emit(msg.event, msg.payload)
    } else {
      io.to(roomCode).emit(msg.event, msg.payload)
    }
  }
}

/** Standardized error payload for unsupported game modules. */
const unsupportedGameMessage = (gameType: string): { message: string } => ({
  message: `Unsupported game type: ${gameType}`,
})

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
    socket.on("join-room", async (payload: unknown) => {
      socketMetrics.joinRoomAttempts += 1
      const parsed = JoinRoomSchema.safeParse(payload)
      if (!parsed.success) {
        logSocketEvent("join-room-invalid-payload", {
          socketId: socket.id,
          details: { count: socketMetrics.joinRoomAttempts },
        })
        socket.emit("error", { message: "Invalid join-room payload" })
        return
      }
      const { roomCode, playerId } = parsed.data
      socket.join(roomCode)
      socketToPlayer.set(socket.id, { roomCode, playerId })
      logSocketEvent("join-room-attempt", {
        roomCode,
        playerId,
        socketId: socket.id,
        details: { count: socketMetrics.joinRoomAttempts },
      })
      // Validate if room exists
      const game = await getGame(roomCode)
      if (!game) {
        logSocketEvent("join-room-room-not-found", { roomCode, playerId, socketId: socket.id })
        socket.emit("error", { message: "Room not found" })
        return
      }

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
        socketMetrics.reconnects += 1
        logSocketEvent("player-reconnected", {
          roomCode,
          playerId,
          socketId: socket.id,
          details: { count: socketMetrics.reconnects },
        })
      } else {
        await addPlayer(roomCode, playerId, socket.id)
        io.to(roomCode).emit("player-joined", { playerId })
        socketMetrics.joinRoomSuccess += 1
        logSocketEvent("player-joined", {
          roomCode,
          playerId,
          socketId: socket.id,
          details: { count: socketMetrics.joinRoomSuccess },
        })
      }

      // Send the joining player the current room state — players sorted by join order
      const [players, gameState] = await Promise.all([getPlayers(roomCode), getGameState(roomCode)])
      const sortedPlayers = [...players].sort(
        (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime(),
      )

      const gameModule = resolveGameModule(game.gameType)
      const moduleExtras = gameModule?.buildRoomStateExtras
        ? gameModule.buildRoomStateExtras({
            gameState: (gameState?.state as Record<string, unknown> | undefined) ?? null,
          })
        : {}
      if (!gameModule) {
        trackUnsupportedGameType(game.gameType, { roomCode, playerId, socketId: socket.id })
        socket.emit("error", unsupportedGameMessage(game.gameType))
      }

      socket.emit("room-state", {
        players: sortedPlayers,
        maxPlayers: game.playerCount,
        gameState: gameState?.state ?? null,
        ...moduleExtras,
      })
    })

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
    socket.on("game-action", async (action: unknown) => {
      const entry = socketToPlayer.get(socket.id)
      if (!entry) return
      const { roomCode, playerId } = entry

      const [game, current] = await Promise.all([getGame(roomCode), getGameState(roomCode)])
      if (!game) {
        socket.emit("error", { message: "Room not found" })
        return
      }

      const gameModule = resolveGameModule(game.gameType)
      if (!gameModule) {
        trackUnsupportedGameType(game.gameType, { roomCode, playerId, socketId: socket.id })
        socket.emit("error", unsupportedGameMessage(game.gameType))
        return
      }
      if (gameModule.gameActionSchema) {
        const parsedAction = gameModule.gameActionSchema.safeParse(action)
        if (!parsedAction.success) {
          socket.emit("error", { message: `Invalid game-action payload for game type: ${game.gameType}` })
          return
        }
        action = parsedAction.data
      }

      const out = gameModule.handleGameAction({
        action,
        playerId,
        roomCode,
        gameState: (current?.state as Record<string, unknown> | undefined) ?? null,
      })

      if (out.nextState) {
        await updateGameState(roomCode, game.gameType, out.nextState)
      }

      emitMessages(io, socket, roomCode, out.emits)
    })

    /**
     * Client bulk-saves all card positions and pile ordering after the intro animation completes.
     * Builds authoritative NertzGameState on the server and broadcasts the position map to others.
     *
     * Payload: { positions: Record<cardId, {x,z}>, pileState: InitialPileData }
     */
    socket.on("set-state", async (payload: unknown) => {
      const entry = socketToPlayer.get(socket.id)
      if (!entry) return
      const { roomCode, playerId } = entry

      const [game, current, players] = await Promise.all([
        getGame(roomCode),
        getGameState(roomCode),
        getPlayers(roomCode),
      ])
      if (!game) {
        socket.emit("error", { message: "Room not found" })
        return
      }

      const gameModule = resolveGameModule(game.gameType)
      if (!gameModule) {
        trackUnsupportedGameType(game.gameType, { roomCode, playerId, socketId: socket.id })
        socket.emit("error", unsupportedGameMessage(game.gameType))
        return
      }
      if (!gameModule.handleSetState) {
        socket.emit("error", { message: `set-state is not supported for game type: ${game.gameType}` })
        return
      }
      if (gameModule.setStateSchema) {
        const parsedPayload = gameModule.setStateSchema.safeParse(payload)
        if (!parsedPayload.success) {
          socket.emit("error", { message: `Invalid set-state payload for game type: ${game.gameType}` })
          return
        }
        payload = parsedPayload.data
      }

      const out = gameModule.handleSetState({
        payload,
        playerId,
        numPlayers: game.playerCount,
        players,
        gameState: (current?.state as Record<string, unknown> | undefined) ?? null,
      })

      if (out.nextState) {
        await updateGameState(roomCode, game.gameType, out.nextState)
      }

      emitMessages(io, socket, roomCode, out.emits)
    })

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
