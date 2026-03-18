import { describe, it, expect } from "vitest"
import { DECK_CARD_NAME_CONFIG } from "./deck"

const SUITS = ["clubs", "diamonds", "hearts", "spades"]
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]

describe("DECK_CARD_NAME_CONFIG", () => {
  it("contains exactly 52 cards", () => {
    expect(DECK_CARD_NAME_CONFIG).toHaveLength(52)
  })

  it("has no duplicate entries", () => {
    const unique = new Set(DECK_CARD_NAME_CONFIG)
    expect(unique.size).toBe(52)
  })

  it("all entries match the Card_<Rank>_<Suit> naming convention", () => {
    const pattern = /^Card_[A-Z0-9]+_[a-z]+$/
    for (const name of DECK_CARD_NAME_CONFIG) {
      expect(name, `"${name}" does not match expected format`).toMatch(pattern)
    }
  })

  it("contains all 4 suits", () => {
    for (const suit of SUITS) {
      const count = DECK_CARD_NAME_CONFIG.filter((n) => n.endsWith(`_${suit}`)).length
      expect(count, `suit "${suit}" should have 13 cards`).toBe(13)
    }
  })

  it("contains all 13 ranks for each suit", () => {
    for (const suit of SUITS) {
      const ranksInSuit = DECK_CARD_NAME_CONFIG.filter((n) => n.endsWith(`_${suit}`)).map(
        (n) => n.split("_")[1]
      )
      for (const rank of RANKS) {
        expect(ranksInSuit, `rank "${rank}" missing from ${suit}`).toContain(rank)
      }
    }
  })
})
