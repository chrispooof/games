import { io } from "socket.io-client"

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001"

/**
 * Shared Socket.io client instance.
 * `autoConnect: false` — call `socket.connect()` explicitly after the player
 * has joined or created a game room.
 */
export const socket = io(API_URL, { autoConnect: false })
