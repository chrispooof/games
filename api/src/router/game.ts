import { z } from "zod"
import { router, publicProcedure } from "../trpc"

/** Generates a random 6-character uppercase room code */
const generateRoomCode = (): string => Math.random().toString(36).slice(2, 8).toUpperCase()

export const gameRouter = router({
  /** Creates a new game session and returns its room code */
  create: publicProcedure
    .input(z.object({ playerCount: z.number().min(2).max(8) }))
    .mutation(async ({ input }) => {
      const roomCode = generateRoomCode()
      // TODO: persist game to database
      return { roomCode, playerCount: input.playerCount, status: "waiting" as const }
    }),

  /** Fetches a game session by room code */
  get: publicProcedure
    .input(z.object({ roomCode: z.string().length(6) }))
    .query(async ({ input }) => {
      // TODO: fetch from database
      return { roomCode: input.roomCode, playerCount: 2, status: "waiting" as const }
    }),
})
