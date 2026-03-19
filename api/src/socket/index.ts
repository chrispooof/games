import type { Server } from "socket.io"
import {
  addPlayer,
  removePlayer,
  getGameState,
  getPlayers,
  updatePlayerSocket,
  updateGameState,
} from "../db/game-store"

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

        // Send the joining player the current room state (all players + game state)
        const players = await getPlayers(roomCode)
        const gameState = await getGameState(roomCode)
        socket.emit("room-state", { players, gameState: gameState ?? null })
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
     * Client performs a game action (e.g. moving a card).
     * Validates the sender is in a room, persists the action to game state,
     * and broadcasts to all other players in the room.
     *
     * Payload: { type: 'move-card', cardId: string, position: { x, z } }
     */
    socket.on(
      "game-action",
      async (action: {
        type: string
        cardId: string
        position: { x: number; z: number }
      }) => {
        const entry = socketToPlayer.get(socket.id)
        if (!entry) return
        const { roomCode } = entry

        // Merge card position into the persisted game state
        const current = await getGameState(roomCode)
        const state = current?.state ?? {}
        const cardPositions = (
          state.cardPositions as Record<string, { x: number; z: number }>
        ) ?? {}
        cardPositions[action.cardId] = action.position
        await updateGameState(roomCode, "nertz", { ...state, cardPositions })

        // Broadcast to everyone else in the room
        socket.to(roomCode).emit("game-action", action)
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
