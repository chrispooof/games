import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const {
  gameBuildMock,
  playerBuildMock,
  gameStateBuildMock,
  tableBuildMock,
  gameItemMock,
  gameKeyMock,
  gameSendMock,
  playerItemMock,
  playerKeyMock,
  playerSendMock,
  gameStateItemMock,
  gameStateKeyMock,
  gameStateSendMock,
  tableEntitiesMock,
  tableQueryMock,
  tableSendMock,
} = vi.hoisted(() => ({
  gameBuildMock: vi.fn(),
  playerBuildMock: vi.fn(),
  gameStateBuildMock: vi.fn(),
  tableBuildMock: vi.fn(),
  gameItemMock: vi.fn(),
  gameKeyMock: vi.fn(),
  gameSendMock: vi.fn(),
  playerItemMock: vi.fn(),
  playerKeyMock: vi.fn(),
  playerSendMock: vi.fn(),
  gameStateItemMock: vi.fn(),
  gameStateKeyMock: vi.fn(),
  gameStateSendMock: vi.fn(),
  tableEntitiesMock: vi.fn(),
  tableQueryMock: vi.fn(),
  tableSendMock: vi.fn(),
}))

vi.mock("./table", () => ({
  GameEntity: { build: gameBuildMock },
  PlayerEntity: { build: playerBuildMock },
  GameStateEntity: { build: gameStateBuildMock },
  CardGamesTable: { build: tableBuildMock },
}))

