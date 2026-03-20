import { computeFoundationSlots, computeSeat, computeDealPiles } from "./geometry"

export type Suit = "clubs" | "diamonds" | "hearts" | "spades"

/** State of a single foundation slot */
export interface FoundationState {
  slotIndex: number
  suit: Suit | null
  /** 0 = empty, 1 = Ace, …, 13 = King */
  topValue: number
}

/** Complete pile state for a single player */
export interface PlayerPileState {
  playerId: string
  playerIndex: number
  /** cardIds ordered bottom-to-top; last element is the top (playable) card */
  nertzPile: string[]
  workPiles: [string[], string[], string[], string[]]
  /** cardIds ordered bottom-to-top */
  stock: string[]
  waste: string[]
}

/** Full server-side game state for a Nertz session */
export interface NertzGameState {
  numPlayers: number
  cardPositions: Record<string, { x: number; z: number }>
  /** numPlayers * 4 foundation slots */
  foundations: FoundationState[]
  players: PlayerPileState[]
  phase: "dealing" | "playing" | "finished"
  winnerId: string | null
}

/** Pile data sent by the client after the deal animation completes */
export interface InitialPileData {
  nertzPile: string[]
  workPiles: [string[], string[], string[], string[]]
  stock: string[]
  waste: string[]
}

/** Actions a player can take (mirrored from ui/app/games/nertz/src/types/actions.ts) */
export type GameAction =
  | {
      type: "play-to-foundation"
      cardId: string
      slotIndex: number
      source: "nertz" | "work" | "waste"
      sourceIndex?: number
    }
  | {
      type: "play-to-work-pile"
      cardId: string
      targetPileIndex: number
      source: "nertz" | "work" | "waste"
      sourceIndex?: number
    }
  | { type: "flip-stock" }
  | { type: "move-card"; cardId: string; position: { x: number; z: number } }

/** Response sent back to the acting socket only */
export type ActionResult =
  | { ok: true; cardId: string }
  | { ok: false; cardId: string; reason: "illegal-move" | "foundation-conflict" | "not-your-pile" }

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const rankToValue: Record<string, number> = {
  A: 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
}

interface CardIdentity {
  playerIndex: number
  suit: Suit
  value: number
}

/**
 * Parses a card ID of the form "p{n}_Card_{rank}_{suit}" into its identity components.
 * Returns null if the format is unrecognised.
 */
const parseCardId = (cardId: string): CardIdentity | null => {
  const match = cardId.match(/^p(\d+)_Card_(.+)_(\w+)$/)
  if (!match) return null
  const playerIndex = parseInt(match[1])
  const rank = match[2]
  const suit = match[3] as Suit
  const value = rankToValue[rank]
  if (!value) return null
  return { playerIndex, suit, value }
}

/** True for red suits (hearts, diamonds) */
const isRed = (suit: Suit): boolean => suit === "hearts" || suit === "diamonds"

/**
 * Returns the source pile array for the given source descriptor.
 * Returns null if the descriptor is invalid.
 */
const getSourcePile = (
  playerState: PlayerPileState,
  source: "nertz" | "work" | "waste",
  sourceIndex: number | undefined,
): string[] | null => {
  if (source === "nertz") return playerState.nertzPile
  if (source === "waste") return playerState.waste
  if (source === "work" && sourceIndex !== undefined)
    return playerState.workPiles[sourceIndex] ?? null
  return null
}

