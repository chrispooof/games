import * as THREE from "three"
import { Card } from "../../../shared/types/deck"
import { CARD_DRAG_Y, CARD_Y_OFFSET, FOUNDATION_SNAP_RADIUS } from "../utils/constants"
import type { FoundationSlot } from "../world/foundations"

/** A work pile drop target — cards snapped here are played to this pile */
export interface WorkPileSlot {
  x: number
  z: number
  /** Work pile index 0–3 in the local player's row */
  index: number
}

/**
 * Handles drag-and-drop interaction for cards in the 3D scene.
 *
 * On mousedown, picks the top card under the cursor, lifts it, and tracks
 * it across a horizontal plane. On mouseup the card snaps to the nearest
 * foundation slot or work pile slot (if within FOUNDATION_SNAP_RADIUS),
 * then the `onCardDrop` callback fires.
 *
 * If the server rejects an action, call `snapBackCard(cardId)` to return
 * the card to its pre-drag position.
 *
 * When the user clicks near the stock pile position (and no card is
 * picked up), the `onStockClick` callback fires.
 */
export class DragControls {
  private camera: THREE.PerspectiveCamera
  private domElement: HTMLElement
  private cards: Card[]
  private raycaster = new THREE.Raycaster()

  /**
   * Horizontal plane at CARD_DRAG_Y used to convert mouse coordinates to
   * world-space during a drag.
   */
  private dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -CARD_DRAG_Y)

  private dragging: Card | null = null

  /** Foundation slot positions used to snap dropped cards */
  private foundationSlots: FoundationSlot[] = []

  /** Work pile positions used to snap dropped cards */
  private workPileSlots: WorkPileSlot[] = []

  /** Stock pile world position — click here (no card hit) triggers onStockClick */
  private stockPosition: { x: number; z: number } | null = null

  /** Fired when the user clicks near the stock pile without picking up a card */
  private onStockClickCallback: (() => void) | null = null

  /** Offset from the card's origin to the initial pick point — prevents snapping on grab */
  private dragOffset = new THREE.Vector3()

  /** Reusable target vector for plane intersection to avoid per-frame allocation */
  private planeHit = new THREE.Vector3()

  /**
   * World-space position (x, z) of each card before the most recent drag.
   * Used by `snapBackCard` to revert a server-rejected move.
   */
  private preDragPositions = new Map<string, { x: number; z: number }>()

  /**
   * Fired after a card is dropped.
   * `foundationSlotIndex` — index into FoundationArea.slots (null = no snap)
   * `workPileIndex` — local work pile 0–3 (null = no snap)
   */
  private onCardDrop?: (
    cardId: string,
    position: { x: number; z: number },
    foundationSlotIndex: number | null,
    workPileIndex: number | null
  ) => void

  /**
   * @param camera - The scene camera used for raycasting
   * @param domElement - The canvas element to attach mouse listeners to
   * @param cards - Array of draggable cards (may be populated after construction)
   * @param onCardDrop - Callback invoked when a card is released
   */
  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    cards: Card[],
    onCardDrop?: (
      cardId: string,
      position: { x: number; z: number },
      foundationSlotIndex: number | null,
      workPileIndex: number | null
    ) => void
  ) {
    this.camera = camera
    this.domElement = domElement
    this.cards = cards
    this.onCardDrop = onCardDrop
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

  /** Replaces the card list used for raycasting and dragging */
  setCards(cards: Card[]): void {
    this.cards = cards
  }

  /** Updates the foundation snap targets */
  setFoundationSlots(slots: FoundationSlot[]): void {
    this.foundationSlots = slots
  }

  /** Updates the work pile snap targets */
  setWorkPileSlots(slots: WorkPileSlot[]): void {
    this.workPileSlots = slots
  }

  /**
   * Registers the stock pile position and click handler.
   * A click within FOUNDATION_SNAP_RADIUS of this position (when no card is picked up)
   * triggers `onStockClick`.
   */
  setStockPile(position: { x: number; z: number }, onStockClick: () => void): void {
    this.stockPosition = position
    this.onStockClickCallback = onStockClick
  }

  /**
   * Returns the card identified by `cardId` to its position before the last drag.
   * Called when the server responds with `ok: false`.
   */
  snapBackCard(cardId: string): void {
    const pos = this.preDragPositions.get(cardId)
    if (!pos) return
    const card = this.cards.find((c) => c.id === cardId)
    if (!card) return
    card.object.position.x = pos.x
    card.object.position.z = pos.z
    card.object.position.y = CARD_Y_OFFSET
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

    if (!hit) {
      // No card picked up — check for stock pile click
      if (this.stockPosition && this.onStockClickCallback) {
        const planePoint = this.raycastPlane(ndc)
        if (planePoint) {
          const dx = planePoint.x - this.stockPosition.x
          const dz = planePoint.z - this.stockPosition.z
          if (dx * dx + dz * dz < FOUNDATION_SNAP_RADIUS ** 2) {
            this.onStockClickCallback()
          }
        }
      }
      return
    }

    const card = this.resolveCard(hit.object)
    if (!card) return

    // Record the card's position before lifting so we can snap back on rejection
    this.preDragPositions.set(card.id, {
      x: card.object.position.x,
      z: card.object.position.z,
    })

    this.dragging = card
    card.object.position.y = CARD_DRAG_Y

    // Store pick-point offset so the card doesn't snap to the cursor center on grab
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

    let px = this.dragging.object.position.x
    let pz = this.dragging.object.position.z
    let nearestDist = FOUNDATION_SNAP_RADIUS
    let snapAngle: number | null = null
    let snappedFoundationIndex: number | null = null
    let snappedWorkPileIndex: number | null = null

    // 1. Check foundation slots (takes priority — rotate card to match slot angle)
    for (let i = 0; i < this.foundationSlots.length; i++) {
      const slot = this.foundationSlots[i]
      const dist = Math.sqrt((px - slot.x) ** 2 + (pz - slot.z) ** 2)
      if (dist < nearestDist) {
        nearestDist = dist
        px = slot.x
        pz = slot.z
        snapAngle = slot.angle
        snappedFoundationIndex = i
      }
    }

    // 2. Check work pile slots only when no foundation snap was found
    if (snappedFoundationIndex === null) {
      nearestDist = FOUNDATION_SNAP_RADIUS
      for (const wp of this.workPileSlots) {
        const dist = Math.sqrt((px - wp.x) ** 2 + (pz - wp.z) ** 2)
        if (dist < nearestDist) {
          nearestDist = dist
          px = wp.x
          pz = wp.z
          snappedWorkPileIndex = wp.index
        }
      }
    }

    this.dragging.object.position.x = px
    this.dragging.object.position.z = pz
    if (snapAngle !== null) {
      this.dragging.object.rotation.y = snapAngle
    }
    this.dragging.object.position.y = CARD_Y_OFFSET

    this.onCardDrop?.(
      this.dragging.id,
      { x: px, z: pz },
      snappedFoundationIndex,
      snappedWorkPileIndex
    )

    this.dragging = null
  }
}
