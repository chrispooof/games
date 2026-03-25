import { io } from "socket.io-client"
import { publicEnv } from "./env"

/**
 * Shared Socket.io client instance.
 * `autoConnect: false` — call `socket.connect()` explicitly after the player
 * has joined or created a game room.
 */
export const socket = io(publicEnv.apiUrl, { autoConnect: false })
