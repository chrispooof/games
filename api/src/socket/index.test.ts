import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SocketGameModule } from "../types/socket"
import { z } from "zod"

const {
  addPlayerMock,
  removePlayerMock,
  getGameMock,
  getGameStateMock,
  getPlayersMock,
  updatePlayerSocketMock,
  updateGameStateMock,
  resolveGameModuleMock,
} = vi.hoisted(() => ({
  addPlayerMock: vi.fn(),
  removePlayerMock: vi.fn(),
  getGameMock: vi.fn(),
  getGameStateMock: vi.fn(),
  getPlayersMock: vi.fn(),
  updatePlayerSocketMock: vi.fn(),
  updateGameStateMock: vi.fn(),
  resolveGameModuleMock: vi.fn(),
}))

vi.mock("../db/game-store", () => ({
  addPlayer: addPlayerMock,
  removePlayer: removePlayerMock,
  getGame: getGameMock,
  getGameState: getGameStateMock,
  getPlayers: getPlayersMock,
  updatePlayerSocket: updatePlayerSocketMock,
  updateGameState: updateGameStateMock,
}))

vi.mock("./registry", () => ({
  resolveGameModule: resolveGameModuleMock,
}))

interface FakeSocket {
  id: string
  emit: ReturnType<typeof vi.fn>
  join: ReturnType<typeof vi.fn>
  leave: ReturnType<typeof vi.fn>
  to: ReturnType<typeof vi.fn>
  on: (event: string, cb: (...args: any[]) => any) => void
  trigger: (event: string, payload?: unknown) => Promise<void>
  toEmit: ReturnType<typeof vi.fn>
}

interface FakeIo {
  on: ReturnType<typeof vi.fn>
  to: ReturnType<typeof vi.fn>
  roomEmit: ReturnType<typeof vi.fn>
  connect: (socket: FakeSocket) => void
}

const createFakeSocket = (id: string): FakeSocket => {
  const handlers = new Map<string, (...args: any[]) => any>()
  const toEmit = vi.fn()
  return {
    id,
    emit: vi.fn(),
    join: vi.fn(),
    leave: vi.fn(),
    to: vi.fn(() => ({ emit: toEmit })),
    on: (event: string, cb: (...args: any[]) => any) => {
      handlers.set(event, cb)
    },
    trigger: async (event: string, payload?: unknown) => {
      const fn = handlers.get(event)
      if (!fn) throw new Error(`Missing handler for event ${event}`)
      await fn(payload)
    },
    toEmit,
  }
}

const createFakeIo = (): FakeIo => {
  let onConnection: ((socket: FakeSocket) => void) | null = null
  const roomEmit = vi.fn()
  return {
    on: vi.fn((event: string, cb: (socket: FakeSocket) => void) => {
      if (event === "connection") onConnection = cb
    }),
    to: vi.fn(() => ({ emit: roomEmit })),
    roomEmit,
    connect: (socket: FakeSocket) => {
      if (!onConnection) throw new Error("connection handler not registered")
      onConnection(socket)
    },
  }
}

