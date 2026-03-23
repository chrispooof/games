import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { FlipStockAnimation } from "./flip-stock"
import { CARD_Y_OFFSET } from "../utils/constants"

/** Creates a Three.js Object3D at the given position with the given rotation.z */
const makeObj = (x: number, y: number, z: number, rotZ = Math.PI): THREE.Object3D => {
  const obj = new THREE.Object3D()
  obj.position.set(x, y, z)
  obj.rotation.z = rotZ
  return obj
}

/** Runs an animation to completion with large time steps and returns the final timer count */
const runToComplete = (anim: { update: (dt: number) => void; isComplete: boolean }): void => {
  let guard = 0
  while (!anim.isComplete && guard < 500) {
    anim.update(0.1)
    guard++
  }
}

describe("FlipStockAnimation", () => {
  describe("buildFlip", () => {
    it("starts incomplete", () => {
      const objs = [makeObj(1, CARD_Y_OFFSET, 2)]
      const anim = FlipStockAnimation.buildFlip(objs, { x: 0, z: 0 }, 0, 0, 1)
      expect(anim.isComplete).toBe(false)
    })

    it("completes after all cards have been dealt", () => {
      const objs = [
        makeObj(1, CARD_Y_OFFSET, 2),
        makeObj(1, CARD_Y_OFFSET, 2),
        makeObj(1, CARD_Y_OFFSET, 2),
      ]
      const anim = FlipStockAnimation.buildFlip(objs, { x: 0, z: 3 }, 0, 0, 1)
      runToComplete(anim)
      expect(anim.isComplete).toBe(true)
    })

    it("lands each card at the correct waste XZ with fan stagger", () => {
      const wasteBase = { x: -1, z: 4 }
      const fanDirX = 0
      const fanDirZ = 1
      const objs = [
        makeObj(0, CARD_Y_OFFSET + 0.008, 2), // top of stock
        makeObj(0, CARD_Y_OFFSET + 0.004, 2),
        makeObj(0, CARD_Y_OFFSET, 2),
      ]
      // 5 cards already in waste
      const anim = FlipStockAnimation.buildFlip(objs, wasteBase, 5, fanDirX, fanDirZ)
      runToComplete(anim)

      objs.forEach((obj, i) => {
        const wasteIdx = 5 + i
        expect(obj.position.x).toBeCloseTo(wasteBase.x + wasteIdx * 0.003 * fanDirX)
        expect(obj.position.z).toBeCloseTo(wasteBase.z + wasteIdx * 0.003 * fanDirZ)
        expect(obj.position.y).toBeCloseTo(CARD_Y_OFFSET + wasteIdx * 0.002)
      })
    })

    it("lands cards face-up (rotation.z ≈ 0)", () => {
      const objs = [makeObj(0, CARD_Y_OFFSET, 2, Math.PI), makeObj(0, CARD_Y_OFFSET, 2, Math.PI)]
      const anim = FlipStockAnimation.buildFlip(objs, { x: 0, z: 3 }, 0, 0, 1)
      runToComplete(anim)
      objs.forEach((obj) => expect(obj.rotation.z).toBeCloseTo(0))
    })

    it("staggers cards — second card has not moved when first card is still in flight", () => {
      const startZ = 2
      const objs = [makeObj(0, CARD_Y_OFFSET, startZ), makeObj(0, CARD_Y_OFFSET, startZ)]
      const anim = FlipStockAnimation.buildFlip(objs, { x: 0, z: 5 }, 0, 0, 1)

      // dt=0.06: first card is halfway through (raw=0.5) but second hasn't started (delay=0.12)
      anim.update(0.06)
      expect(objs[0].position.z).not.toBeCloseTo(startZ)
      expect(objs[1].position.z).toBeCloseTo(startZ)
    })

    it("does not move cards further after isComplete", () => {
      const objs = [makeObj(0, CARD_Y_OFFSET, 2)]
      const anim = FlipStockAnimation.buildFlip(objs, { x: 0, z: 5 }, 0, 0, 1)
      runToComplete(anim)
      const finalZ = objs[0].position.z
      anim.update(10)
      expect(objs[0].position.z).toBeCloseTo(finalZ)
    })
  })

  describe("buildRecycle", () => {
    it("starts incomplete", () => {
      const entries = [{ object: makeObj(0, CARD_Y_OFFSET, 3, 0), stockIdx: 0 }]
      const anim = FlipStockAnimation.buildRecycle(entries, { x: 0, z: 0 }, 0, 1)
      expect(anim.isComplete).toBe(false)
    })

    it("completes after all cards land", () => {
      const entries = Array.from({ length: 10 }, (_, i) => ({
        object: makeObj(0, CARD_Y_OFFSET, 3, 0),
        stockIdx: i,
      }))
      const anim = FlipStockAnimation.buildRecycle(entries, { x: 1, z: 2 }, 0, 1)
      runToComplete(anim)
      expect(anim.isComplete).toBe(true)
    })

    it("lands each card at the correct stock XZ based on stockIdx", () => {
      const stockBase = { x: 2, z: -1 }
      const fanDirX = 1
      const fanDirZ = 0
      const entries = [
        { object: makeObj(0, CARD_Y_OFFSET, 3, 0), stockIdx: 0 },
        { object: makeObj(0, CARD_Y_OFFSET, 3, 0), stockIdx: 1 },
        { object: makeObj(0, CARD_Y_OFFSET, 3, 0), stockIdx: 5 },
      ]
      const anim = FlipStockAnimation.buildRecycle(entries, stockBase, fanDirX, fanDirZ)
      runToComplete(anim)

      entries.forEach(({ object, stockIdx }) => {
        expect(object.position.x).toBeCloseTo(stockBase.x + stockIdx * 0.005 * fanDirX)
        expect(object.position.z).toBeCloseTo(stockBase.z + stockIdx * 0.005 * fanDirZ)
        expect(object.position.y).toBeCloseTo(CARD_Y_OFFSET + stockIdx * 0.004)
      })
    })

    it("lands cards face-down (rotation.z ≈ π)", () => {
      const entries = [
        { object: makeObj(0, CARD_Y_OFFSET, 3, 0), stockIdx: 0 },
        { object: makeObj(0, CARD_Y_OFFSET, 3, 0), stockIdx: 1 },
      ]
      const anim = FlipStockAnimation.buildRecycle(entries, { x: 0, z: 0 }, 0, 1)
      runToComplete(anim)
      entries.forEach(({ object }) => expect(object.rotation.z).toBeCloseTo(Math.PI))
    })

    it("staggers cards — second card lags behind first", () => {
      const startZ = 3
      const entries = [
        { object: makeObj(0, CARD_Y_OFFSET, startZ, 0), stockIdx: 0 },
        { object: makeObj(0, CARD_Y_OFFSET, startZ, 0), stockIdx: 1 },
      ]
      const anim = FlipStockAnimation.buildRecycle(entries, { x: 0, z: 0 }, 0, 1)

      // dt=0.008: first card has started (raw ≈ 0.08) but second hasn't (delay = RECYCLE_STAGGER = 0.015)
      anim.update(0.008)
      expect(entries[0].object.position.z).not.toBeCloseTo(startZ)
      expect(entries[1].object.position.z).toBeCloseTo(startZ)
    })
  })
})
