import { TRPCError } from "@trpc/server"
import { router, publicProcedure } from "../trpc"
import { createGame, getGame } from "../db/game-store"
import { createGameInputSchema, getGameInputSchema } from "../types/game"
import { ROOM_CODE_LENGTH } from "../utils/constants"

/** Generates a random 6-character uppercase room code */
const generateRoomCode = (): string =>
  Math.random().toString(36).slice(2, 2 + ROOM_CODE_LENGTH).toUpperCase()

/**
 * Converts unexpected persistence-layer failures into generic tRPC errors so
 * infrastructure details are not exposed to the browser.
 */
const throwInternalGameError = (message: string, cause: unknown): never => {
  console.error(message, cause)
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message })
}

export const gameRouter = router({
  /** Creates a new game session and persists it to DynamoDB */
  create: publicProcedure
    .input(createGameInputSchema)
    .mutation(async ({ input }) => {
      try {
        const roomCode = generateRoomCode()
        const game = await createGame({
          roomCode,
          gameType: input.gameType,
          playerCount: input.playerCount,
        })
        return { roomCode: game.roomCode, playerCount: game.playerCount, status: game.status }
      } catch (error) {
        throwInternalGameError("Unable to create game right now", error)
      }
    }),

  /** Fetches a game session by room code */
  get: publicProcedure
    .input(getGameInputSchema)
    .query(async ({ input }) => {
      try {
        const game = await getGame(input.roomCode)
        if (!game) {
          throw new TRPCError({ code: "NOT_FOUND", message: `Game ${input.roomCode} not found` })
        }
        return { roomCode: game.roomCode, playerCount: game.playerCount, status: game.status }
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error
        }
        throwInternalGameError("Unable to load game right now", error)
      }
    }),
})
