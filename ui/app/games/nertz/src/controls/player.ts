import * as THREE from "three"
import { Card } from "../../../shared/types/deck"
import { CARD_DRAG_Y, CARD_Y_OFFSET, FOUNDATION_SNAP_RADIUS } from "../utils/constants"
import type { FoundationSlot } from "../world/foundations"

/** A work pile drop target — cards snapped here are played to this pile */
export interface WorkPileSlot {
  /** Snap target position — where the next card will land (end of fan) */
  x: number
  z: number
  /** Base of the pile (index 0 position) — used for segment hit detection */
  baseX: number
  baseZ: number
  /** Work pile index 0–3 in the local player's row */
  index: number
}

/**
 * Returns the nearest point on segment AB to point P (clamped to the segment).
 * Used to detect drops anywhere along a fanned work pile, not just at the tip.
 */
const closestPointOnSegment = (
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): { x: number; z: number } => {
  const abx = bx - ax
  const abz = bz - az
  const len2 = abx * abx + abz * abz
  if (len2 === 0) return { x: ax, z: az }
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / len2))
  return { x: ax + t * abx, z: az + t * abz }
}

/**
 * Handles drag-and-drop interaction for cards in the 3D scene.
 *
 * On mousedown, picks the card under the cursor and lifts it (plus any cards
 * above it in a work pile group) and tracks them across a horizontal plane.
 * On mouseup, the root card snaps to the nearest foundation or work pile slot
 * (if within FOUNDATION_SNAP_RADIUS), then the `onCardDrop` callback fires.
 *
 * If the server rejects an action, call `snapBackCard(cardId)` to return the
 * group to their pre-drag positions.
 *
 * When the user clicks near the stock pile position (and no card is picked up),
 * the `onStockClick` callback fires.
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

  /**
   * The group of cards being dragged. Index 0 is the root (picked card);
   * subsequent entries are cards above it in the work pile.
   */
  private draggingGroup: Card[] = []

  /** Foundation slot positions used to snap dropped cards */
  private foundationSlots: FoundationSlot[] = []

  /** Work pile positions used to snap dropped cards */
  private workPileSlots: WorkPileSlot[] = []

  /** Stock pile world position — click here (no card hit) triggers onStockClick */
  private stockPosition: { x: number; z: number } | null = null

  /** Fired when the user clicks near the stock pile without picking up a card */
  private onStockClickCallback: (() => void) | null = null

  /** Offset from the root card's origin to the initial pick point */
  private dragOffset = new THREE.Vector3()

  /** Reusable target vector for plane intersection to avoid per-frame allocation */
  private planeHit = new THREE.Vector3()

  /**
   * World-space position (x, z) of each card before the most recent drag.
   * Used by `snapBackCard` to revert a server-rejected move.
   */
  private preDragPositions = new Map<string, { x: number; z: number }>()

  /**
   * Maps each card ID to the full group that should drag with it.
   * Index 0 of each group is the card itself; the rest are cards above it
   * in the work pile. Set via `setCardGroups`.
   */
  private cardGroups = new Map<string, Card[]>()

  /**
   * Fired after a card group is dropped.
   * `cardId` — root card (bottom of dragged group)
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
   * @param onCardDrop - Callback invoked when a card group is released
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
   * A click within FOUNDATION_SNAP_RADIUS of this position (when no card is
   * picked up) triggers `onStockClick`.
   */
  setStockPile(position: { x: number; z: number }, onStockClick: () => void): void {
    this.stockPosition = position
    this.onStockClickCallback = onStockClick
  }

  /**
   * Sets drag groups for work pile cards. Each key is a card ID; the value is
   * an array starting with that card and continuing with every card above it in
   * the pile. When that card is picked up the entire group moves together.
   */
  setCardGroups(groups: Map<string, Card[]>): void {
    this.cardGroups = groups
  }

  /**
   * Returns all cards in the group that started with `cardId` to their
   * pre-drag positions. Called when the server responds with `ok: false`.
   */
  snapBackCard(cardId: string): void {
    const group = this.cardGroups.get(cardId) ?? []
    const targets = group.length > 0 ? group : (this.cards.filter((c) => c.id === cardId) as Card[])
    for (const card of targets) {
      const pos = this.preDragPositions.get(card.id)
      if (!pos) continue
      card.object.position.x = pos.x
      card.object.position.z = pos.z
      card.object.position.y = CARD_Y_OFFSET
    }
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

    const root = this.resolveCard(hit.object)
    if (!root) return

    // Build the drag group: root card + all cards above it in the same work pile
    const group = this.cardGroups.get(root.id) ?? [root]
    this.draggingGroup = group

    // Record pre-drag positions for every card in the group
    for (const gc of group) {
      this.preDragPositions.set(gc.id, {
        x: gc.object.position.x,
        z: gc.object.position.z,
      })
    }

    // Lift the group; each card above the root gets a tiny extra y so depth order
    // is preserved while dragging
    group.forEach((gc, i) => {
      gc.object.position.y = CARD_DRAG_Y + i * 0.01
    })

    // Store pick-point offset relative to root so the card doesn't snap to
    // cursor center on grab
    const planePoint = this.raycastPlane(ndc)
    if (planePoint) {
      this.dragOffset.set(
        planePoint.x - root.object.position.x,
        0,
        planePoint.z - root.object.position.z
      )
    }
  }

  private onMouseMove = (event: MouseEvent) => {
    if (!this.draggingGroup.length) return

    const planePoint = this.raycastPlane(this.getNDC(event))
    if (!planePoint) return

    const root = this.draggingGroup[0]
    const rootPreDrag = this.preDragPositions.get(root.id)!
    const newRootX = planePoint.x - this.dragOffset.x
    const newRootZ = planePoint.z - this.dragOffset.z

    // Move each card in the group, maintaining their XZ offsets relative to root
    for (const gc of this.draggingGroup) {
      const preDrag = this.preDragPositions.get(gc.id)!
      gc.object.position.x = newRootX + (preDrag.x - rootPreDrag.x)
      gc.object.position.z = newRootZ + (preDrag.z - rootPreDrag.z)
    }
  }

  private onMouseUp = () => {
    if (!this.draggingGroup.length) return

    const root = this.draggingGroup[0]
    const rootPreDrag = this.preDragPositions.get(root.id)!

    let px = root.object.position.x
    let pz = root.object.position.z
    let nearestDist = FOUNDATION_SNAP_RADIUS
    let snapAngle: number | null = null
    let snappedFoundationIndex: number | null = null
    let snappedWorkPileIndex: number | null = null

    // 1. Foundation snap — only for single-card drags (foundations take one card at a time)
    if (this.draggingGroup.length === 1) {
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
    }

    // 2. Work pile snap — when no foundation snap was found.
    // Uses closest-point-on-segment so dropping anywhere along a fanned pile
    // (not just the tip) registers as a hit.
    if (snappedFoundationIndex === null) {
      nearestDist = FOUNDATION_SNAP_RADIUS
      for (const wp of this.workPileSlots) {
        const closest = closestPointOnSegment(px, pz, wp.baseX, wp.baseZ, wp.x, wp.z)
        const dist = Math.sqrt((px - closest.x) ** 2 + (pz - closest.z) ** 2)
        if (dist < nearestDist) {
          nearestDist = dist
          // Always snap the card to the end of the fan (where it will land),
          // regardless of where along the pile the user dropped
          px = wp.x
          pz = wp.z
          snappedWorkPileIndex = wp.index
        }
      }
    }

    // Place root at snap position
    root.object.position.x = px
    root.object.position.z = pz
    root.object.position.y = CARD_Y_OFFSET
    if (snapAngle !== null) root.object.rotation.y = snapAngle

    // Place the rest of the group relative to root, maintaining their source offsets
    for (let i = 1; i < this.draggingGroup.length; i++) {
      const gc = this.draggingGroup[i]
      const preDrag = this.preDragPositions.get(gc.id)!
      gc.object.position.x = px + (preDrag.x - rootPreDrag.x)
      gc.object.position.z = pz + (preDrag.z - rootPreDrag.z)
      gc.object.position.y = CARD_Y_OFFSET
    }

    this.onCardDrop?.(root.id, { x: px, z: pz }, snappedFoundationIndex, snappedWorkPileIndex)

    this.draggingGroup = []
  }
}
