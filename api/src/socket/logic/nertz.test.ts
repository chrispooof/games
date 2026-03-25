import { expect, test } from "vitest"
import {
  createOrMergeGameState,
  getFoundationSlotPosition,
  processAction,
  processCallNertz,
  processFlipStock,
  processStartGame,
  type InitialPileData,
  type NertzGameState,
  type PlayerPileState,
} from "./nertz"

const makePileData = (): InitialPileData => ({
  nertzPile: [],
  workPiles: [[], [], [], []],
  stock: [],
  waste: [],
})

const makePlayer = (playerId: string, playerIndex: number): PlayerPileState => ({
  playerId,
  playerIndex,
  nertzPile: [],
  workPiles: [[], [], [], []],
  stock: [],
  waste: [],
})

const makeState = (players: PlayerPileState[], numPlayers = 2): NertzGameState => ({
  numPlayers,
  cardPositions: {},
  foundations: Array.from({ length: numPlayers * 4 }, (_, i) => ({
    slotIndex: i,
    suit: null,
    topValue: 0,
  })),
  players,
  phase: "playing",
  winnerId: null,
  startedAt: null,
  foundationContributions: Object.fromEntries(players.map((p) => [p.playerId, 0])),
})

test("createOrMergeGameState creates a new state with foundations", () => {
  const positions = { p0_Card_A_hearts: { x: 1, z: 2 } }
  const pileData: InitialPileData = {
    nertzPile: ["p0_Card_A_hearts"],
    workPiles: [[], [], [], []],
    stock: [],
    waste: [],
  }

  const state = createOrMergeGameState("p0", 0, 4, positions, pileData, null)
  expect(state.numPlayers).toBe(4)
  expect(state.foundations).toHaveLength(16)
  expect(state.players).toHaveLength(1)
  expect(state.players[0].playerId).toBe("p0")
  expect(state.phase).toBe("waiting")
  expect(state.cardPositions).toEqual(positions)
})

test("createOrMergeGameState merges player data into existing state", () => {
  const existing = makeState([makePlayer("p0", 0)], 2)
  existing.cardPositions = { p0_Card_A_hearts: { x: 0, z: 0 } }

  const merged = createOrMergeGameState(
    "p1",
    1,
    2,
    { p1_Card_A_clubs: { x: 3, z: 4 } },
    makePileData(),
    existing,
  )

  expect(merged.players).toHaveLength(2)
  expect(merged.players.some((p) => p.playerId === "p1")).toBe(true)
  expect(merged.cardPositions.p1_Card_A_clubs).toEqual({ x: 3, z: 4 })
  expect(merged.cardPositions.p0_Card_A_hearts).toEqual({ x: 0, z: 0 })
})

test("getFoundationSlotPosition returns null for out-of-range slot", () => {
  expect(getFoundationSlotPosition(999, 2)).toBeNull()
})

test("processFlipStock rejects unknown player", () => {
  const state = makeState([makePlayer("p0", 0)], 2)
  const { result } = processFlipStock("missing", state)
  expect(result.ok).toBe(false)
  if (!result.ok) {
    expect(result.reason).toBe("not-your-pile")
  }
})

test("processFlipStock flips up to three cards from stock to waste", () => {
  const p0 = makePlayer("p0", 0)
  p0.stock = ["p0_Card_2_clubs", "p0_Card_3_clubs", "p0_Card_4_clubs", "p0_Card_5_clubs"]
  const state = makeState([p0], 2)

  const { result, gameStateUpdate } = processFlipStock("p0", state)
  expect(result.ok).toBe(true)
  if (result.ok) {
    expect(result.cardId).toBe("p0_Card_5_clubs")
  }
  expect(p0.stock.length).toBe(1)
  expect(p0.waste).toEqual(["p0_Card_3_clubs", "p0_Card_4_clubs", "p0_Card_5_clubs"])
  expect(gameStateUpdate).toBeDefined()
  expect(Object.keys(gameStateUpdate?.cardPositions ?? {})).toHaveLength(3)
})

test("processFlipStock recycles waste into stock when stock is empty", () => {
  const p0 = makePlayer("p0", 0)
  p0.stock = []
  p0.waste = ["p0_Card_A_hearts", "p0_Card_2_hearts"]
  const state = makeState([p0], 2)

  const { result } = processFlipStock("p0", state)
  expect(result.ok).toBe(true)
  if (result.ok) {
    expect(result.cardId).toBe("")
  }
  expect(p0.stock).toEqual(["p0_Card_2_hearts", "p0_Card_A_hearts"])
  expect(p0.waste).toEqual([])
})

test("processAction applies valid foundation play — nertz pile empty does not auto-end game", () => {
  const p0 = makePlayer("p0", 0)
  p0.nertzPile = ["p0_Card_A_hearts"]
  const state = makeState([p0], 2)
  const action = {
    type: "play-to-foundation" as const,
    cardId: "p0_Card_A_hearts",
    slotIndex: 0,
    source: "nertz" as const,
  }

  const out = processAction(action, "p0", state, { x: 1, z: 1 })
  expect(out.result.ok).toBe(true)
  expect(out.isGameOver).toBe(false)
  expect(state.phase).toBe("playing") // game keeps running until player calls nertz
  expect(state.winnerId).toBeNull()
  expect(state.foundations[0].suit).toBe("hearts")
  expect(state.foundations[0].topValue).toBe(1)
  expect(p0.nertzPile.length).toBe(0)
})

