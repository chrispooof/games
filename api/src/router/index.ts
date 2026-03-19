import { router } from "../trpc"
import { gameRouter } from "./game"

export const appRouter = router({
  game: gameRouter,
})

/** Exported type used by the UI to get end-to-end type safety */
export type AppRouter = typeof appRouter
