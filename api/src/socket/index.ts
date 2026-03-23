import type { Server, Socket } from "socket.io"
import { z } from "zod"
import {
  addPlayer,
  removePlayer,
  getGame,
  getGameState,
  getPlayers,
  updatePlayerSocket,
  updateGameState,
} from "../db/game-store"
import { resolveGameModule } from "./games/registry"
import type { SocketEmitMessage } from "../types/socket"

/** How long (ms) to keep a disconnected player's session alive before removing them */
const RECONNECT_GRACE_MS = 30_000

/** socketId → { roomCode, playerId } — tracks which room/player each socket belongs to */
const socketToPlayer = new Map<string, { roomCode: string; playerId: string }>()

/** playerId → timeout handle — pending removal after disconnect grace period */
const disconnectTimers = new Map<string, NodeJS.Timeout>()

const emitMessages = (
  io: Server,
  socket: Socket,
  roomCode: string,
  messages: SocketEmitMessage[],
): void => {
  for (const msg of messages) {
    if (msg.target === "actor") {
      socket.emit(msg.event, msg.payload)
    } else if (msg.target === "others") {
      socket.to(roomCode).emit(msg.event, msg.payload)
    } else {
      io.to(roomCode).emit(msg.event, msg.payload)
    }
  }
}

const unsupportedGameMessage = (gameType: string): { message: string } => ({
  message: `Unsupported game type: ${gameType}`,
})

const joinRoomSchema = z.object({
  roomCode: z.string().length(6),
  playerId: z.string().min(1),
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
      const parsed = joinRoomSchema.safeParse(payload)
      if (!parsed.success) {
        socket.emit("error", { message: "Invalid join-room payload" })
        return
      }
      const { roomCode, playerId } = parsed.data
      socket.join(roomCode)
      socketToPlayer.set(socket.id, { roomCode, playerId })
      // Validate if room exists
      const game = await getGame(roomCode)
      if (!game) {
        console.log(`[socket] Room ${roomCode} not found`)
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
        console.log(`[socket] ${playerId} reconnected to room ${roomCode}`)
      } else {
        await addPlayer(roomCode, playerId, socket.id)
        io.to(roomCode).emit("player-joined", { playerId })
        console.log(`[socket] ${playerId} joined room ${roomCode}`)
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