describe("db/game-store", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-02T03:04:05.000Z"))

    vi.clearAllMocks()

    gameBuildMock.mockImplementation(() => {
      const builder = {
        item: (payload: unknown) => {
          gameItemMock(payload)
          return builder
        },
        key: (payload: unknown) => {
          gameKeyMock(payload)
          return builder
        },
        send: gameSendMock,
      }
      return builder
    })

    playerBuildMock.mockImplementation(() => {
      const builder = {
        item: (payload: unknown) => {
          playerItemMock(payload)
          return builder
        },
        key: (payload: unknown) => {
          playerKeyMock(payload)
          return builder
        },
        send: playerSendMock,
      }
      return builder
    })

    gameStateBuildMock.mockImplementation(() => {
      const builder = {
        item: (payload: unknown) => {
          gameStateItemMock(payload)
          return builder
        },
        key: (payload: unknown) => {
          gameStateKeyMock(payload)
          return builder
        },
        send: gameStateSendMock,
      }
      return builder
    })

    tableBuildMock.mockImplementation(() => {
      const builder = {
        entities: (payload: unknown) => {
          tableEntitiesMock(payload)
          return builder
        },
        query: (payload: unknown) => {
          tableQueryMock(payload)
          return builder
        },
        send: tableSendMock,
      }
      return builder
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("createGame writes metadata and returns default waiting status", async () => {
    const { createGame } = await import("./game-store")
    gameSendMock.mockResolvedValueOnce({})
    const expectedTtl = Math.floor(Date.now() / 1000) + 86400

    const out = await createGame({ roomCode: "ABC123", gameType: "nertz", playerCount: 4 })

    expect(gameBuildMock).toHaveBeenCalledTimes(1)
    expect(gameItemMock).toHaveBeenCalledWith({
      PK: "GAME#ABC123",
      SK: "METADATA",
      roomCode: "ABC123",
      gameType: "nertz",
      playerCount: 4,
      status: "waiting",
      ttl: expectedTtl,
    })
    expect(out).toEqual({
      roomCode: "ABC123",
      gameType: "nertz",
      playerCount: 4,
      status: "waiting",
      createdAt: "2026-01-02T03:04:05.000Z",
      updatedAt: "2026-01-02T03:04:05.000Z",
      ttl: expectedTtl,
    })
  })

  it("getGame returns null when record is missing", async () => {
    const { getGame } = await import("./game-store")
    gameSendMock.mockResolvedValueOnce({ Item: undefined })

    const out = await getGame("ROOM42")

    expect(gameKeyMock).toHaveBeenCalledWith({ PK: "GAME#ROOM42", SK: "METADATA" })
    expect(out).toBeNull()
  })

  it("getGame returns metadata when present", async () => {
    const { getGame } = await import("./game-store")
    gameSendMock.mockResolvedValueOnce({
      Item: {
        roomCode: "ROOM42",
        gameType: "nertz",
        playerCount: 3,
        status: "waiting",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        ttl: 123,
      },
    })

    const out = await getGame("ROOM42")

    expect(out?.roomCode).toBe("ROOM42")
    expect(out?.playerCount).toBe(3)
  })

  it("addPlayer writes player record with ttl", async () => {
    const { addPlayer } = await import("./game-store")
    playerSendMock.mockResolvedValueOnce({})
    const expectedTtl = Math.floor(Date.now() / 1000) + 86400

    await addPlayer("ABCD12", "player-1", "socket-1")

    expect(playerItemMock).toHaveBeenCalledWith({
      PK: "GAME#ABCD12",
      SK: "PLAYER#player-1",
      playerId: "player-1",
      socketId: "socket-1",
      ttl: expectedTtl,
    })
  })

  it("removePlayer deletes the player key", async () => {
    const { removePlayer } = await import("./game-store")
    playerSendMock.mockResolvedValueOnce({})

    await removePlayer("ABCD12", "player-1")

    expect(playerKeyMock).toHaveBeenCalledWith({
      PK: "GAME#ABCD12",
      SK: "PLAYER#player-1",
    })
  })

  it("updateGameState writes opaque state blob", async () => {
    const { updateGameState } = await import("./game-store")
    gameStateSendMock.mockResolvedValueOnce({})
    const expectedTtl = Math.floor(Date.now() / 1000) + 86400

    await updateGameState("ROOM42", "nertz", { foo: "bar" })

    expect(gameStateItemMock).toHaveBeenCalledWith({
      PK: "GAME#ROOM42",
      SK: "STATE",
      gameType: "nertz",
      state: { foo: "bar" },
      ttl: expectedTtl,
    })
  })

  it("getGameState returns null when missing", async () => {
    const { getGameState } = await import("./game-store")
    gameStateSendMock.mockResolvedValueOnce({ Item: undefined })

    const out = await getGameState("ROOM42")

    expect(gameStateKeyMock).toHaveBeenCalledWith({ PK: "GAME#ROOM42", SK: "STATE" })
    expect(out).toBeNull()
  })

  it("getGameState returns saved state", async () => {
    const { getGameState } = await import("./game-store")
    gameStateSendMock.mockResolvedValueOnce({
      Item: { gameType: "nertz", state: { phase: "playing" } },
    })

    const out = await getGameState("ROOM42")

    expect(out).toEqual({ gameType: "nertz", state: { phase: "playing" } })
  })

  it("getPlayers queries player range and returns items", async () => {
    const { getPlayers } = await import("./game-store")
    tableSendMock.mockResolvedValueOnce({
      Items: [{ playerId: "p1", socketId: "s1", joinedAt: "2026-01-01T00:00:00.000Z" }],
    })

    const out = await getPlayers("ROOM42")

    expect(tableEntitiesMock).toHaveBeenCalledTimes(1)
    expect(tableQueryMock).toHaveBeenCalledWith({
      partition: "GAME#ROOM42",
      range: { beginsWith: "PLAYER#" },
    })
    expect(out).toHaveLength(1)
    expect(out[0].playerId).toBe("p1")
  })

  it("updatePlayerSocket updates socket id on existing player", async () => {
    const { updatePlayerSocket } = await import("./game-store")
    playerSendMock.mockResolvedValueOnce({})

    await updatePlayerSocket("ROOM42", "player-1", "socket-2")

    expect(playerItemMock).toHaveBeenCalledWith({
      PK: "GAME#ROOM42",
      SK: "PLAYER#player-1",
      socketId: "socket-2",
    })
  })
})
