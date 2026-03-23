import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as THREE from "three"
import { DragControls } from "./player"
import { Card } from "../../../shared/types/deck"
import { CARD_DRAG_Y, CARD_Y_OFFSET } from "../utils/constants"

/** Fires a MouseEvent on an element with predictable coordinates inside an 800×600 canvas */
const fireEvent = (element: HTMLElement, type: string, x = 400, y = 300) => {
  element.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }))
}

describe("DragControls", () => {
  let camera: THREE.PerspectiveCamera
  let domElement: HTMLCanvasElement
  let mockObject: THREE.Object3D
  let card: Card
  let cards: Card[]
  let controls: DragControls

  beforeEach(() => {
    // Stub THREE raycaster methods so tests don't depend on WebGL or real geometry
    vi.spyOn(THREE.Raycaster.prototype, "setFromCamera").mockImplementation(() => {})
    vi.spyOn(THREE.Raycaster.prototype, "intersectObjects").mockReturnValue([])
    vi.spyOn(THREE.Ray.prototype, "intersectPlane").mockImplementation(function (
      _plane: THREE.Plane,
      target: THREE.Vector3
    ): THREE.Vector3 {
      target.set(0, CARD_DRAG_Y, 0)
      return target
    })

    camera = new THREE.PerspectiveCamera()
    domElement = document.createElement("canvas")
    vi.spyOn(domElement, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => {},
    } as DOMRect)

    mockObject = new THREE.Object3D()
    mockObject.position.set(0, CARD_Y_OFFSET, 0)
    card = new Card("Card_A_clubs", "clubs", "A", 1, true, mockObject)
    cards = [card]

    controls = new DragControls(camera, domElement, cards)
  })

  afterEach(() => {
    controls.detach()
    vi.restoreAllMocks()
  })

  describe("attach / detach", () => {
    it("attach() registers mousedown, mousemove, and mouseup listeners", () => {
      const spy = vi.spyOn(domElement, "addEventListener")
      controls.attach()
      const types = spy.mock.calls.map(([type]) => type)
      expect(types).toContain("mousedown")
      expect(types).toContain("mousemove")
      expect(types).toContain("mouseup")
    })

    it("detach() removes mousedown, mousemove, and mouseup listeners", () => {
      controls.attach()
      const spy = vi.spyOn(domElement, "removeEventListener")
      controls.detach()
      const types = spy.mock.calls.map(([type]) => type)
      expect(types).toContain("mousedown")
      expect(types).toContain("mousemove")
      expect(types).toContain("mouseup")
    })
  })

  describe("mousedown", () => {
    beforeEach(() => controls.attach())

    it("lifts the card to CARD_DRAG_Y when hit", () => {
      vi.mocked(THREE.Raycaster.prototype.intersectObjects).mockReturnValue([
        { object: mockObject } as unknown as THREE.Intersection,
      ])
      fireEvent(domElement, "mousedown")
      expect(mockObject.position.y).toBe(CARD_DRAG_Y)
    })

    it("does not change card position when no object is hit", () => {
      vi.mocked(THREE.Raycaster.prototype.intersectObjects).mockReturnValue([])
      fireEvent(domElement, "mousedown")
      expect(mockObject.position.y).toBe(CARD_Y_OFFSET)
    })
  })

  describe("mousemove", () => {
    beforeEach(() => controls.attach())

    it("moves the card's x/z position when a drag is in progress", () => {
      // Start drag — intersectPlane returns (0,_,0) so offset = (0,0,0)
      vi.mocked(THREE.Raycaster.prototype.intersectObjects).mockReturnValue([
        { object: mockObject } as unknown as THREE.Intersection,
      ])
      fireEvent(domElement, "mousedown")

      // Move — update intersectPlane to return a new world position
      vi.mocked(THREE.Ray.prototype.intersectPlane).mockImplementation(function (
        _plane: THREE.Plane,
        target: THREE.Vector3
      ): THREE.Vector3 {
        target.set(3, CARD_DRAG_Y, 5)
        return target
      })
      fireEvent(domElement, "mousemove")

      expect(mockObject.position.x).toBeCloseTo(3)
      expect(mockObject.position.z).toBeCloseTo(5)
    })

    it("does not move the card when no drag is in progress", () => {
      fireEvent(domElement, "mousemove")
      expect(mockObject.position.x).toBe(0)
      expect(mockObject.position.z).toBe(0)
    })
  })

  describe("mouseup", () => {
    beforeEach(() => controls.attach())

    it("settles the card back to CARD_Y_OFFSET after a drag", () => {
      vi.mocked(THREE.Raycaster.prototype.intersectObjects).mockReturnValue([
        { object: mockObject } as unknown as THREE.Intersection,
      ])
      fireEvent(domElement, "mousedown")
      expect(mockObject.position.y).toBe(CARD_DRAG_Y)

      fireEvent(domElement, "mouseup")
      expect(mockObject.position.y).toBe(CARD_Y_OFFSET)
    })

    it("does not throw when no drag is in progress", () => {
      expect(() => fireEvent(domElement, "mouseup")).not.toThrow()
    })
  })

  describe("stock pile click", () => {
    beforeEach(() => controls.attach())

    it("fires onStockClick when clicking near stock pile with no picked card", () => {
      const onStockClick = vi.fn()
      controls.setStockPile({ x: 0, z: 0 }, onStockClick)
      vi.mocked(THREE.Raycaster.prototype.intersectObjects).mockReturnValue([])

      // intersectPlane is already stubbed to return (0, CARD_DRAG_Y, 0)
      fireEvent(domElement, "mousedown")

      expect(onStockClick).toHaveBeenCalledTimes(1)
    })

    it("does not fire onStockClick when click is outside stock snap radius", () => {
      const onStockClick = vi.fn()
      controls.setStockPile({ x: 0, z: 0 }, onStockClick)
      vi.mocked(THREE.Raycaster.prototype.intersectObjects).mockReturnValue([])
      vi.mocked(THREE.Ray.prototype.intersectPlane).mockImplementation(function (
        _plane: THREE.Plane,
        target: THREE.Vector3
      ): THREE.Vector3 {
        target.set(10, CARD_DRAG_Y, 10)
        return target
      })

      fireEvent(domElement, "mousedown")

      expect(onStockClick).not.toHaveBeenCalled()
    })
  })
})
