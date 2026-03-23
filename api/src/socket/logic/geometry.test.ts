import { expect, test } from "vitest"
import { computeDealPiles, computeFoundationSlots, computeSeat } from "./geometry"

test("computeSeat places seat 0 on positive Z", () => {
  const seat = computeSeat(0, 8, 3)
  expect(seat.x).toBeCloseTo(0)
  expect(seat.z).toBeCloseTo(3)
  expect(seat.angle).toBeCloseTo(0)
})

test("computeSeat uses evenly spaced angles", () => {
  const seat = computeSeat(2, 8, 3)
  expect(seat.angle).toBeCloseTo(Math.PI / 2)
  expect(seat.x).toBeCloseTo(3)
  expect(seat.z).toBeCloseTo(0)
})

test("computeDealPiles returns 7 piles centered around index 3", () => {
  const seat = { x: 0, z: 0, angle: 0 }
  const piles = computeDealPiles(seat, 2.5, 0.5)
  expect(piles).toHaveLength(7)
  expect(piles[3].x).toBeCloseTo(0)
  expect(piles[3].z).toBeCloseTo(2)
})

test("computeFoundationSlots uses expected row count for 8 players", () => {
  const slots = computeFoundationSlots(8)
  expect(slots).toHaveLength(32)

  const rows = new Set(slots.map((s) => s.z.toFixed(6)))
  expect(rows.size).toBe(4)

  for (const rowZ of rows) {
    const row = slots.filter((s) => s.z.toFixed(6) === rowZ)
    expect(row).toHaveLength(8)
  }
})