test("processCallNertz ends the game when nertz pile is empty", () => {
  const p0 = makePlayer("p0", 0)
  p0.nertzPile = []
  const state = makeState([p0], 2)

  const result = processCallNertz("p0", state)
  expect(result.ok).toBe(true)
  expect(state.phase).toBe("finished")
  expect(state.winnerId).toBe("p0")
})

test("processCallNertz rejects when nertz pile is not empty", () => {
  const p0 = makePlayer("p0", 0)
  p0.nertzPile = ["p0_Card_A_hearts"]
  const state = makeState([p0], 2)

  const result = processCallNertz("p0", state)
  expect(result.ok).toBe(false)
  expect(state.phase).toBe("playing")
})

test("processStartGame transitions waiting → playing and records startedAt", () => {
  const p0 = makePlayer("p0", 0)
  const state = makeState([p0], 2)
  state.phase = "waiting"

  const result = processStartGame("p0", "p0", state)
  expect(result.ok).toBe(true)
  if (result.ok) expect(result.startedAt).toBeTruthy()
  expect(state.phase).toBe("playing")
})

test("processStartGame rejects non-host callers", () => {
  const p0 = makePlayer("p0", 0)
  const state = makeState([p0], 2)
  state.phase = "waiting"

  const result = processStartGame("p1", "p0", state)
  expect(result.ok).toBe(false)
  expect(state.phase).toBe("waiting")
})

test("processAction rejects foundation conflict when suit mismatches", () => {
  const p0 = makePlayer("p0", 0)
  p0.nertzPile = ["p0_Card_2_clubs"]
  const state = makeState([p0], 2)
  state.foundations[0] = { slotIndex: 0, suit: "hearts", topValue: 1 }

  const action = {
    type: "play-to-foundation" as const,
    cardId: "p0_Card_2_clubs",
    slotIndex: 0,
    source: "nertz" as const,
  }
  const out = processAction(action, "p0", state, { x: 0, z: 0 })
  expect(out.result.ok).toBe(false)
  if (!out.result.ok) {
    expect(out.result.reason).toBe("foundation-conflict")
  }
})

test("processAction applies valid work pile play onto top", () => {
  const p0 = makePlayer("p0", 0)
  p0.waste = ["p0_Card_6_clubs"]
  p0.workPiles[1] = ["p0_Card_7_hearts"]
  const state = makeState([p0], 2)

  const action = {
    type: "play-to-work-pile" as const,
    cardId: "p0_Card_6_clubs",
    targetPileIndex: 1,
    source: "waste" as const,
  }
  const out = processAction(action, "p0", state, { x: 0, z: 0 })
  expect(out.result.ok).toBe(true)
  expect(p0.workPiles[1]).toEqual(["p0_Card_7_hearts", "p0_Card_6_clubs"])
  expect(p0.waste).toEqual([])
})

test("createOrMergeGameState initializes foundationContributions to 0 for all players", () => {
  const pileData: InitialPileData = {
    nertzPile: [],
    workPiles: [[], [], [], []],
    stock: [],
    waste: [],
  }
  const state = createOrMergeGameState("p0", 0, 2, {}, pileData, null)
  expect(state.foundationContributions).toBeDefined()
  expect(state.foundationContributions["p0"]).toBe(0)

  const merged = createOrMergeGameState("p1", 1, 2, {}, makePileData(), state)
  expect(merged.foundationContributions["p0"]).toBe(0)
  expect(merged.foundationContributions["p1"]).toBe(0)
})

test("applyFoundationPlay increments the acting player's foundationContributions", () => {
  const p0 = makePlayer("p0", 0)
  p0.nertzPile = ["p0_Card_A_hearts"]
  const state = makeState([p0], 2)
  const action = {
    type: "play-to-foundation" as const,
    cardId: "p0_Card_A_hearts",
    slotIndex: 0,
    source: "nertz" as const,
  }

  const out = processAction(action, "p0", state, { x: 1, z: 1 })
  expect(out.result.ok).toBe(true)
  expect(state.foundationContributions["p0"]).toBe(1)
})

test("applyFoundationPlay does not change other players' foundationContributions", () => {
  const p0 = makePlayer("p0", 0)
  const p1 = makePlayer("p1", 1)
  p0.nertzPile = ["p0_Card_A_hearts"]
  const state = makeState([p0, p1], 2)
  const action = {
    type: "play-to-foundation" as const,
    cardId: "p0_Card_A_hearts",
    slotIndex: 0,
    source: "nertz" as const,
  }

  processAction(action, "p0", state, { x: 1, z: 1 })
  expect(state.foundationContributions["p1"]).toBe(0)
})

test("processAction rejects merge-work-piles when source equals target", () => {
  const p0 = makePlayer("p0", 0)
  p0.workPiles[0] = ["p0_Card_8_clubs"]
  const state = makeState([p0], 2)

  const action = {
    type: "merge-work-piles" as const,
    sourcePileIndex: 0,
    targetPileIndex: 0,
    cardId: "p0_Card_8_clubs",
  }
  const out = processAction(action, "p0", state, { x: 0, z: 0 })
  expect(out.result.ok).toBe(false)
  if (!out.result.ok) {
    expect(out.result.reason).toBe("illegal-move")
  }
})
