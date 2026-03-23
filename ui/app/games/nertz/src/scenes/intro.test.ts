import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { Card } from "../../../shared/types/deck"
import { IntroAnimation } from "./intro"
import { CARD_Y_OFFSET } from "../utils/constants"

const makeCards = (count: number): Card[] =>
  Array.from({ length: count }, (_, i) => {
    const obj = new THREE.Object3D()
    obj.position.set(0, CARD_Y_OFFSET, 0)
    return new Card(`p0_Card_A_clubs_${i}`, "clubs", "A", 1, false, obj)
  })

describe("IntroAnimation", () => {
  it("offsets the source stack downward before dealing", () => {
    const cards = makeCards(52)
    const camera = new THREE.PerspectiveCamera()
    const piles = [
      { x: -2.55, z: 2 },
      { x: -1.7, z: 2 },
      { x: -0.85, z: 2 },
      { x: 0, z: 2 },
      { x: 0.85, z: 2 },
      { x: 1.7, z: 2 },
      { x: 2.55, z: 2 },
    ]
    const fanDir = { x: 0, z: 1 }

    new IntroAnimation(
      cards,
      camera,
      piles,
      fanDir,
      new THREE.Vector3(0, 2, 6),
      new THREE.Vector3(0, 5, 8)
    )

    // SOURCE_STACK_DOWNWARD_OFFSET in intro.ts
    expect(cards[0].object.position.x).toBeCloseTo(0)
    expect(cards[0].object.position.z).toBeCloseTo(0.55)
  })

  it("deals cards to nertz, work, and stock piles with expected faces", () => {
    const cards = makeCards(52)
    const camera = new THREE.PerspectiveCamera()
    const piles = [
      { x: -2.55, z: 2 },
      { x: -1.7, z: 2 },
      { x: -0.85, z: 2 },
      { x: 0, z: 2 },
      { x: 0.85, z: 2 },
      { x: 1.7, z: 2 },
      { x: 2.55, z: 2 },
    ]
    const fanDir = { x: 0, z: 1 }
    const intro = new IntroAnimation(
      cards,
      camera,
      piles,
      fanDir,
      new THREE.Vector3(0, 2, 6),
      new THREE.Vector3(0, 5, 8)
    )

    let guard = 0
    while (!intro.isComplete && guard < 200) {
      intro.update(1)
      guard++
    }
    expect(intro.isComplete).toBe(true)
    expect(intro.dealtCards.map((c) => c.id)).toEqual(cards.map((c) => c.id))

    // Nertz pile
    expect(cards[0].object.position.x).toBeCloseTo(piles[0].x)
    expect(cards[0].object.position.z).toBeCloseTo(piles[0].z)
    expect(cards[0].object.position.y).toBeCloseTo(CARD_Y_OFFSET)
    expect(cards[0].object.rotation.z).toBeCloseTo(Math.PI)

    expect(cards[12].object.position.x).toBeCloseTo(piles[0].x)
    expect(cards[12].object.position.z).toBeCloseTo(piles[0].z + 12 * 0.005)
    expect(cards[12].object.position.y).toBeCloseTo(CARD_Y_OFFSET + 12 * 0.004 + 0.01)
    expect(cards[12].object.rotation.z).toBeCloseTo(0)

    // Work piles 1-4 (indices 13-16)
    for (let wi = 0; wi < 4; wi++) {
      const c = cards[13 + wi]
      expect(c.object.position.x).toBeCloseTo(piles[wi + 1].x)
      expect(c.object.position.z).toBeCloseTo(piles[wi + 1].z)
      expect(c.object.position.y).toBeCloseTo(CARD_Y_OFFSET)
      expect(c.object.rotation.z).toBeCloseTo(0)
    }

    // Stock pile (cards 17-51, staggered)
    const stockBottom = cards[17]
    expect(stockBottom.object.position.x).toBeCloseTo(piles[6].x)
    expect(stockBottom.object.position.z).toBeCloseTo(piles[6].z)
    expect(stockBottom.object.position.y).toBeCloseTo(CARD_Y_OFFSET)
    expect(stockBottom.object.rotation.z).toBeCloseTo(Math.PI)

    const stockTop = cards[51]
    expect(stockTop.object.position.x).toBeCloseTo(piles[6].x)
    expect(stockTop.object.position.z).toBeCloseTo(piles[6].z + 34 * 0.005)
    expect(stockTop.object.position.y).toBeCloseTo(CARD_Y_OFFSET + 34 * 0.004)
    expect(stockTop.object.rotation.z).toBeCloseTo(Math.PI)
  })
})
