import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

const { gameInstance, NertzGameMock, socketMock, triggerSocket, clearSocketHandlers } = vi.hoisted(
  () => {
    const gameInstance = {
      setPlayerIds: vi.fn(),
      updateOpponentCounts: vi.fn(),
      addPlayer: vi.fn(),
      applyRemoteAction: vi.fn(),
      applyActionResult: vi.fn(),
      applyState: vi.fn(),
      applyLocalPileState: vi.fn(),
      flipStock: vi.fn(),
      destroy: vi.fn(),
    }

    const NertzGameMock = vi.fn(function MockNertzGame() {
      return gameInstance
    })
    type Handler = (payload?: unknown) => void
    const handlers = new Map<string, Set<Handler>>()

    const socketMock = {
      on: vi.fn((event: string, cb: Handler) => {
        const set = handlers.get(event) ?? new Set<Handler>()
        set.add(cb)
        handlers.set(event, set)
      }),
      off: vi.fn((event: string, cb: Handler) => {
        handlers.get(event)?.delete(cb)
      }),
      emit: vi.fn(),
    }

    const triggerSocket = (event: string, payload?: unknown) => {
      for (const cb of handlers.get(event) ?? []) cb(payload)
    }

    const clearSocketHandlers = () => handlers.clear()

    return { gameInstance, NertzGameMock, socketMock, triggerSocket, clearSocketHandlers }
  }
)

vi.mock("~/games", () => ({
  NertzGame: NertzGameMock,
}))

vi.mock("~/lib/socket", () => ({
  socket: socketMock,
}))

vi.mock("~/lib/player-id", () => ({
  getPlayerId: () => "local-1",
}))

vi.mock("~/lib/username", () => ({
  getUsername: () => "SillyBadger",
  setUsername: vi.fn(),
  generateSillyUsername: () => "SillyBadger",
}))

type HostCallback = (
  playerCount: number,
  roomCode: string,
  initialPlayers: Array<{ playerId: string }>,
  gameState: {
    cardPositions?: Record<string, { x: number; z: number }>
    nertzCounts?: Record<string, number>
    nertzTops?: Record<string, string | null>
  } | null,
  maxPlayers: number
) => void

vi.mock("~/screens/nertz/welcome", () => ({
  default: ({ onHost }: { onHost: HostCallback }) => (
    <button
      onClick={() => onHost(2, "ABC123", [{ playerId: "local-1" }, { playerId: "p2" }], null, 2)}
    >
      Host
    </button>
  ),
}))

describe("Nertz reconnect path", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearSocketHandlers()
  })

  it("rejoins, restores room-state, rehydrates local piles, and resumes action handling", async () => {
    const { default: NertzRoute } = await import("./nertz")
    render(<NertzRoute />)

    fireEvent.click(screen.getByRole("button", { name: "Host" }))
    expect(NertzGameMock).toHaveBeenCalledTimes(1)

    // Simulate transport reconnect. Route should re-join using stable player ID.
    triggerSocket("connect")
    expect(socketMock.emit).toHaveBeenCalledWith("join-room", {
      roomCode: "ABC123",
      playerId: "local-1",
      username: "SillyBadger",
    })

    const localPileState = {
      nertzPile: ["p0_Card_2_clubs", "p0_Card_A_hearts"],
      workPiles: [["p0_Card_5_spades"], ["p0_Card_7_diamonds"], [], ["p0_Card_9_clubs"]] as [
        string[],
        string[],
        string[],
        string[],
      ],
      stock: ["p0_Card_10_hearts"],
      waste: ["p0_Card_3_spades"],
    }

    triggerSocket("room-state", {
      gameState: {
        cardPositions: { p0_Card_A_hearts: { x: 1, z: 2 } },
        players: [{ playerId: "local-1", ...localPileState }],
      },
      nertzCounts: { "local-1": 2, p2: 10 },
      nertzTops: { "local-1": "p0_Card_A_hearts", p2: "p1_Card_K_spades" },
    })

    expect(gameInstance.applyState).toHaveBeenCalledWith({ p0_Card_A_hearts: { x: 1, z: 2 } })
    expect(gameInstance.applyLocalPileState).toHaveBeenCalledWith(localPileState)
    expect(gameInstance.updateOpponentCounts).toHaveBeenCalledWith(
      { "local-1": 2, p2: 10 },
      { "local-1": "p0_Card_A_hearts", p2: "p1_Card_K_spades" }
    )

    // A successful action-result after rehydrate verifies the playable action path is live.
    triggerSocket("action-result", { ok: true, cardId: "p0_Card_A_hearts" })
    expect(gameInstance.applyActionResult).toHaveBeenCalledWith({
      ok: true,
      cardId: "p0_Card_A_hearts",
    })
  })
})
