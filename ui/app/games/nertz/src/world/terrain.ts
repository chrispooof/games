import * as THREE from "three"
import {
  BORDER_COLOR,
  BORDER_Y_OFFSET,
  FELT_COLOR,
  FELT_ROUGHNESS,
  TABLE_BORDER_PADDING,
} from "../utils/constants"

/**
 * A flat game table composed of a green felt surface and a darker wood border.
 * Rendered as a Three.js Group so both layers can be positioned together.
 */
export class Table extends THREE.Group {
  /**
   * @param width - Table width along the X axis (in world units)
   * @param depth - Table depth along the Z axis (in world units)
   */
  constructor(width: number, depth: number) {
    super()

    // Green felt playing surface
    const felt = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({ color: FELT_COLOR, roughness: FELT_ROUGHNESS, metalness: 0 })
    )
    felt.rotation.x = -Math.PI / 2
    felt.receiveShadow = true
    this.add(felt)

    // Slightly larger wood border rendered just below the felt to avoid z-fighting
    const border = new THREE.Mesh(
      new THREE.PlaneGeometry(width + TABLE_BORDER_PADDING, depth + TABLE_BORDER_PADDING),
      new THREE.MeshStandardMaterial({ color: BORDER_COLOR, roughness: 1 })
    )
    border.rotation.x = -Math.PI / 2
    border.position.y = BORDER_Y_OFFSET
    this.add(border)
  }
}
