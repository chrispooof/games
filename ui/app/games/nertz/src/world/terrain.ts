import * as THREE from "three"
import {
  BORDER_COLOR,
  BORDER_Y_OFFSET,
  FELT_COLOR,
  FELT_ROUGHNESS,
  TABLE_BORDER_PADDING,
} from "../utils/constants"

/**
 * A round game table composed of a circular green felt surface and a wood border ring.
 * Rendered as a Three.js Group so both layers can be positioned together.
 */
export class Table extends THREE.Group {
  /**
   * @param radius - Radius of the felt playing surface (in world units)
   */
  constructor(radius: number) {
    super()

    const segments = 64

    // Green felt playing surface
    const felt = new THREE.Mesh(
      new THREE.CircleGeometry(radius, segments),
      new THREE.MeshStandardMaterial({ color: FELT_COLOR, roughness: FELT_ROUGHNESS, metalness: 0 })
    )
    felt.rotation.x = -Math.PI / 2
    felt.receiveShadow = true
    this.add(felt)

    // Slightly larger wood border rendered just below the felt to avoid z-fighting
    const border = new THREE.Mesh(
      new THREE.CircleGeometry(radius + TABLE_BORDER_PADDING, segments),
      new THREE.MeshStandardMaterial({ color: BORDER_COLOR, roughness: 1 })
    )
    border.rotation.x = -Math.PI / 2
    border.position.y = BORDER_Y_OFFSET
    this.add(border)
  }
}
