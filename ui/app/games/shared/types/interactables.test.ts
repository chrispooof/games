import { describe, it, expect, vi } from "vitest"
import * as THREE from "three"
import { Interactable } from "./interactables"

describe("Interactable", () => {
  const makeMesh = () => new THREE.Object3D()

  it("stores the mesh reference", () => {
    const mesh = makeMesh()
    const obj = new Interactable(mesh, { onClick: () => {}, onHover: () => {} })
    expect(obj.mesh).toBe(mesh)
  })

  it("stores and invokes the onClick callback", () => {
    const onClick = vi.fn()
    const obj = new Interactable(makeMesh(), { onClick, onHover: () => {} })
    obj.onClick()
    expect(onClick).toHaveBeenCalledOnce()
  })

  it("stores and invokes the onHover callback", () => {
    const onHover = vi.fn()
    const obj = new Interactable(makeMesh(), { onClick: () => {}, onHover })
    obj.onHover()
    expect(onHover).toHaveBeenCalledOnce()
  })
})
