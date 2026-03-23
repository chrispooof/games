import * as THREE from "three"
import type { Card } from "../../../shared/types/deck"
import { CARD_Y_OFFSET } from "../utils/constants"

/** Seconds each card takes to travel from its start position to its pile */
const CARD_DEAL_DURATION = 0.08

/** Peak Y height of the arc a card travels through mid-flight */
const CARD_ARC_HEIGHT = 0.6

/** Seconds the camera takes to zoom out */
const CAMERA_ZOOM_DURATION = 1.0

/** Number of cards in the Nertz pile */
const NERTZ_PILE_SIZE = 13

/** Number of work piles dealt (one card each) */
const WORK_PILE_COUNT = 4

/** Smoothstep easing (cubic) */
const ease = (t: number): number => t * t * (3 - 2 * t)

/** Per-card deal target: where it lands and whether it faces up */
interface CardAssignment {
  targetX: number
  targetY: number
  targetZ: number
  faceUp: boolean
}

/**
 * One-shot intro animation that deals all 52 cards into the six Nertz game piles:
 *   - Pile 0: Nertz pile — 13 cards face-down, top card face-up
 *   - Piles 1–4: Work piles — 1 card each, face-up
 *   - Pile 5: Stock pile — remaining 35 cards, face-down
 *
 * The camera zooms out during the deal. Call `update(dt)` every frame;
 * check `isComplete` when finished.
 */
export class IntroAnimation {
  private cards: Card[]
  private camera: THREE.PerspectiveCamera
  private assignments: CardAssignment[]
  private startPositions: THREE.Vector3[]
  private cameraStart: THREE.Vector3
  private cameraEnd: THREE.Vector3
  private currentIndex = 0
  private cardTimer = 0
  private cameraTimer = 0

  isComplete = false

  /**
   * Cards in the order they were dealt: indices 0–12 → Nertz pile (0=bottom, 12=top),
   * 13–16 → Work piles 1–4, 17–51 → Stock pile (17=bottom, 51=top).
   * Safe to read after `isComplete` is true.
   */
  get dealtCards(): Card[] {
    return this.cards
  }

  /**
   * @param cards - Shuffled 52-card deck in deal order
   * @param camera - Scene camera, animated from cameraStart to cameraEnd during the deal
   * @param piles - Six world-space positions: [Nertz, Work1, Work2, Work3, Work4, Stock]
   * @param fanDir - Unit vector pointing from center toward the player's seat
   * @param cameraStart - Camera position at the beginning of the intro
   * @param cameraEnd - Camera position at the end of the intro
   */
  constructor(
    cards: Card[],
    camera: THREE.PerspectiveCamera,
    piles: Array<{ x: number; z: number }>,
    fanDir: { x: number; z: number },
    cameraStart: THREE.Vector3,
    cameraEnd: THREE.Vector3
  ) {
    this.cards = [...cards]
    this.camera = camera
    this.cameraStart = cameraStart.clone()
    this.cameraEnd = cameraEnd.clone()
    this.startPositions = cards.map((c) => c.object.position.clone())
    this.assignments = this.buildAssignments(cards.length, piles, fanDir)
  }

  /**
   * Maps each card index to a pile target and face-up flag.
   * Nertz and Stock cards use the same XZ/Y stagger as `refreshLocalDisplay` so
   * there is no visual pop when the live display takes over after the intro.
   * - 0–12 → Nertz pile (face-down; card 12 is the top card, dealt face-up)
   * - 13–16 → Work piles 1–4 (face-up)
   * - 17–51 → Stock pile (face-down)
   */
  private buildAssignments(
    total: number,
    piles: Array<{ x: number; z: number }>,
    fanDir: { x: number; z: number }
  ): CardAssignment[] {
    let stockIndex = 0
    return Array.from({ length: total }, (_, i) => {
      if (i < NERTZ_PILE_SIZE) {
        const isTop = i === NERTZ_PILE_SIZE - 1
        return {
          targetX: piles[0].x + i * 0.005 * fanDir.x,
          targetY: CARD_Y_OFFSET + i * 0.004 + (isTop ? 0.01 : 0),
          targetZ: piles[0].z + i * 0.005 * fanDir.z,
          faceUp: isTop, // only the top card is face-up
        }
      }
      if (i < NERTZ_PILE_SIZE + WORK_PILE_COUNT) {
        const workIdx = i - NERTZ_PILE_SIZE + 1 // pile index 1–4
        return {
          targetX: piles[workIdx].x,
          targetY: CARD_Y_OFFSET,
          targetZ: piles[workIdx].z,
          faceUp: true,
        }
      }
      // Stock pile — stagger matches refreshLocalDisplay stock rendering
      const si = stockIndex++
      return {
        targetX: piles[6].x + si * 0.005 * fanDir.x,
        targetY: CARD_Y_OFFSET + si * 0.004,
        targetZ: piles[6].z + si * 0.005 * fanDir.z,
        faceUp: false,
      }
    })
  }

  /** Advance the animation by `dt` seconds. No-op once `isComplete` is true. */
  update(dt: number): void {
    if (this.isComplete) return
    this.updateCamera(dt)
    this.updateCard(dt)
  }

  /** Smoothly moves the camera from cameraStart to cameraEnd */
  private updateCamera(dt: number): void {
    if (this.cameraTimer >= CAMERA_ZOOM_DURATION) return
    this.cameraTimer = Math.min(CAMERA_ZOOM_DURATION, this.cameraTimer + dt)
    const t = ease(this.cameraTimer / CAMERA_ZOOM_DURATION)
    this.camera.position.lerpVectors(this.cameraStart, this.cameraEnd, t)
  }

  /**
   * Moves the current card from its start position to its assigned pile via a parabolic arc.
   * Face-down cards flip during the second half of the flight; face-up cards stay upright.
   */
  private updateCard(dt: number): void {
    if (this.currentIndex >= this.cards.length) return

    this.cardTimer += dt
    const raw = Math.min(1, this.cardTimer / CARD_DEAL_DURATION)
    const t = ease(raw)

    const card = this.cards[this.currentIndex]
    const start = this.startPositions[this.currentIndex]
    const { targetX, targetY, targetZ, faceUp } = this.assignments[this.currentIndex]

    // XZ: smooth glide to pile target (staggered for nertz/stock)
    card.object.position.x = THREE.MathUtils.lerp(start.x, targetX, t)
    card.object.position.z = THREE.MathUtils.lerp(start.z, targetZ, t)

    // Y: parabolic arc peaks at mid-flight, lands at staggered targetY
    card.object.position.y = targetY + CARD_ARC_HEIGHT * Math.sin(raw * Math.PI)

    // Face-down cards flip during the second half of the arc; face-up cards don't flip
    if (!faceUp) {
      card.object.rotation.z = ease(Math.max(0, (raw - 0.5) * 2)) * Math.PI
    }

    if (raw >= 1) {
      this.landCard(card)
    }
  }

  /** Snaps a card to its final resting position using its pre-computed staggered target */
  private landCard(card: Card): void {
    const { targetX, targetY, targetZ, faceUp } = this.assignments[this.currentIndex]

    card.object.position.set(targetX, targetY, targetZ)
    card.object.rotation.z = faceUp ? 0 : Math.PI

    this.currentIndex++
    this.cardTimer = 0

    if (this.currentIndex >= this.cards.length) {
      this.isComplete = true
    }
  }
}
