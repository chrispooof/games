import type { Suit, Rank } from "../types/deck"
import { RANK_VALUES } from "~/games/nertz/src/utils/constants"

/**
 * From a card config string like "Card_A_clubs",
 * @returns Object with suit, rank, and value
 */
export const parseCardConfig = (config: string) => {
  const [_, rank, suit] = config.split("_")
  return { suit: suit as Suit, rank: rank as Rank, value: RANK_VALUES[rank as Rank] }
}
