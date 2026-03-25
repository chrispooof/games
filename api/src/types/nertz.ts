import { z } from "zod"

/** Card suit in a standard deck. */
export type Suit = "clubs" | "diamonds" | "hearts" | "spades"

/** State of a single foundation slot. */
export interface FoundationState {
  slotIndex: number
  suit: Suit | null
  /** 0 = empty, 1 = Ace, …, 13 = King */
  topValue: number
}

/** Complete pile state for a single player. */
export interface PlayerPileState {
  playerId: string
  playerIndex: number
  /** cardIds ordered bottom-to-top; last element is the playable top card */
  nertzPile: string[]
  workPiles: [string[], string[], string[], string[]]
  /** cardIds ordered bottom-to-top */
  stock: string[]
  waste: string[]
}

/** Full server-side game state for a Nertz session. */
export interface NertzGameState {
  numPlayers: number
  cardPositions: Record<string, { x: number; z: number }>
  foundations: FoundationState[]
  players: PlayerPileState[]
  /** waiting = lobby, playing = in progress, finished = game over */
  phase: "waiting" | "dealing" | "playing" | "finished"
  winnerId: string | null
  /** ISO timestamp set when the host starts the game */
  startedAt: string | null
}

/** Pile data sent by the client after the deal animation completes. */
export interface InitialPileData {
  nertzPile: string[]
  workPiles: [string[], string[], string[], string[]]
  stock: string[]
  waste: string[]
}

/** Union of all player actions for Nertz. */
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
  | {
      type: "merge-work-piles"
      sourcePileIndex: number
      cardId: string
      targetPileIndex: number
    }
  | { type: "flip-stock" }
  | { type: "move-card"; cardId: string; position: { x: number; z: number } }

/** Response emitted to the acting socket for typed actions. */
export type ActionResult =
  | { ok: true; cardId: string }
  | { ok: false; cardId: string; reason: "illegal-move" | "foundation-conflict" | "not-your-pile" }

const sourceSchema = z.enum(["nertz", "work", "waste"])
const cardPositionSchema = z.object({ x: z.number(), z: z.number() })

/** Runtime schema for all supported Nertz socket game actions. */
export const nertzGameActionSchema = z.union([
  z.object({
    type: z.literal("play-to-foundation"),
    cardId: z.string(),
    slotIndex: z.number(),
    source: sourceSchema,
    sourceIndex: z.number().optional(),
  }),
  z.object({
    type: z.literal("play-to-work-pile"),
    cardId: z.string(),
    targetPileIndex: z.number(),
    source: sourceSchema,
    sourceIndex: z.number().optional(),
  }),
  z.object({
    type: z.literal("merge-work-piles"),
    sourcePileIndex: z.number(),
    cardId: z.string(),
    targetPileIndex: z.number(),
  }),
  z.object({ type: z.literal("flip-stock") }),
  z.object({
    type: z.literal("move-card"),
    cardId: z.string(),
    position: cardPositionSchema,
  }),
])

/** Runtime schema for the Nertz `set-state` payload sent after intro deal. */
export const nertzSetStateSchema = z.object({
  positions: z.record(z.string(), cardPositionSchema),
  pileState: z.object({
    nertzPile: z.array(z.string()),
    workPiles: z.tuple([z.array(z.string()), z.array(z.string()), z.array(z.string()), z.array(z.string())]),
    stock: z.array(z.string()),
    waste: z.array(z.string()),
  }),
})
