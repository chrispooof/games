import type { SocketGameModule } from "../types/socket"
import { nertzSocketModule } from "./games/nertz"

const modules = new Map<string, SocketGameModule>([[nertzSocketModule.gameType, nertzSocketModule]])

/** Resolves a game module by gameType; returns null when unregistered. */
export const resolveGameModule = (gameType: string): SocketGameModule | null =>
  modules.get(gameType) ?? null
