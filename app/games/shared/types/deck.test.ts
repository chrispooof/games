import { describe, it, expect, vi } from "vitest"
import * as THREE from "three"
import { Card } from "./deck"

const makeObject = () => new THREE.Object3D()

describe("Card", () => {
  it("stores all constructor arguments", () => {
    const object = makeObject()
    const card = new Card("Card_A_clubs", "clubs", "A", 1, true, object)
    expect(card.id).toBe("Card_A_clubs")
    expect(card.suit).toBe("clubs")
    expect(card.rank).toBe("A")
    expect(card.value).toBe(1)
    expect(card.isFaceUp).toBe(true)
    expect(card.object).toBe(object)
  })

  it("defaults isFaceUp to false", () => {
    const card = new Card(
      "Card_2_hearts",
      "hearts",
      "2",
      2,
      undefined as unknown as boolean,
      makeObject()
    )
    expect(card.isFaceUp).toBe(false)
  })

  it("exposes object as the same reference passed to Interactable mesh", () => {
    const object = makeObject()
    const card = new Card("Card_K_spades", "spades", "K", 13, false, object)
    expect(card.mesh).toBe(object)
  })

  it("invokes onClick callback when called", () => {
    const onClick = vi.fn()
    const card = new Card("Card_J_diamonds", "diamonds", "J", 11, false, makeObject(), onClick)
    card.onClick()
    expect(onClick).toHaveBeenCalledOnce()
  })

  it("invokes onHover callback when called", () => {
    const onHover = vi.fn()
    const card = new Card("Card_Q_clubs", "clubs", "Q", 12, false, makeObject(), undefined, onHover)
    card.onHover()
    expect(onHover).toHaveBeenCalledOnce()
  })

  it("default onClick is a no-op that does not throw", () => {
    const card = new Card("Card_3_spades", "spades", "3", 3, false, makeObject())
    expect(() => card.onClick()).not.toThrow()
  })
})
