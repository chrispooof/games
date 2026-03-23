/** Supported lifecycle states for a game room. */
export type GameStatus = "waiting" | "in-progress" | "finished"

/** Persisted room metadata record. */
export interface GameMetadata {
  roomCode: string
  gameType: string
  playerCount: number
  status: GameStatus
  createdAt: string
  updatedAt: string
  ttl: number
}

/** Persisted player session record for a room. */
export interface GamePlayer {
  playerId: string
  socketId: string
  joinedAt: string
}

/** Persisted game-state payload wrapper keyed by room code. */
export interface GameState {
  gameType: string
  state: Record<string, unknown>
}
