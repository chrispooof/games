import * as THREE from "three"
import { Card } from "../../../shared/types/deck"
import { CARD_DRAG_Y, CARD_Y_OFFSET } from "../utils/constants"

/**
 * Handles drag-and-drop interaction for cards in the 3D scene.
 * On mousedown it picks the card under the cursor, lifts it, and tracks it across
 * a horizontal plane until mouseup where it settles back onto the table surface.
 */
export class DragControls {
  private camera: THREE.PerspectiveCamera
  private domElement: HTMLElement
  private cards: Card[]
  private raycaster = new THREE.Raycaster()

  /**
   * Horizontal plane at CARD_DRAG_Y used to convert mouse position to world-space
   * coordinates during a drag. THREE.Plane equation: dot(normal, point) + constant = 0,
   * so constant = -y to place the plane at y = CARD_DRAG_Y.
   */
  private dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -CARD_DRAG_Y)

  private dragging: Card | null = null

  /** Offset from the card's origin to the initial pick point — prevents snapping on grab */
  private dragOffset = new THREE.Vector3()

  /** Reusable target vector for plane intersection to avoid per-frame allocation */
  private planeHit = new THREE.Vector3()

  /**
   * @param camera - The scene camera used for raycasting
   * @param domElement - The canvas element to attach mouse listeners to
   * @param cards - Array of draggable cards (may be populated after construction)
   */
  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement, cards: Card[]) {
    this.camera = camera
    this.domElement = domElement
    this.cards = cards
  }

  /** Attaches mousedown / mousemove / mouseup listeners to the canvas */
  attach() {
    this.domElement.addEventListener("mousedown", this.onMouseDown)
    this.domElement.addEventListener("mousemove", this.onMouseMove)
    this.domElement.addEventListener("mouseup", this.onMouseUp)
  }

  /** Removes all mouse listeners from the canvas */
  detach() {
    this.domElement.removeEventListener("mousedown", this.onMouseDown)
    this.domElement.removeEventListener("mousemove", this.onMouseMove)
    this.domElement.removeEventListener("mouseup", this.onMouseUp)
  }

  /** Converts a MouseEvent to normalized device coordinates (NDC) */
  private getNDC(event: MouseEvent): THREE.Vector2 {
    const rect = this.domElement.getBoundingClientRect()
    return new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    )
  }

  /**
   * Walks the object hierarchy from a hit mesh up to find the owning Card.
   * Necessary because the raycaster hits child meshes inside a card Group.
   */
  private resolveCard(hitObject: THREE.Object3D): Card | null {
    return (
      this.cards.find((c) => {
        if (!c.object) return false
        let node: THREE.Object3D | null = hitObject
        while (node) {
          if (node === c.object) return true
          node = node.parent
        }
        return false
      }) ?? null
    )
  }

  /** Casts a ray from NDC coordinates and returns the intersection point on the drag plane */
  private raycastPlane(ndc: THREE.Vector2): THREE.Vector3 | null {
    this.raycaster.setFromCamera(ndc, this.camera)
    const hit = this.raycaster.ray.intersectPlane(this.dragPlane, this.planeHit)
    return hit ? this.planeHit.clone() : null
  }

  private onMouseDown = (event: MouseEvent) => {
    const ndc = this.getNDC(event)
    this.raycaster.setFromCamera(ndc, this.camera)

    const cardObjects = this.cards.flatMap((c) => (c.object ? [c.object] : []))
    const [hit] = this.raycaster.intersectObjects(cardObjects, true)
    if (!hit) return

    const card = this.resolveCard(hit.object)
    if (!card) return

    this.dragging = card

    // Lift card above the table surface while dragging
    card.object.position.y = CARD_DRAG_Y

    // Store the offset between card origin and the pick point so the card
    // doesn't snap to the cursor center when grabbed
    const planePoint = this.raycastPlane(ndc)
    if (planePoint) {
      this.dragOffset.set(
        planePoint.x - card.object.position.x,
        0,
        planePoint.z - card.object.position.z
      )
    }
  }

  private onMouseMove = (event: MouseEvent) => {
    if (!this.dragging) return

    const planePoint = this.raycastPlane(this.getNDC(event))
    if (!planePoint) return

    this.dragging.object.position.x = planePoint.x - this.dragOffset.x
    this.dragging.object.position.z = planePoint.z - this.dragOffset.z
  }

  private onMouseUp = () => {
    if (!this.dragging) return

    // Settle the card back onto the table surface
    this.dragging.object.position.y = CARD_Y_OFFSET
    this.dragging = null
  }
}
