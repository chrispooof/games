import * as THREE from "three"
import type { Card } from "../../../shared/types/deck"
import { CARD_Y_OFFSET } from "../utils/constants"

/** Seconds between each card's collapse start */
const COLLAPSE_STAGGER = 0.01
/** Seconds each card takes to collapse into the pile */
const COLLAPSE_DURATION = 0.08
/** Peak Y arc height during collapse flight */
const COLLAPSE_ARC = 0.5

/** Seconds for the pile to split into two halves */
const SPLIT_DURATION = 0.22
/** X distance each half slides from center */
const SPLIT_OFFSET_X = 0.9

/** Seconds between each card's riffle start */
const RIFFLE_STAGGER = 0.015
/** Seconds each card takes to travel from its half-pile to the merged center */
const RIFFLE_DURATION = 0.06
/** Peak Y arc height during riffle flight */
const RIFFLE_ARC = 0.25

/** Number of split → riffle passes */
const NUM_PASSES = 2

type Phase = "collapse" | "split" | "riffle"

const ease = (t: number): number => t * t * (3 - 2 * t)
const clamp01 = (t: number): number => Math.max(0, Math.min(1, t))

/**
 * Animates a riffle shuffle sequence on a set of cards:
 *   1. Collapse — all cards fly from their grid positions to a center pile, flipping face-down
 *   2. Split    — the center pile divides into left and right halves
 *   3. Riffle   — cards interleave back to center (the actual shuffle merge)
 *
 * Phases 2–3 repeat `NUM_PASSES` times. After each riffle the `cards` array
 * is reordered to match the interleaved result so downstream logic sees the
 * shuffled order.
 *
 * Call `update(dt)` each frame; `isComplete` turns true when all passes finish.
 * Access `shuffledCards` to get the final card order for the deal animation.
 */
export class ShuffleAnimation {
  /** Mutable card array — reordered after each riffle pass */
  private cards: Card[]
  /** Grid positions captured before the first frame */
  private startPositions: THREE.Vector3[]
  /** World-space center that the pile collapses to and riffles around */
  private centerX: number
  private centerZ: number

  private phase: Phase = "collapse"
  private phaseTimer = 0
  private passCount = 0

  /**
   * X coordinate each card in `this.cards` came from at the start of the
   * current riffle phase. Populated by `beginRiffle()`.
   */
  private riffleSourceX: number[] = []

  isComplete = false

  get shuffledCards(): Card[] {
    return this.cards
  }

  /**
   * @param cards - The deck to animate
   * @param center - World-space point that cards collapse to and riffle around (default origin)
   */
  constructor(cards: Card[], center = { x: 0, z: 0 }) {
    this.cards = [...cards]
    this.startPositions = cards.map((c) => c.object.position.clone())
    this.centerX = center.x
    this.centerZ = center.z
  }

  update(dt: number): void {
    if (this.isComplete) return
    this.phaseTimer += dt

    if (this.phase === "collapse") this.tickCollapse()
    else if (this.phase === "split") this.tickSplit()
    else if (this.phase === "riffle") this.tickRiffle()
  }

  // ---------------------------------------------------------------------------
  // Collapse
  // ---------------------------------------------------------------------------

  private tickCollapse(): void {
    const totalDuration = (this.cards.length - 1) * COLLAPSE_STAGGER + COLLAPSE_DURATION

    this.cards.forEach((card, i) => {
      const t = clamp01((this.phaseTimer - i * COLLAPSE_STAGGER) / COLLAPSE_DURATION)
      if (t <= 0) return

      const te = ease(t)
      const start = this.startPositions[i]
      card.object.position.x = THREE.MathUtils.lerp(start.x, this.centerX, te)
      card.object.position.z = THREE.MathUtils.lerp(start.z, this.centerZ, te)
      // Parabolic arc over table surface
      card.object.position.y = CARD_Y_OFFSET + i * 0.0005 + COLLAPSE_ARC * Math.sin(t * Math.PI)
      // Flip face-down in the second half of the flight
      card.object.rotation.z = ease(clamp01((t - 0.5) * 2)) * Math.PI
    })

    if (this.phaseTimer >= totalDuration) {
      // Snap every card to its stacked position at the seat center
      this.cards.forEach((card, i) => {
        card.object.position.set(this.centerX, CARD_Y_OFFSET + i * 0.0005, this.centerZ)
        card.object.rotation.z = Math.PI
      })
      this.transition("split")
    }
  }

