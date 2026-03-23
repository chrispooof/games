import "dotenv/config"
import Fastify from "fastify"
import cors from "@fastify/cors"
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify"
import { Server } from "socket.io"
import { appRouter } from "./router/index"
import { createContext } from "./trpc"
import { registerSocketHandlers } from "./socket/index"
import { DEFAULT_API_PORT, DEFAULT_UI_ORIGIN } from "./utils/constants"

const PORT = Number(process.env.PORT ?? DEFAULT_API_PORT)
const UI_ORIGIN = process.env.UI_ORIGIN ?? DEFAULT_UI_ORIGIN

const server = Fastify({ logger: true })

await server.register(cors, { origin: UI_ORIGIN })

await server.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: { router: appRouter, createContext },
})

await server.listen({ port: PORT, host: "0.0.0.0" })

/** Socket.io attaches to the underlying http.Server after Fastify has started */
const io = new Server(server.server, {
  cors: { origin: UI_ORIGIN },
})

registerSocketHandlers(io)

console.log(`API server running on http://0.0.0.0:${PORT}`)
