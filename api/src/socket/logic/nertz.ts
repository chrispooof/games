import { computeFoundationSlots, computeSeat, computeDealPiles } from "./geometry"
import {
  NERTZ_PILE_OFFSET,
  NERTZ_PILE_WORK_START,
  NERTZ_SEAT_RADIUS,
  NERTZ_WORK_PILE_FAN_OFFSET,
} from "../../utils/constants"
import type {
  ActionResult,
  FoundationState,
  GameAction,
  InitialPileData,
  NertzGameState,
  PlayerPileState,
  Suit,
} from "../../types/nertz"
export type {
  ActionResult,
  FoundationState,
  GameAction,
  InitialPileData,
  NertzGameState,
  PlayerPileState,
  Suit,
} from "../../types/nertz"

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
 * Returns true when two cards are adjacent in rank (±1) and alternate in color.
 * This is the connection rule for all work pile joins.
 */
const fitsAdjacent = (a: CardIdentity, b: CardIdentity): boolean =>
  Math.abs(a.value - b.value) === 1 && isRed(a.suit) !== isRed(b.suit)

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

  const topIdentity = parseCardId(targetPile[targetPile.length - 1])
  const bottomIdentity = parseCardId(targetPile[0])
  if (!topIdentity || !bottomIdentity) return "illegal-move"

  // Card may connect at either end of the target pile:
  //   - adjacent to the current top  → card appends on top (push)
  //   - adjacent to the current base → card inserts behind (unshift)
  if (fitsAdjacent(identity, topIdentity)) return null
  if (fitsAdjacent(identity, bottomIdentity)) return null

  return "illegal-move"
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
): Partial<NertzGameState> => {
  popFromPile(playerState, action.source, action.sourceIndex)

  const targetPile = playerState.workPiles[action.targetPileIndex]
  const newIdentity = parseCardId(action.cardId)
  const topIdentity = targetPile.length > 0 ? parseCardId(targetPile[targetPile.length - 1]) : null

  // New card ranks higher than the current pile top → it becomes the new base (unshift).
  // Lower-ranked card → appends at the tip (push).
  // Comparing against the top card works because the pile is always ordered highest-at-base.
  if (newIdentity && topIdentity && newIdentity.value > topIdentity.value) {
    targetPile.unshift(action.cardId)
  } else {
    targetPile.push(action.cardId)
  }

  // Compute fanned positions for ALL cards in the updated pile so remote clients
  // can render the full fan without needing separate pile state.
  // Fan direction: toward the player (positive radial direction).
  const seat = computeSeat(playerState.playerIndex, state.numPlayers, NERTZ_SEAT_RADIUS)
  const piles = computeDealPiles(seat, NERTZ_SEAT_RADIUS, NERTZ_PILE_OFFSET)
  const basePos = piles[NERTZ_PILE_WORK_START + action.targetPileIndex]
  const fanDirX = Math.sin(seat.angle)
  const fanDirZ = Math.cos(seat.angle)

  const cardPositionsDelta: Record<string, { x: number; z: number }> = {}
  for (const [i, cardId] of playerState.workPiles[action.targetPileIndex].entries()) {
    const pos = {
      x: basePos.x + i * NERTZ_WORK_PILE_FAN_OFFSET * fanDirX,
      z: basePos.z + i * NERTZ_WORK_PILE_FAN_OFFSET * fanDirZ,
    }
    state.cardPositions[cardId] = pos
    cardPositionsDelta[cardId] = pos
  }

  return {
    players: state.players,
    cardPositions: cardPositionsDelta,
  }
}

/**
 * Validates a merge-work-piles action (moving a card and everything above it
 * from one work pile to another).
 * The bottom card of the moved group must connect to the top of the target pile
 * with adjacent rank (±1) and alternating color.
 */
const validateMergeWorkPiles = (
  action: Extract<GameAction, { type: "merge-work-piles" }>,
  playerState: PlayerPileState,
): "illegal-move" | null => {
  if (action.sourcePileIndex === action.targetPileIndex) return "illegal-move"

  const sourcePile = playerState.workPiles[action.sourcePileIndex]
  const targetPile = playerState.workPiles[action.targetPileIndex]
  if (!sourcePile || !targetPile) return "illegal-move"

  const groupStart = sourcePile.indexOf(action.cardId)
  if (groupStart < 0) return "illegal-move"

  const bottomIdentity = parseCardId(action.cardId)
  if (!bottomIdentity) return "illegal-move"

  // Any group can go onto an empty target pile
  if (targetPile.length === 0) return null

  const targetTopIdentity = parseCardId(targetPile[targetPile.length - 1])
  const targetBottomIdentity = parseCardId(targetPile[0])
  if (!targetTopIdentity || !targetBottomIdentity) return "illegal-move"

  // The dragged group's bottom card connects to the target top → group appends on top
  if (fitsAdjacent(bottomIdentity, targetTopIdentity)) return null

  // The dragged group's top card connects to the target base → group inserts behind
  const groupTopCardId = sourcePile[sourcePile.length - 1]
  const groupTopIdentity = parseCardId(groupTopCardId)
  if (groupTopIdentity && fitsAdjacent(groupTopIdentity, targetBottomIdentity)) return null

  return "illegal-move"
}

