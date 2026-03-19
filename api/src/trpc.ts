import { initTRPC } from "@trpc/server"
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify"

/** Per-request context available to all tRPC procedures */
export interface Context {
  req: CreateFastifyContextOptions["req"]
  res: CreateFastifyContextOptions["res"]
}

export const createContext = ({ req, res }: CreateFastifyContextOptions): Context => ({
  req,
  res,
})

const t = initTRPC.context<Context>().create()

export const router = t.router
export const publicProcedure = t.procedure
