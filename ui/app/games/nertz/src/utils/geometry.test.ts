import { describe, expect, it } from "vitest"
import { computeDealPiles, computeFoundationSlots, computeSeat } from "./geometry"

describe("geometry utils", () => {
  describe("computeSeat", () => {
    it("places seat 0 on positive Z axis", () => {
      const seat = computeSeat(0, 8, 3)
      expect(seat.x).toBeCloseTo(0)
      expect(seat.z).toBeCloseTo(3)
      expect(seat.angle).toBeCloseTo(0)
    })

    it("places seat indices at evenly spaced angles", () => {
      const seat = computeSeat(2, 8, 3)
      expect(seat.angle).toBeCloseTo(Math.PI / 2)
      expect(seat.x).toBeCloseTo(3)
      expect(seat.z).toBeCloseTo(0)
    })
  })

  describe("computeDealPiles", () => {
    it("returns 7 piles centered around index 3", () => {
      const seat = { x: 0, z: 0, angle: 0 }
      const piles = computeDealPiles(seat, 2.5, 0.5)

      expect(piles).toHaveLength(7)
      expect(piles[3].x).toBeCloseTo(0)
      expect(piles[3].z).toBeCloseTo(2.0)
    })

    it("uses consistent 0.85 spacing along perpendicular axis", () => {
      const seat = { x: 0, z: 0, angle: 0 }
      const piles = computeDealPiles(seat, 2.5, 0.5)
      for (let i = 0; i < piles.length - 1; i++) {
        expect(piles[i + 1].x - piles[i].x).toBeCloseTo(0.85)
        expect(piles[i + 1].z - piles[i].z).toBeCloseTo(0)
      }
    })
  })

  describe("computeFoundationSlots", () => {
    it("uses one row when total slots fit in 8", () => {
      const slots = computeFoundationSlots(1)
      expect(slots).toHaveLength(4)
      const zValues = new Set(slots.map((s) => s.z.toFixed(6)))
      expect(zValues.size).toBe(1)
    })

    it("uses smallest divisible row count that keeps columns <= 8", () => {
      const slots = computeFoundationSlots(3) // 12 slots => 2 rows x 6 cols
      expect(slots).toHaveLength(12)
      const zValues = [...new Set(slots.map((s) => s.z.toFixed(6)))]
      expect(zValues).toHaveLength(2)
      for (const z of zValues) {
        const inRow = slots.filter((s) => s.z.toFixed(6) === z)
        expect(inRow).toHaveLength(6)
      }
    })

    it("spreads 8-player foundations across 4 rows of 8", () => {
      const slots = computeFoundationSlots(8) // 32 slots => 4 rows x 8 cols
      expect(slots).toHaveLength(32)
      const zValues = [...new Set(slots.map((s) => s.z.toFixed(6)))]
      expect(zValues).toHaveLength(4)
      for (const z of zValues) {
        const inRow = slots.filter((s) => s.z.toFixed(6) === z)
        expect(inRow).toHaveLength(8)
      }
    })
  })
})
