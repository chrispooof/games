import type { Server } from "socket.io"

/**
 * Registers all Socket.io event handlers on the server.
 * Used for real-time communication: player presence, game state sync, etc.
 */
export const registerSocketHandlers = (io: Server): void => {
  io.on("connection", (socket) => {
    console.log(`[socket] connected: ${socket.id}`)

    /** Client joins a game room to receive real-time events for that session */
    socket.on("join-room", (roomCode: string) => {
      socket.join(roomCode)
      // TODO: fetch from database and emit game state
      io.to(roomCode).emit("player-joined", { socketId: socket.id })
      console.log(`[socket] ${socket.id} joined room ${roomCode}`)
    })

    socket.on("leave-room", (roomCode: string) => {
      socket.leave(roomCode)
      io.to(roomCode).emit("player-left", { socketId: socket.id })
    })

    socket.on("disconnect", () => {
      console.log(`[socket] disconnected: ${socket.id}`)
    })
  })
}
