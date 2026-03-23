import { initTRPC } from "@trpc/server"
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify"

/** Per-request context available to all tRPC procedures */
export interface Context {
  req: CreateFastifyContextOptions["req"]
  res: CreateFastifyContextOptions["res"]
}

/** Builds the tRPC request context from Fastify request/response objects. */
export const createContext = ({ req, res }: CreateFastifyContextOptions): Context => ({
  req,
  res,
})

const t = initTRPC.context<Context>().create()

/** Root router factory used by feature routers. */
export const router = t.router
/** Base public procedure with no auth requirements. */
export const publicProcedure = t.procedure