const applyMergeWorkPiles = (
  action: Extract<GameAction, { type: "merge-work-piles" }>,
  playerState: PlayerPileState,
  state: NertzGameState,
): Partial<NertzGameState> => {
  const sourcePile = playerState.workPiles[action.sourcePileIndex]
  const targetPile = playerState.workPiles[action.targetPileIndex]

  const groupStart = sourcePile.indexOf(action.cardId)
  const group = sourcePile.splice(groupStart) // removes from source

  const bottomIdentity = parseCardId(action.cardId)
  const targetTopIdentity = targetPile.length > 0 ? parseCardId(targetPile[targetPile.length - 1]) : null

  // Group's bottom card ranks higher than the target's top → group goes behind (unshift).
  // Otherwise group appends on top of the target (push).
  if (bottomIdentity && targetTopIdentity && bottomIdentity.value > targetTopIdentity.value) {
    targetPile.unshift(...group)
  } else {
    targetPile.push(...group)
  }

  // Recompute fanned positions for all cards in the target pile
  const seat = computeSeat(playerState.playerIndex, state.numPlayers, NERTZ_SEAT_RADIUS)
  const piles = computeDealPiles(seat, NERTZ_SEAT_RADIUS, NERTZ_PILE_OFFSET)
  const basePos = piles[NERTZ_PILE_WORK_START + action.targetPileIndex]
  const fanDirX = Math.sin(seat.angle)
  const fanDirZ = Math.cos(seat.angle)

  const cardPositionsDelta: Record<string, { x: number; z: number }> = {}
  for (const [i, cardId] of targetPile.entries()) {
    const pos = {
      x: basePos.x + i * NERTZ_WORK_PILE_FAN_OFFSET * fanDirX,
      z: basePos.z + i * NERTZ_WORK_PILE_FAN_OFFSET * fanDirZ,
    }
    state.cardPositions[cardId] = pos
    cardPositionsDelta[cardId] = pos
  }

  return { players: state.players, cardPositions: cardPositionsDelta }
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
    return { result: { ok: true, cardId: action.cardId }, gameStateUpdate: delta, isGameOver: false }
  }

  if (action.type === "play-to-work-pile") {
    const error = validateWorkPilePlay(action, playerState)
    if (error) {
      return { result: { ok: false, cardId: action.cardId, reason: error }, isGameOver: false }
    }
    const delta = applyWorkPilePlay(action, playerState, state)
    return { result: { ok: true, cardId: action.cardId }, gameStateUpdate: delta, isGameOver: false }
  }

  if (action.type === "merge-work-piles") {
    const error = validateMergeWorkPiles(action, playerState)
    if (error) {
      return { result: { ok: false, cardId: action.cardId, reason: error }, isGameOver: false }
    }
    const delta = applyMergeWorkPiles(action, playerState, state)
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
      phase: "waiting",
      winnerId: null,
      startedAt: null,
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

  const seat = computeSeat(playerState.playerIndex, state.numPlayers, NERTZ_SEAT_RADIUS)
  const piles = computeDealPiles(seat, NERTZ_SEAT_RADIUS, NERTZ_PILE_OFFSET)
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

/**
 * Transitions the game from `waiting` to `playing` for the host.
 * Returns an error if the sender is not the host or the phase is wrong.
 */
export const processStartGame = (
  playerId: string,
  hostPlayerId: string,
  state: NertzGameState,
): { ok: true; startedAt: string } | { ok: false; reason: string } => {
  if (playerId !== hostPlayerId) return { ok: false, reason: "Only the host can start the game" }
  if (state.phase !== "waiting") return { ok: false, reason: "Game is not in the waiting phase" }
  const startedAt = new Date().toISOString()
  state.phase = "playing"
  state.startedAt = startedAt
  return { ok: true, startedAt }
}

/**
 * Ends the game when a player declares their nertz pile is empty.
 * Validates the pile is actually empty before accepting the claim.
 */
export const processCallNertz = (
  playerId: string,
  state: NertzGameState,
): { ok: true } | { ok: false; reason: string } => {
  if (state.phase !== "playing") return { ok: false, reason: "Game is not in progress" }
  const playerState = state.players.find((p) => p.playerId === playerId)
  if (!playerState) return { ok: false, reason: "Player not found in game state" }
  if (playerState.nertzPile.length > 0) return { ok: false, reason: "Your nertz pile is not empty" }
  state.phase = "finished"
  state.winnerId = playerId
  return { ok: true }
}
