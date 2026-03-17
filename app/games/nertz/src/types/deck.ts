import * as THREE from "three"

export type Suit = "clubs" | "diamonds" | "hearts" | "spades"
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K"

export class Card {
  id: string
  suit: Suit
  rank: Rank
  value: number
  isFaceUp: boolean
  object: THREE.Object3D<THREE.Object3DEventMap> | null

  constructor(
    id: string,
    suit: Suit,
    rank: Rank,
    value: number,
    isFaceUp: boolean = false,
    object: THREE.Object3D<THREE.Object3DEventMap> | null = null
  ) {
    this.id = id
    this.suit = suit
    this.rank = rank
    this.value = value
    this.isFaceUp = isFaceUp
    this.object = object
  }
}
