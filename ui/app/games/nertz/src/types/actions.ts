/** Action: play a card from a pile to a foundation slot */
export type PlayToFoundationAction = {
  type: "play-to-foundation"
  cardId: string
  /** Index into the FoundationArea.slots array */
  slotIndex: number
  source: "nertz" | "work" | "waste"
  /** Work pile index (0–3) when source === "work" */
  sourceIndex?: number
}

/** Action: play a card from a pile to the local player's work pile */
export type PlayToWorkPileAction = {
  type: "play-to-work-pile"
  cardId: string
  /** Target work pile index 0–3 (always local player's own piles) */
  targetPileIndex: number
  source: "nertz" | "work" | "waste"
  sourceIndex?: number
}

/** Action: flip up to 3 cards from stock to waste */
export type FlipStockAction = { type: "flip-stock" }

/** Legacy free-move action (no server validation) */
export type MoveCardAction = {
  type: "move-card"
  cardId: string
  position: { x: number; z: number }
}

/** Union of all possible game actions emitted by the client */
export type GameAction =
  | PlayToFoundationAction
  | PlayToWorkPileAction
  | FlipStockAction
  | MoveCardAction

/** Server response to the acting player for a typed action */
export type ActionResult =
  | { ok: true; cardId: string }
  | { ok: false; cardId: string; reason: "illegal-move" | "foundation-conflict" | "not-your-pile" }
