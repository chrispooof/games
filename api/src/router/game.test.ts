import { TRPCError } from "@trpc/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { createGameMock, getGameMock } = vi.hoisted(() => ({
  createGameMock: vi.fn(),
  getGameMock: vi.fn(),
}))

vi.mock("../db/game-store", () => ({
  createGame: createGameMock,
  getGame: getGameMock,
}))

describe("router/game", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns a generic internal error when game creation persistence fails", async () => {
    createGameMock.mockRejectedValueOnce(new Error("aws dynamodb access denied"))

    const { appRouter } = await import("./index.js")
    const caller = appRouter.createCaller({
      req: {} as never,
      res: {} as never,
    })

    await expect(caller.game.create({ playerCount: 2, gameType: "nertz" })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Unable to create game right now",
    })
  })

  it("preserves not-found errors when looking up a missing game", async () => {
    getGameMock.mockResolvedValueOnce(null)

    const { appRouter } = await import("./index.js")
    const caller = appRouter.createCaller({
      req: {} as never,
      res: {} as never,
    })

    await expect(caller.game.get({ roomCode: "ABC123" })).rejects.toBeInstanceOf(TRPCError)
  })
})
