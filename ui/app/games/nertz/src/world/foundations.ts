import * as THREE from "three"
import { CARD_DEPTH, CARD_WIDTH, CARD_Y_OFFSET } from "../utils/constants"

/** Spacing between foundation slots within a player's row */
const FOUNDATION_SLOT_GAP = 0.7

/** World-space center of a single foundation pile slot */
export interface FoundationSlot {
  /** World-space X position of this slot's center */
  x: number
  /** World-space Z position of this slot's center */
  z: number
  /** Y-axis rotation (radians) matching the owning player's seat angle */
  angle: number
}

/**
 * Renders card-shaped outline placeholders for all foundation piles in the center of the table.
 * In Nertz each player contributes 4 foundations (one per suit), so total slots = numPlayers * 4.
 *
 * Layout: each player gets a row of 4 slots arranged radially from the table center toward their
 * seat, at a computed radius that keeps adjacent player groups from overlapping. Each slot outline
 * is rotated by the player's seat angle so it faces the same direction as their cards.
 */
export class FoundationArea extends THREE.Group {
  /** All foundation slot positions, used by DragControls for card snap detection */
  readonly slots: FoundationSlot[]

  /** @param numPlayers - Total number of players; determines slot count and layout radius */
  constructor(numPlayers: number) {
    super()

    this.slots = []

    // Compute the minimum radius so adjacent player groups don't overlap, then add padding
    // so the outermost slots of neighboring groups have clear visual separation.
    const totalRowWidth = 3 * FOUNDATION_SLOT_GAP
    const minRadius = numPlayers > 1 ? totalRowWidth / (2 * Math.sin(Math.PI / numPlayers)) : 1.2
    const groupRadius = Math.max(1.2, minRadius + 1.2)

    for (let playerIdx = 0; playerIdx < numPlayers; playerIdx++) {
      // Same angle formula as game.ts computeSeat so positions match perfectly
      const angle = (2 * Math.PI * playerIdx) / numPlayers

      // Direction from center toward this player's seat
      const radialX = Math.sin(angle)
      const radialZ = Math.cos(angle)

      // Perpendicular direction (for spreading the 4 slots in a horizontal row)
      const perpX = Math.cos(angle)
      const perpZ = -Math.sin(angle)

      // Center of this player's foundation group
      const groupX = radialX * groupRadius
      const groupZ = radialZ * groupRadius

      for (let col = 0; col < 4; col++) {
        const offset = col * FOUNDATION_SLOT_GAP - totalRowWidth / 2
        const x = groupX + perpX * offset
        const z = groupZ + perpZ * offset

        this.slots.push({ x, z, angle })
        this.add(this.createSlotOutline(x, z, angle))
      }
    }
  }

  /**
   * Creates a card-shaped outline (LineLoop) at the given position, rotated to face the player
   * at `angle` so the slot appears upright from their perspective.
   */
  private createSlotOutline(x: number, z: number, angle: number): THREE.LineLoop {
    const hw = CARD_WIDTH / 2
    const hd = CARD_DEPTH / 2

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
    // Place just above the felt; rotate to match this player's card orientation
    line.position.set(x, CARD_Y_OFFSET + 0.002, z)
    line.rotation.y = angle
    return line
  }
}
