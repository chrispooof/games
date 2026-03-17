import type { Suit, Rank } from "../types/deck"

const rankToValue: Record<Rank, number> = {
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

/**
 * From a card config string like "Card_A_clubs",
 * @returns Object with suit, rank, and value
 */
export const parseCardConfig = (config: string) => {
  const [_, rank, suit] = config.split("_")
  return { suit: suit as Suit, rank: rank as Rank, value: rankToValue[rank as Rank] }
}
