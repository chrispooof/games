import * as THREE from "three"
import { Card } from "../../../shared/types/deck"
import { DECK_CARD_NAME_CONFIG } from "../../../shared/config/deck"
import { parseCardConfig } from "../../../shared/utils/deck"
import { CARD_Y_OFFSET, COL_GAP, COLS, ROW_GAP } from "../utils/constants"

/** One distinct back color per player (cycles after 6) */
export const PLAYER_BACK_COLORS: number[] = [
  0xc0392b, // player 0 — red
  0x2980b9, // player 1 — blue
  0x27ae60, // player 2 — green
  0xf39c12, // player 3 — orange
  0x8e44ad, // player 4 — purple
  0x16a085, // player 5 — teal
]

/** Seat transform describing where a player's deck sits on the table */
export interface Seat {
  /** World-space center X of this player's grid area */
  x: number
  /** World-space center Z of this player's grid area */
  z: number
  /** Y-axis rotation (radians) applied to each card and the grid layout */
  angle: number
}

/**
 * Represents a single player's full 52-card deck in the 3D scene.
 * Clones meshes from the source GLB so each player owns independent objects,
 * then tints the card-back material with the player's unique color.
 */
export class PlayerDeck {
  readonly playerIndex: number
  readonly backColor: number
  readonly cards: Card[] = []

  /** @param playerIndex - Zero-based index, used for color selection */
  constructor(playerIndex: number) {
    this.playerIndex = playerIndex
    this.backColor = PLAYER_BACK_COLORS[playerIndex % PLAYER_BACK_COLORS.length]
  }

  /**
   * Clones all 52 cards from the GLB source scene, tints their back materials,
   * positions them at the given seat around the table, and adds them to the scene.
   * The grid is rotated by `seat.angle` so the player faces the table center.
   * @param deckScene - The loaded GLB scene used as the mesh template
   * @param scene - The Three.js scene to add card objects into
   * @param seat - World-space position and Y-rotation for this player's area
   * @returns The array of Card objects created for this player
   */
  buildFromGLB(deckScene: THREE.Object3D, scene: THREE.Scene, seat: Seat): Card[] {
    const totalCols = COLS
    const totalRows = Math.ceil(DECK_CARD_NAME_CONFIG.length / totalCols)
    const offsetX = ((totalCols - 1) * COL_GAP) / 2
    const offsetZ = ((totalRows - 1) * ROW_GAP) / 2

    // Fisher-Yates shuffle so each player gets a randomized card layout
    const shuffledNames = [...DECK_CARD_NAME_CONFIG]
    for (let i = shuffledNames.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffledNames[i], shuffledNames[j]] = [shuffledNames[j], shuffledNames[i]]
    }

    const cos = Math.cos(seat.angle)
    const sin = Math.sin(seat.angle)

    shuffledNames.forEach((name, index) => {
      const source = deckScene.getObjectByName(name)
      if (!source) {
        console.warn(`Card object not found in GLB: ${name}`)
        return
      }

      const cloned = source.clone(true)
      this.applyBackColor(cloned)

      const { suit, rank, value } = parseCardConfig(name)
      // Prefix with player index so every card has a scene-wide unique ID
      const cardId = `p${this.playerIndex}_${name}`
      const card = new Card(cardId, suit, rank, value, true, cloned, () =>
        console.log("Card clicked:", cardId)
      )
      this.cards.push(card)

      // Local grid offset (card position relative to seat center)
      const col = index % totalCols
      const row = Math.floor(index / totalCols)
      const localX = col * COL_GAP - offsetX
      const localZ = row * ROW_GAP - offsetZ

      // Rotate grid by seat angle (Three.js Y-axis rotation matrix):
      //   x' = localX * cos(θ) + localZ * sin(θ)
      //   z' = -localX * sin(θ) + localZ * cos(θ)
      cloned.position.set(
        seat.x + localX * cos + localZ * sin,
        CARD_Y_OFFSET,
        seat.z - localX * sin + localZ * cos
      )
      cloned.rotation.y = seat.angle
      cloned.castShadow = true
      scene.add(cloned)
    })

    return this.cards
  }

  /**
   * Traverses all Mesh children in a cloned card object, clones each material to
   * avoid mutating the shared GLB source, then sets the color on materials whose
   * names contain "back" (case-insensitive). Falls back to tinting all materials
   * if none carry that name.
   */
  private applyBackColor(object: THREE.Object3D): void {
    const allMeshes: THREE.Mesh[] = []
    const backMeshes: THREE.Mesh[] = []

    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      allMeshes.push(child)
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      if (mats.some((m: THREE.Material) => m.name.toLowerCase().includes("back"))) {
        backMeshes.push(child)
      }
    })

    if (backMeshes.length === 0) {
      console.warn(
        `No back-named material found for player ${this.playerIndex} — tinting all materials`
      )
    }

    const targets = backMeshes.length > 0 ? backMeshes : allMeshes
    for (const mesh of targets) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const tinted = mats.map((m: THREE.Material) => {
        const clonedMat = m.clone()
        if (
          clonedMat instanceof THREE.MeshStandardMaterial ||
          clonedMat instanceof THREE.MeshBasicMaterial
        ) {
          clonedMat.color.setHex(this.backColor)
        }
        return clonedMat
      })
      mesh.material = Array.isArray(mesh.material) ? tinted : tinted[0]
    }
  }
}
