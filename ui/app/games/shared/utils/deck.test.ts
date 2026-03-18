import { describe, it, expect } from "vitest"
import { parseCardConfig } from "./deck"

describe("parseCardConfig", () => {
  it("parses suit correctly", () => {
    expect(parseCardConfig("Card_A_clubs").suit).toBe("clubs")
    expect(parseCardConfig("Card_A_diamonds").suit).toBe("diamonds")
    expect(parseCardConfig("Card_A_hearts").suit).toBe("hearts")
    expect(parseCardConfig("Card_A_spades").suit).toBe("spades")
  })

  it("parses rank correctly", () => {
    expect(parseCardConfig("Card_A_clubs").rank).toBe("A")
    expect(parseCardConfig("Card_10_hearts").rank).toBe("10")
    expect(parseCardConfig("Card_J_spades").rank).toBe("J")
    expect(parseCardConfig("Card_Q_diamonds").rank).toBe("Q")
    expect(parseCardConfig("Card_K_clubs").rank).toBe("K")
  })

  it("maps numeric ranks to correct values", () => {
    for (let n = 2; n <= 9; n++) {
      expect(parseCardConfig(`Card_${n}_clubs`).value).toBe(n)
    }
    expect(parseCardConfig("Card_10_clubs").value).toBe(10)
  })

  it("maps face cards to correct values", () => {
    expect(parseCardConfig("Card_J_clubs").value).toBe(11)
    expect(parseCardConfig("Card_Q_clubs").value).toBe(12)
    expect(parseCardConfig("Card_K_clubs").value).toBe(13)
  })

  it("maps Ace to value 1", () => {
    expect(parseCardConfig("Card_A_clubs").value).toBe(1)
  })
})
