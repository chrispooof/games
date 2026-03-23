import { describe, expect, it } from "vitest"
import { nertzSocketModule } from "./nertz"
import type { NertzGameState } from "../logic/nertz"

const makeState = (): NertzGameState => ({
  numPlayers: 2,
  cardPositions: {},
  foundations: Array.from({ length: 8 }, (_, i) => ({ slotIndex: i, suit: null, topValue: 0 })),
  players: [
    {
      playerId: "p0",
      playerIndex: 0,
      nertzPile: ["p0_Card_A_hearts"],
      workPiles: [[], [], [], []],
      stock: ["p0_Card_2_hearts", "p0_Card_3_hearts"],
      waste: [],
    },
  ],
  phase: "playing",
  winnerId: null,
})

describe("nertz socket module", () => {
  it("adds nertz counts/tops to room-state extras", () => {
    const extras = nertzSocketModule.buildRoomStateExtras?.({ gameState: makeState() as unknown as Record<string, unknown> })
    expect(extras).toEqual({
      nertzCounts: { p0: 1 },
      nertzTops: { p0: "p0_Card_A_hearts" },
    })
  })

  it("returns illegal-move for invalid action payload", () => {
    const out = nertzSocketModule.handleGameAction({
      action: null,
      playerId: "p0",
      roomCode: "ABC123",
      gameState: makeState() as unknown as Record<string, unknown>,
    })
    expect(out.nextState).toBeUndefined()
    expect(out.emits).toHaveLength(1)
    expect(out.emits[0]).toEqual({
      target: "actor",
      event: "action-result",
      payload: { ok: false, cardId: "", reason: "illegal-move" },
    })
  })

  it("handles legacy move-card by updating state and broadcasting game-action", () => {
    const out = nertzSocketModule.handleGameAction({
      action: { type: "move-card", cardId: "p0_Card_2_hearts", position: { x: 1, z: 2 } },
      playerId: "p0",
      roomCode: "ABC123",
      gameState: {},
    })
    expect(out.emits).toEqual([
      {
        target: "others",
        event: "game-action",
        payload: { type: "move-card", cardId: "p0_Card_2_hearts", position: { x: 1, z: 2 } },
      },
    ])
    expect(out.nextState).toEqual({
      cardPositions: { p0_Card_2_hearts: { x: 1, z: 2 } },
    })
  })

  it("flips stock and broadcasts game-state-update delta", () => {
    const state = makeState()
    const out = nertzSocketModule.handleGameAction({
      action: { type: "flip-stock" },
      playerId: "p0",
      roomCode: "ABC123",
      gameState: state as unknown as Record<string, unknown>,
    })
    expect(out.nextState).toBeDefined()
    expect(out.emits[0].target).toBe("actor")
    expect(out.emits[0].event).toBe("action-result")
    expect(out.emits[1].target).toBe("others")
    expect(out.emits[1].event).toBe("game-state-update")
  })

  it("rejects invalid set-state payload", () => {
    const out = nertzSocketModule.handleSetState?.({
      payload: { invalid: true },
      playerId: "p0",
      numPlayers: 2,
      players: [{ playerId: "p0", socketId: "s0", joinedAt: "2026-01-01T00:00:00.000Z" }],
      gameState: null,
    })
    expect(out).toBeDefined()
    expect(out?.nextState).toBeUndefined()
    expect(out?.emits).toEqual([
      { target: "actor", event: "error", payload: { message: "Invalid set-state payload" } },
    ])
  })
})
