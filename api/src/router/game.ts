import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { router, publicProcedure } from "../trpc"
import { createGame, getGame } from "../db/game-store"

/** Generates a random 6-character uppercase room code */
const generateRoomCode = (): string => Math.random().toString(36).slice(2, 8).toUpperCase()

export const gameRouter = router({
  /** Creates a new game session and persists it to DynamoDB */
  create: publicProcedure
    .input(
      z.object({
        playerCount: z.number().min(2).max(8),
        gameType: z.string().default("nertz"),
      }),
    )
    .mutation(async ({ input }) => {
      const roomCode = generateRoomCode()
      const game = await createGame({ roomCode, gameType: input.gameType, playerCount: input.playerCount })
      return { roomCode: game.roomCode, playerCount: game.playerCount, status: game.status }
    }),

  /** Fetches a game session by room code */
  get: publicProcedure
    .input(z.object({ roomCode: z.string().length(6) }))
    .query(async ({ input }) => {
      const game = await getGame(input.roomCode)
      if (!game) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Game ${input.roomCode} not found` })
      }
      return { roomCode: game.roomCode, playerCount: game.playerCount, status: game.status }
    }),
})
