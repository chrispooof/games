import * as THREE from "three"
import { CARD_Y_OFFSET } from "../utils/constants"

/** Seconds each card takes to fly to its destination */
const FLIP_CARD_DURATION = 0.12
/** Seconds between each card leaving the stock (deals one at a time) */
const FLIP_CARD_STAGGER = 0.12
/** Peak Y arc height when flipping to waste */
const FLIP_ARC_HEIGHT = 0.45

/** Seconds each card takes to fly back to stock on recycle */
const RECYCLE_CARD_DURATION = 0.1
/** Seconds between each card leaving the waste on recycle */
const RECYCLE_STAGGER = 0.015
/** Peak Y arc height when recycling back to stock */
const RECYCLE_ARC_HEIGHT = 0.3

const ease = (t: number): number => t * t * (3 - 2 * t)
const clamp01 = (t: number): number => Math.max(0, Math.min(1, t))

interface AnimCard {
  object: THREE.Object3D
  startX: number
  startY: number
  startZ: number
  targetX: number
  targetY: number
  targetZ: number
  startRotZ: number
  targetRotZ: number
  arcHeight: number
  delay: number
  duration: number
}

/**
 * Animates cards flying between the stock and waste piles:
 *   - Flip: up to 3 cards deal one-by-one from stock to waste, flipping face-up
 *   - Recycle: all waste cards fly back to stock simultaneously, flipping face-down
 *
 * Call `update(dt)` each frame; `isComplete` turns true when all cards land.
 */
export class FlipStockAnimation {
  private cards: AnimCard[]
  private timer = 0
  isComplete = false

  constructor(cards: AnimCard[]) {
    this.cards = cards
  }

  /** @param dt - Delta time in seconds */
  update(dt: number): void {
    if (this.isComplete) return
    this.timer += dt

    let allDone = true
    for (const c of this.cards) {
      const raw = clamp01((this.timer - c.delay) / c.duration)
      if (raw < 1) allDone = false
      if (raw <= 0) {
        allDone = false
        continue
      }

      const t = ease(raw)
      c.object.position.x = THREE.MathUtils.lerp(c.startX, c.targetX, t)
      c.object.position.z = THREE.MathUtils.lerp(c.startZ, c.targetZ, t)
      c.object.position.y =
        THREE.MathUtils.lerp(c.startY, c.targetY, t) + c.arcHeight * Math.sin(raw * Math.PI)
      // Flip rotation through the second half of the flight
      const flipT = ease(clamp01((raw - 0.5) * 2))
      c.object.rotation.z = THREE.MathUtils.lerp(c.startRotZ, c.targetRotZ, flipT)
    }

    if (allDone) this.isComplete = true
  }

  /**
   * Builds an animation for flipping up to 3 cards from stock to waste.
   * @param cardObjects - The card objects to animate (in flip order, bottom → top)
   * @param wasteBase - World-space XZ position of the waste pile base
   * @param existingWasteCount - Number of waste cards already present before this flip
   * @param fanDirX - X component of the unit vector pointing from center toward the player
   * @param fanDirZ - Z component of the unit vector pointing from center toward the player
   */
  static buildFlip(
    cardObjects: THREE.Object3D[],
    wasteBase: { x: number; z: number },
    existingWasteCount: number,
    fanDirX: number,
    fanDirZ: number
  ): FlipStockAnimation {
    const cards: AnimCard[] = cardObjects.map((obj, i) => {
      const wasteIdx = existingWasteCount + i
      return {
        object: obj,
        startX: obj.position.x,
        startY: obj.position.y,
        startZ: obj.position.z,
        targetX: wasteBase.x + wasteIdx * 0.003 * fanDirX,
        targetY: CARD_Y_OFFSET + wasteIdx * 0.002,
        targetZ: wasteBase.z + wasteIdx * 0.003 * fanDirZ,
        startRotZ: Math.PI, // face-down in stock
        targetRotZ: 0, // face-up on waste
        arcHeight: FLIP_ARC_HEIGHT,
        delay: i * FLIP_CARD_STAGGER,
        duration: FLIP_CARD_DURATION,
      }
    })
    return new FlipStockAnimation(cards)
  }

  /**
   * Builds an animation for recycling all waste cards back to stock.
   * @param cardObjects - Pairs of { object, stockIdx } — the new index each card will occupy in stock
   * @param stockBase - World-space XZ position of the stock pile base
   * @param fanDirX - X component of the unit vector pointing from center toward the player
   * @param fanDirZ - Z component of the unit vector pointing from center toward the player
   */
  static buildRecycle(
    cardObjects: Array<{ object: THREE.Object3D; stockIdx: number }>,
    stockBase: { x: number; z: number },
    fanDirX: number,
    fanDirZ: number
  ): FlipStockAnimation {
    const cards: AnimCard[] = cardObjects.map((c, i) => ({
      object: c.object,
      startX: c.object.position.x,
      startY: c.object.position.y,
      startZ: c.object.position.z,
      targetX: stockBase.x + c.stockIdx * 0.005 * fanDirX,
      targetY: CARD_Y_OFFSET + c.stockIdx * 0.004,
      targetZ: stockBase.z + c.stockIdx * 0.005 * fanDirZ,
      startRotZ: 0, // face-up in waste
      targetRotZ: Math.PI, // face-down in stock
      arcHeight: RECYCLE_ARC_HEIGHT,
      delay: i * RECYCLE_STAGGER,
      duration: RECYCLE_CARD_DURATION,
    }))
    return new FlipStockAnimation(cards)
  }
}
