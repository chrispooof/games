import { z } from "zod"
import { DEFAULT_GAME_TYPE, MAX_PLAYERS, MIN_PLAYERS, ROOM_CODE_LENGTH } from "../utils/constants"

/** Runtime schema for `game.create` input payloads. */
export const createGameInputSchema = z.object({
  playerCount: z.number().min(MIN_PLAYERS).max(MAX_PLAYERS),
  gameType: z.string().default(DEFAULT_GAME_TYPE),
})

/** Runtime schema for `game.get` input payloads. */
export const getGameInputSchema = z.object({
  roomCode: z.string().length(ROOM_CODE_LENGTH),
})

export type CreateGameInput = z.infer<typeof createGameInputSchema>
export type GetGameInput = z.infer<typeof getGameInputSchema>
