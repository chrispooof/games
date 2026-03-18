import * as THREE from "three"
import { Interactable } from "./interactables"

/** The four suits in a standard deck */
export type Suit = "clubs" | "diamonds" | "hearts" | "spades"

/** All valid card ranks, where A = 1 and K = 13 */
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K"

/**
 * Represents a single playing card in the 3D scene.
 * Extends Interactable so it responds to click and hover events.
 */
export class Card extends Interactable {
  id: string
  suit: Suit
  rank: Rank
  /** Numeric value of the card (A = 1, J = 11, Q = 12, K = 13) */
  value: number
  isFaceUp: boolean
  object: THREE.Object3D<THREE.Object3DEventMap>

  /**
   * @param id - Unique identifier matching the GLB mesh name (e.g. "Card_A_clubs")
   * @param suit - The card's suit
   * @param rank - The card's rank
   * @param value - Numeric value of the rank
   * @param isFaceUp - Whether the card face is visible
   * @param object - The Three.js scene object for this card
   * @param onClick - Callback fired when the card is clicked
   * @param onHover - Callback fired when the card is hovered
   */
  constructor(
    id: string,
    suit: Suit,
    rank: Rank,
    value: number,
    isFaceUp: boolean = false,
    object: THREE.Object3D<THREE.Object3DEventMap>,
    onClick: () => void = () => {},
    onHover: () => void = () => {}
  ) {
    super(object, { onClick, onHover })
    this.id = id
    this.suit = suit
    this.rank = rank
    this.value = value
    this.isFaceUp = isFaceUp
    this.object = object
  }
}
