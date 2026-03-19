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

/** Z-axis gap between each player's card grid (world units) */
const DECK_Z_SPACING = 1.5

/**
 * Represents a single player's full 52-card deck in the 3D scene.
 * Clones meshes from the source GLB so each player owns independent objects,
 * then tints the card-back material with the player's unique color.
 */
export class PlayerDeck {
  readonly playerIndex: number
  readonly backColor: number
  readonly cards: Card[] = []

  /** @param playerIndex - Zero-based index, used for color selection and Z positioning */
  constructor(playerIndex: number) {
    this.playerIndex = playerIndex
    this.backColor = PLAYER_BACK_COLORS[playerIndex % PLAYER_BACK_COLORS.length]
  }

  /**
   * Clones all 52 cards from the GLB source scene, tints their back materials,
   * positions them in this player's grid band, and adds them to the scene.
   * @param deckScene - The loaded GLB scene used as the mesh template
   * @param scene - The Three.js scene to add card objects into
   * @returns The array of Card objects created for this player
   */
  buildFromGLB(deckScene: THREE.Object3D, scene: THREE.Scene): Card[] {
    const totalCols = COLS
    const totalRows = Math.ceil(DECK_CARD_NAME_CONFIG.length / totalCols)
    const offsetX = ((totalCols - 1) * COL_GAP) / 2
    const offsetZ = ((totalRows - 1) * ROW_GAP) / 2

    // Offset each player's grid along Z so decks don't overlap
    const deckDepth = totalRows * ROW_GAP
    const playerZOffset = this.playerIndex * (deckDepth + DECK_Z_SPACING)

    // Fisher-Yates shuffle so each player gets a randomized card layout
    const shuffledNames = [...DECK_CARD_NAME_CONFIG]
    for (let i = shuffledNames.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffledNames[i], shuffledNames[j]] = [shuffledNames[j], shuffledNames[i]]
    }

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

      const col = index % totalCols
      const row = Math.floor(index / totalCols)
      cloned.position.set(
        col * COL_GAP - offsetX,
        CARD_Y_OFFSET,
        row * ROW_GAP - offsetZ + playerZOffset
      )
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
