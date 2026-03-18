import * as THREE from "three"

/**
 * Base class for any 3D object that can be interacted with via mouse events.
 * Wraps a Three.js Object3D with click and hover callbacks.
 */
export class Interactable {
  mesh: THREE.Object3D
  onClick: () => void
  onHover: () => void

  /**
   * @param mesh - The Three.js object to make interactable
   * @param onClick - Callback fired when the object is clicked
   * @param onHover - Callback fired when the object is hovered
   */
  constructor(
    mesh: THREE.Object3D,
    { onClick, onHover }: { onClick: () => void; onHover: () => void }
  ) {
    this.mesh = mesh
    this.onClick = onClick
    this.onHover = onHover
  }
}