  // ---------------------------------------------------------------------------
  // Split
  // ---------------------------------------------------------------------------

  private tickSplit(): void {
    const t = ease(clamp01(this.phaseTimer / SPLIT_DURATION))
    const half = Math.floor(this.cards.length / 2)

    this.cards.forEach((card, i) => {
      const offset = i < half ? -SPLIT_OFFSET_X : SPLIT_OFFSET_X
      card.object.position.x = THREE.MathUtils.lerp(this.centerX, this.centerX + offset, t)
    })

    if (this.phaseTimer >= SPLIT_DURATION) {
      // Snap and begin riffle
      const half = Math.floor(this.cards.length / 2)
      this.cards.forEach((card, i) => {
        card.object.position.x = this.centerX + (i < half ? -SPLIT_OFFSET_X : SPLIT_OFFSET_X)
      })
      this.beginRiffle()
    }
  }

  // ---------------------------------------------------------------------------
  // Riffle
  // ---------------------------------------------------------------------------

  /**
   * Performs the interleave merge: alternates taking one card from the left half
   * then one from the right half (with occasional adjacent pair swaps for
   * realistic imperfection), records the source X for each card, and reorders
   * `this.cards` to match the merged result.
   */
  private beginRiffle(): void {
    const half = Math.floor(this.cards.length / 2)
    const left = this.cards.slice(0, half)
    const right = this.cards.slice(half)

    const merged: Card[] = []
    const sources: number[] = []
    const maxLen = Math.max(left.length, right.length)

    for (let i = 0; i < maxLen; i++) {
      if (i < left.length) {
        merged.push(left[i])
        sources.push(-SPLIT_OFFSET_X)
      }
      if (i < right.length) {
        merged.push(right[i])
        sources.push(SPLIT_OFFSET_X)
      }
    }

    // Simulate imperfect riffle: occasionally swap adjacent pairs
    for (let i = 0; i < merged.length - 1; i += 2) {
      if (Math.random() < 0.25) {
        ;[merged[i], merged[i + 1]] = [merged[i + 1], merged[i]]
        ;[sources[i], sources[i + 1]] = [sources[i + 1], sources[i]]
      }
    }

    for (let i = 0; i < merged.length; i++) {
      this.cards[i] = merged[i]
    }
    // Shift source X values to be relative to the seat center
    this.riffleSourceX = sources.map((srcOffset) => this.centerX + srcOffset)

    this.transition("riffle")
  }

  private tickRiffle(): void {
    const totalDuration = (this.cards.length - 1) * RIFFLE_STAGGER + RIFFLE_DURATION

    this.cards.forEach((card, i) => {
      const t = clamp01((this.phaseTimer - i * RIFFLE_STAGGER) / RIFFLE_DURATION)
      if (t <= 0) return

      const te = ease(t)
      const srcX = this.riffleSourceX[i]
      const targetY = CARD_Y_OFFSET + i * 0.0005

      card.object.position.x = THREE.MathUtils.lerp(srcX, this.centerX, te)
      card.object.position.y = targetY + RIFFLE_ARC * Math.sin(t * Math.PI)
    })

    if (this.phaseTimer >= totalDuration) {
      this.cards.forEach((card, i) => {
        card.object.position.set(this.centerX, CARD_Y_OFFSET + i * 0.0005, this.centerZ)
      })

      this.passCount++
      if (this.passCount >= NUM_PASSES) {
        this.isComplete = true
      } else {
        this.transition("split")
      }
    }
  }

  // ---------------------------------------------------------------------------

  private transition(next: Phase): void {
    this.phase = next
    this.phaseTimer = 0
  }
}
