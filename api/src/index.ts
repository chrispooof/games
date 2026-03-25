import "dotenv/config"
import Fastify from "fastify"
import cors from "@fastify/cors"
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify"
import { Server } from "socket.io"
import { appConfig } from "./config/env"
import { appRouter } from "./router/index"
import { createContext } from "./trpc"
import { registerSocketHandlers } from "./socket/index"

const start = async () => {
  const server = Fastify({ logger: true })

  await server.register(cors, { origin: appConfig.uiOrigin })

  await server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: { router: appRouter, createContext },
  })

  /** Lightweight deployment health endpoint used by GitHub Actions and ALB checks. */
  server.get("/health", async () => ({
    status: "ok",
    environment: appConfig.nodeEnv,
  }))

  await server.listen({ port: appConfig.port, host: "0.0.0.0" })

  /** Socket.io attaches to the underlying http.Server after Fastify has started */
  const io = new Server(server.server, {
    cors: { origin: appConfig.uiOrigin },
  })

  registerSocketHandlers(io)

  console.log(`API server running on http://0.0.0.0:${appConfig.port}`)
}

start()
