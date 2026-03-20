import * as THREE from "three"
import type { Card } from "../../../shared/types/deck"
import { CAMERA_HEIGHT, CARD_Y_OFFSET, INTRO_CAMERA_HEIGHT } from "../utils/constants"

/** Seconds each card takes to travel from grid to pile */
const CARD_DEAL_DURATION = 0.1

/** Peak Y height of the arc a card travels through mid-flight */
const CARD_ARC_HEIGHT = 0.6

/** Seconds the camera takes to zoom out */
const CAMERA_ZOOM_DURATION = 1.0

/** Smoothstep easing (cubic) */
const ease = (t: number): number => t * t * (3 - 2 * t)

/**
 * One-shot intro animation that deals all cards from their grid layout
 * into a face-down pile while the camera zooms out.
 *
 * Call `update(deltaTime)` every frame. Check `isComplete` to know when it ends.
 */
export class IntroAnimation {
  private cards: Card[]
  private camera: THREE.PerspectiveCamera
  /** World-space X coordinate the pile lands at */
  private pileX: number
  /** World-space Z coordinate the pile lands at */
  private pileZ: number
  /** Captured grid positions before animation begins */
  private startPositions: THREE.Vector3[]
  private currentIndex = 0
  private cardTimer = 0
  private cameraTimer = 0

  isComplete = false

  /**
   * @param cards - All cards to deal, in the order they will be animated
   * @param camera - Scene camera, zoomed out during the sequence
   * @param pileX - World-space X the pile lands at (default 0)
   * @param pileZ - World-space Z the pile lands at (default 0)
   */
  constructor(cards: Card[], camera: THREE.PerspectiveCamera, pileX = 0, pileZ = 0) {
    // Snapshot starting positions so we can lerp from them even as objects move
    this.cards = [...cards]
    this.camera = camera
    this.pileX = pileX
    this.pileZ = pileZ
    this.startPositions = cards.map((c) => c.object.position.clone())
  }

  /** Advance the animation by `dt` seconds. No-op once `isComplete` is true. */
  update(dt: number): void {
    if (this.isComplete) return

    this.updateCamera(dt)
    this.updateCard(dt)
  }

  /** Smoothly zooms the camera out from CAMERA_HEIGHT to INTRO_CAMERA_HEIGHT */
  private updateCamera(dt: number): void {
    if (this.cameraTimer >= CAMERA_ZOOM_DURATION) return
    this.cameraTimer = Math.min(CAMERA_ZOOM_DURATION, this.cameraTimer + dt)
    const t = ease(this.cameraTimer / CAMERA_ZOOM_DURATION)
    this.camera.position.y = THREE.MathUtils.lerp(CAMERA_HEIGHT, INTRO_CAMERA_HEIGHT, t)
  }

  /**
   * Moves the current card from its grid position to the pile via a parabolic arc,
   * flipping it face-down during the second half of the flight.
   */
  private updateCard(dt: number): void {
    if (this.currentIndex >= this.cards.length) return

    this.cardTimer += dt
    const raw = Math.min(1, this.cardTimer / CARD_DEAL_DURATION)
    const t = ease(raw)

    const card = this.cards[this.currentIndex]
    const start = this.startPositions[this.currentIndex]

    // XZ: smooth glide to pile center
    card.object.position.x = THREE.MathUtils.lerp(start.x, this.pileX, t)
    card.object.position.z = THREE.MathUtils.lerp(start.z, this.pileZ, t)

    // Y: parabolic arc peaks at mid-flight
    card.object.position.y = CARD_Y_OFFSET + CARD_ARC_HEIGHT * Math.sin(raw * Math.PI)

    // Rotation: flip face-down during the second half of the arc
    const flipT = ease(Math.max(0, (raw - 0.5) * 2))
    card.object.rotation.z = flipT * Math.PI

    if (raw >= 1) {
      this.landCard(card)
    }
  }

  /** Snaps a card to its final resting position in the pile */
  private landCard(card: Card): void {
    // Tiny Y stack offset prevents z-fighting between piled cards
    card.object.position.set(this.pileX, CARD_Y_OFFSET + this.currentIndex * 0.0005, this.pileZ)
    card.object.rotation.z = Math.PI

    this.currentIndex++
    this.cardTimer = 0

    if (this.currentIndex >= this.cards.length) {
      this.isComplete = true
    }
  }
}