describe("socket index dispatch contract", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    addPlayerMock.mockResolvedValue(undefined)
    removePlayerMock.mockResolvedValue(undefined)
    updatePlayerSocketMock.mockResolvedValue(undefined)
    updateGameStateMock.mockResolvedValue(undefined)
    getPlayersMock.mockResolvedValue([])
    getGameStateMock.mockResolvedValue(null)
  })

  const registerAndJoin = async (opts: { gameType: string; module: SocketGameModule | null }) => {
    getGameMock.mockResolvedValue({
      roomCode: "ABC123",
      playerCount: 2,
      gameType: opts.gameType,
    })
    resolveGameModuleMock.mockReturnValue(opts.module)

    const { registerSocketHandlers } = await import("./index")
    const io = createFakeIo()
    const socket = createFakeSocket("sock-1")
    registerSocketHandlers(io as any)
    io.connect(socket)
    await socket.trigger("join-room", { roomCode: "ABC123", playerId: "p1" })
    return { io, socket }
  }

  it("rejects game-action for unknown gameType", async () => {
    const { socket } = await registerAndJoin({
      gameType: "unknown-game",
      module: null,
    })
    socket.emit.mockClear()

    await socket.trigger("game-action", { type: "flip-stock" })

    expect(socket.emit).toHaveBeenCalledWith("error", {
      message: "Unsupported game type: unknown-game",
    })
    expect(updateGameStateMock).not.toHaveBeenCalled()
  })

  it("rejects invalid join-room payload at ingress", async () => {
    const { registerSocketHandlers } = await import("./index")
    const io = createFakeIo()
    const socket = createFakeSocket("sock-invalid")
    registerSocketHandlers(io as any)
    io.connect(socket)

    await socket.trigger("join-room", { roomCode: "BAD", playerId: "" })

    expect(socket.emit).toHaveBeenCalledWith("error", {
      message: "Invalid join-room payload",
    })
    expect(getGameMock).not.toHaveBeenCalled()
  })

  it("routes emitted envelopes to actor / others / room targets", async () => {
    const module: SocketGameModule = {
      gameType: "nertz",
      handleGameAction: () => ({
        emits: [
          { target: "actor", event: "actor-event", payload: { a: 1 } },
          { target: "others", event: "others-event", payload: { b: 2 } },
          { target: "room", event: "room-event", payload: { c: 3 } },
        ],
      }),
    }
    const { io, socket } = await registerAndJoin({ gameType: "nertz", module })
    socket.emit.mockClear()
    socket.to.mockClear()
    socket.toEmit.mockClear()
    io.to.mockClear()
    io.roomEmit.mockClear()

    await socket.trigger("game-action", { type: "any-action" })

    expect(socket.emit).toHaveBeenCalledWith("actor-event", { a: 1 })
    expect(socket.to).toHaveBeenCalledWith("ABC123")
    expect(socket.toEmit).toHaveBeenCalledWith("others-event", { b: 2 })
    expect(io.to).toHaveBeenCalledWith("ABC123")
    expect(io.roomEmit).toHaveBeenCalledWith("room-event", { c: 3 })
  })

  it("does not persist state when module returns no nextState", async () => {
    const module: SocketGameModule = {
      gameType: "nertz",
      handleGameAction: () => ({ emits: [] }),
    }
    const { socket } = await registerAndJoin({ gameType: "nertz", module })

    await socket.trigger("game-action", { type: "any-action" })

    expect(updateGameStateMock).not.toHaveBeenCalled()
  })

  it("persists state only when module returns nextState", async () => {
    const nextState = { foo: "bar" }
    const module: SocketGameModule = {
      gameType: "nertz",
      handleGameAction: () => ({ emits: [], nextState }),
    }
    const { socket } = await registerAndJoin({ gameType: "nertz", module })

    await socket.trigger("game-action", { type: "any-action" })

    expect(updateGameStateMock).toHaveBeenCalledTimes(1)
    expect(updateGameStateMock).toHaveBeenCalledWith("ABC123", "nertz", nextState)
  })

  it("rejects invalid game-action payload using module schema", async () => {
    const handleGameAction = vi.fn(() => ({ emits: [] }))
    const module: SocketGameModule = {
      gameType: "nertz",
      gameActionSchema: z.object({ type: z.literal("valid-action") }),
      handleGameAction,
    }
    const { socket } = await registerAndJoin({ gameType: "nertz", module })
    socket.emit.mockClear()

    await socket.trigger("game-action", { type: "wrong-action" })

    expect(socket.emit).toHaveBeenCalledWith("error", {
      message: "Invalid game-action payload for game type: nertz",
    })
    expect(handleGameAction).not.toHaveBeenCalled()
    expect(updateGameStateMock).not.toHaveBeenCalled()
  })

  it("rejects invalid set-state payload using module schema", async () => {
    const handleSetState = vi.fn(() => ({ emits: [] }))
    const module: SocketGameModule = {
      gameType: "nertz",
      handleGameAction: () => ({ emits: [] }),
      handleSetState,
      setStateSchema: z.object({
        positions: z.record(z.string(), z.object({ x: z.number(), z: z.number() })),
      }),
    }
    const { socket } = await registerAndJoin({ gameType: "nertz", module })
    socket.emit.mockClear()

    await socket.trigger("set-state", { invalid: true })

    expect(socket.emit).toHaveBeenCalledWith("error", {
      message: "Invalid set-state payload for game type: nertz",
    })
    expect(handleSetState).not.toHaveBeenCalled()
    expect(updateGameStateMock).not.toHaveBeenCalled()
  })

  it("sanitizes unexpected join-room persistence failures", async () => {
    getGameMock.mockRejectedValueOnce(new Error("dynamodb access denied"))

    const { registerSocketHandlers } = await import("./index")
    const io = createFakeIo()
    const socket = createFakeSocket("sock-internal")
    registerSocketHandlers(io as any)
    io.connect(socket)

    await socket.trigger("join-room", { roomCode: "ABC123", playerId: "p1" })

    expect(socket.emit).toHaveBeenCalledWith("error", {
      message: "Something went wrong. Please try again.",
    })
  })
})
