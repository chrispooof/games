import type { Server } from "socket.io"
import { addPlayer, removePlayer, getGameState } from "../db/game-store"

/**
 * Tracks which room each socket is in so we can clean up on disconnect.
 * socketId → roomCode
 */
const socketRooms = new Map<string, string>()

/**
 * Registers all Socket.io event handlers on the server.
 * Used for real-time communication: player presence, game state sync, etc.
 */
export const registerSocketHandlers = (io: Server): void => {
  io.on("connection", (socket) => {
    console.log(`[socket] connected: ${socket.id}`)

    /** Client joins a game room to receive real-time events for that session */
    socket.on("join-room", async (roomCode: string) => {
      socket.join(roomCode)
      socketRooms.set(socket.id, roomCode)

      await addPlayer(roomCode, socket.id, socket.id)

      // Emit current game state to the joining player
      const gameState = await getGameState(roomCode)
      if (gameState) {
        socket.emit("game-state", gameState)
      }

      io.to(roomCode).emit("player-joined", { socketId: socket.id })
      console.log(`[socket] ${socket.id} joined room ${roomCode}`)
    })

    socket.on("leave-room", async (roomCode: string) => {
      socket.leave(roomCode)
      socketRooms.delete(socket.id)
      await removePlayer(roomCode, socket.id)
      io.to(roomCode).emit("player-left", { socketId: socket.id })
    })

    socket.on("disconnect", async () => {
      const roomCode = socketRooms.get(socket.id)
      if (roomCode) {
        socketRooms.delete(socket.id)
        await removePlayer(roomCode, socket.id)
        io.to(roomCode).emit("player-left", { socketId: socket.id })
      }
      console.log(`[socket] disconnected: ${socket.id}`)
    })
  })
}
