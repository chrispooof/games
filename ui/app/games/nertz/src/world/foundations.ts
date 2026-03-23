import * as THREE from "three"
import { CARD_DEPTH, CARD_WIDTH, CARD_Y_OFFSET, FOUNDATION_OUTLINE_SCALE } from "../utils/constants"
import { computeFoundationSlots } from "../utils/geometry"

/** World-space center of a single foundation pile slot */
export interface FoundationSlot {
  /** World-space X position of this slot's center */
  x: number
  /** World-space Z position of this slot's center */
  z: number
  /** Y-axis rotation (radians) — always 0 in the row-based layout */
  angle: number
}

/**
 * Renders card-shaped outline placeholders for all foundation piles at the table center.
 * In Nertz each player contributes 4 foundations (one per suit), so total slots = numPlayers * 4.
 *
 * Layout: slots are arranged in centered rows of up to 8, evenly distributed.
 * All slots face angle 0 (no per-player rotation) for the angled camera view.
 */
export class FoundationArea extends THREE.Group {
  /** All foundation slot positions, used by DragControls for card snap detection */
  readonly slots: FoundationSlot[]

  /** @param numPlayers - Total number of players; determines slot count and row layout */
  constructor(numPlayers: number) {
    super()

    const transforms = computeFoundationSlots(numPlayers)
    this.slots = transforms.map((t) => ({ x: t.x, z: t.z, angle: t.angle }))

    for (const slot of this.slots) {
      this.add(this.createSlotOutline(slot.x, slot.z))
    }
  }

  /** Creates a scaled card-shaped outline (LineLoop) at the given position */
  private createSlotOutline(x: number, z: number): THREE.LineLoop {
    const hw = (CARD_WIDTH * FOUNDATION_OUTLINE_SCALE) / 2
    const hd = (CARD_DEPTH * FOUNDATION_OUTLINE_SCALE) / 2

    const points = [
      new THREE.Vector3(-hw, 0, -hd),
      new THREE.Vector3(hw, 0, -hd),
      new THREE.Vector3(hw, 0, hd),
      new THREE.Vector3(-hw, 0, hd),
    ]

    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      opacity: 0.35,
      transparent: true,
    })

    const line = new THREE.LineLoop(geometry, material)
    line.position.set(x, CARD_Y_OFFSET + 0.002, z)
    return line
  }
}
