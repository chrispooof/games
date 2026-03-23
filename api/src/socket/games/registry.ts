import type { SocketGameModule } from "./types"
import { nertzSocketModule } from "./nertz"

const modules = new Map<string, SocketGameModule>([[nertzSocketModule.gameType, nertzSocketModule]])

export const resolveGameModule = (gameType: string): SocketGameModule | null =>
  modules.get(gameType) ?? null