/** Pops the top card from the specified source pile (mutates playerState) */
const popFromPile = (
  playerState: PlayerPileState,
  source: "nertz" | "work" | "waste",
  sourceIndex: number | undefined,
): void => {
  if (source === "nertz") {
    playerState.nertzPile.pop()
  } else if (source === "waste") {
    playerState.waste.pop()
  } else if (source === "work" && sourceIndex !== undefined) {
    playerState.workPiles[sourceIndex].pop()
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates a play-to-foundation action.
 * Returns null on success or a rejection reason.
 */
const validateFoundationPlay = (
  action: Extract<GameAction, { type: "play-to-foundation" }>,
  playerState: PlayerPileState,
  state: NertzGameState,
): "illegal-move" | "foundation-conflict" | null => {
  const { cardId, slotIndex, source, sourceIndex } = action
  const identity = parseCardId(cardId)
  if (!identity) return "illegal-move"

  // Card must be the top of the stated source pile
  const sourcePile = getSourcePile(playerState, source, sourceIndex)
  if (!sourcePile || sourcePile[sourcePile.length - 1] !== cardId) return "illegal-move"

  const foundation = state.foundations[slotIndex]
  if (!foundation) return "illegal-move"

  if (foundation.topValue === 0) {
    // Empty slot — only Ace is allowed
    if (identity.value !== 1) return "illegal-move"
  } else {
    // Occupied slot — must be same suit and the next rank
    if (foundation.suit !== identity.suit) return "foundation-conflict"
    if (identity.value !== foundation.topValue + 1) return "illegal-move"
  }

  return null
}

/**
 * Validates a play-to-work-pile action.
 * Returns null on success or a rejection reason.
 */
const validateWorkPilePlay = (
  action: Extract<GameAction, { type: "play-to-work-pile" }>,
  playerState: PlayerPileState,
): "illegal-move" | "not-your-pile" | null => {
  const { cardId, targetPileIndex, source, sourceIndex } = action
  const identity = parseCardId(cardId)
  if (!identity) return "illegal-move"

  const sourcePile = getSourcePile(playerState, source, sourceIndex)
  if (!sourcePile || sourcePile[sourcePile.length - 1] !== cardId) return "illegal-move"

  const targetPile = playerState.workPiles[targetPileIndex]
  if (!targetPile) return "illegal-move"

  if (targetPile.length === 0) {
    // Any card may go on an empty work pile
    return null
  }

  const topCardId = targetPile[targetPile.length - 1]
  const topIdentity = parseCardId(topCardId)
  if (!topIdentity) return "illegal-move"

  // Must be one rank lower and alternate color
  if (identity.value !== topIdentity.value - 1) return "illegal-move"
  if (isRed(identity.suit) === isRed(topIdentity.suit)) return "illegal-move"

  return null
}

// ---------------------------------------------------------------------------
// State mutations
// ---------------------------------------------------------------------------

const applyFoundationPlay = (
  action: Extract<GameAction, { type: "play-to-foundation" }>,
  playerState: PlayerPileState,
  state: NertzGameState,
  slotPosition: { x: number; z: number },
): Partial<NertzGameState> => {
  const identity = parseCardId(action.cardId)!
  popFromPile(playerState, action.source, action.sourceIndex)

  const foundation = state.foundations[action.slotIndex]
  foundation.suit = identity.suit
  foundation.topValue = identity.value
  state.cardPositions[action.cardId] = slotPosition

  return {
    foundations: state.foundations,
    players: state.players,
    cardPositions: { [action.cardId]: slotPosition },
  }
}

const applyWorkPilePlay = (
  action: Extract<GameAction, { type: "play-to-work-pile" }>,
  playerState: PlayerPileState,
  state: NertzGameState,
  cardPosition: { x: number; z: number },
): Partial<NertzGameState> => {
  popFromPile(playerState, action.source, action.sourceIndex)
  playerState.workPiles[action.targetPileIndex].push(action.cardId)
  state.cardPositions[action.cardId] = cardPosition

  return {
    players: state.players,
    cardPositions: { [action.cardId]: cardPosition },
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Processes a typed game action for the given player.
 *
 * Node.js's single-threaded event loop serialises concurrent socket events,
 * making this the authoritative arbiter for foundation race conditions:
 * whichever player's event arrives first wins the slot.
 *
 * @param resolvedPosition - For foundation plays: the canonical slot position
 *   computed by the server. For work pile plays: the target pile position.
 * @returns The result to emit to the acting socket, an optional state delta
 *   to broadcast to the room, and whether the game is now over.
 */
export const processAction = (
  action: GameAction,
  playerId: string,
  state: NertzGameState,
  resolvedPosition: { x: number; z: number },
): {
  result: ActionResult
  gameStateUpdate?: Partial<NertzGameState>
  isGameOver: boolean
} => {
  if (action.type === "flip-stock" || action.type === "move-card") {
    return { result: { ok: false, cardId: "", reason: "illegal-move" }, isGameOver: false }
  }

  const playerState = state.players.find((p) => p.playerId === playerId)
  if (!playerState) {
    return {
      result: { ok: false, cardId: action.cardId, reason: "not-your-pile" },
      isGameOver: false,
    }
  }

  if (action.type === "play-to-foundation") {
    const error = validateFoundationPlay(action, playerState, state)
    if (error) {
      return { result: { ok: false, cardId: action.cardId, reason: error }, isGameOver: false }
    }
    const delta = applyFoundationPlay(action, playerState, state, resolvedPosition)
    const isGameOver = playerState.nertzPile.length === 0
    if (isGameOver) {
      state.phase = "finished"
      state.winnerId = playerId
    }
    return { result: { ok: true, cardId: action.cardId }, gameStateUpdate: delta, isGameOver }
  }

  if (action.type === "play-to-work-pile") {
    const error = validateWorkPilePlay(action, playerState)
    if (error) {
      return { result: { ok: false, cardId: action.cardId, reason: error }, isGameOver: false }
    }
    const delta = applyWorkPilePlay(action, playerState, state, resolvedPosition)
    return { result: { ok: true, cardId: action.cardId }, gameStateUpdate: delta, isGameOver: false }
  }

  return { result: { ok: false, cardId: "unknown", reason: "illegal-move" }, isGameOver: false }
}

/**
 * Creates or updates the server-side NertzGameState when a player sends their
 * initial pile layout via `set-state`.
 */
export const createOrMergeGameState = (
  playerId: string,
  playerIndex: number,
  numPlayers: number,
  positions: Record<string, { x: number; z: number }>,
  pileData: InitialPileData,
  existing: NertzGameState | null,
): NertzGameState => {
  const playerState: PlayerPileState = {
    playerId,
    playerIndex,
    nertzPile: pileData.nertzPile,
    workPiles: pileData.workPiles,
    stock: pileData.stock,
    waste: pileData.waste,
  }

  if (!existing) {
    const foundations: FoundationState[] = Array.from({ length: numPlayers * 4 }, (_, i) => ({
      slotIndex: i,
      suit: null,
      topValue: 0,
    }))
    return {
      numPlayers,
      cardPositions: positions,
      foundations,
      players: [playerState],
      phase: "playing",
      winnerId: null,
    }
  }

  // Merge this player's pile state into the existing game state
  const idx = existing.players.findIndex((p) => p.playerId === playerId)
  if (idx >= 0) {
    existing.players[idx] = playerState
  } else {
    existing.players.push(playerState)
  }
  existing.cardPositions = { ...existing.cardPositions, ...positions }
  return existing
}

/**
 * Resolves the canonical world-space position for a foundation slot by index.
 * The server uses this to compute snap positions without trusting client coordinates.
 */
export const getFoundationSlotPosition = (
  slotIndex: number,
  numPlayers: number,
): { x: number; z: number } | null => {
  const slots = computeFoundationSlots(numPlayers)
  return slots[slotIndex] ?? null
}

// Game constants matching ui/app/games/nertz/src/utils/constants.ts
const SEAT_RADIUS = 6.5
const PILE_OFFSET = 1

/**
 * Flips up to 3 cards from the player's stock pile to their waste pile.
 * If the stock pile is empty, cycles the waste pile back to stock (face-down).
 *
 * @returns The result to emit to the acting socket and a state delta to broadcast.
 *   `result.cardId` is the ID of the new top waste card (used by the client to flip it face-up),
 *   or an empty string when waste is cycled back.
 */
export const processFlipStock = (
  playerId: string,
  state: NertzGameState,
): {
  result: ActionResult
  gameStateUpdate?: Partial<NertzGameState>
} => {
  const playerState = state.players.find((p) => p.playerId === playerId)
  if (!playerState) {
    return { result: { ok: false, cardId: "", reason: "not-your-pile" } }
  }

  const seat = computeSeat(playerState.playerIndex, state.numPlayers, SEAT_RADIUS)
  const piles = computeDealPiles(seat, SEAT_RADIUS, PILE_OFFSET)
  // piles[5] = waste position, piles[6] = stock position
  const wastePos = piles[5]
  const stockPos = piles[6]

  const cardPositionsDelta: Record<string, { x: number; z: number }> = {}

  if (playerState.stock.length === 0) {
    // Stock exhausted — cycle waste back to stock (reversed, face-down)
    if (playerState.waste.length === 0) {
      return { result: { ok: false, cardId: "", reason: "illegal-move" } }
    }
    const recycled = [...playerState.waste].reverse()
    playerState.stock = recycled
    playerState.waste = []
    for (const cardId of recycled) {
      state.cardPositions[cardId] = stockPos
      cardPositionsDelta[cardId] = stockPos
    }
    return {
      result: { ok: true, cardId: "" },
      gameStateUpdate: { players: state.players, cardPositions: cardPositionsDelta },
    }
  }

  // Pop up to 3 cards from the top of stock, push to waste
  const count = Math.min(3, playerState.stock.length)
  const flipped = playerState.stock.splice(-count)
  playerState.waste.push(...flipped)

  for (const cardId of flipped) {
    state.cardPositions[cardId] = wastePos
    cardPositionsDelta[cardId] = wastePos
  }

  const topWasteCardId = playerState.waste[playerState.waste.length - 1]

  return {
    result: { ok: true, cardId: topWasteCardId },
    gameStateUpdate: { players: state.players, cardPositions: cardPositionsDelta },
  }
}
