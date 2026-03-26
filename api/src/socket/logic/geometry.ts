/**
 * Pure geometry utilities — mirrored from ui/app/games/nertz/src/utils/geometry.ts.
 * No Three.js dependencies; all inputs are explicit parameters.
 */
import type { FoundationSlotTransform, SeatTransform } from "../../types/geometry"

/**
 * Computes the world-space seat transform for player at `index` out of `total` players.
 * Seat 0 is at positive-Z (south); seats increment clockwise when viewed top-down.
 */
export const computeSeat = (index: number, total: number, seatRadius: number): SeatTransform => {
  const angle = (2 * Math.PI * index) / total
  return {
    x: Math.sin(angle) * seatRadius,
    z: Math.cos(angle) * seatRadius,
    angle,
  }
}

/**
 * Computes the seven world-space pile positions for a player's dealt hand.
 * [Nertz, Work1, Work2, Work3, Work4, Waste, Stock]  (indices 0–6, centered at 3)
 */
export const computeDealPiles = (
  seat: SeatTransform,
  seatRadius: number,
  pileOffset: number
): Array<{ x: number; z: number }> => {
  const r = seatRadius - pileOffset
  const cx = Math.sin(seat.angle) * r
  const cz = Math.cos(seat.angle) * r
  const perpX = Math.cos(seat.angle)
  const perpZ = -Math.sin(seat.angle)
  const spacing = 0.85

  return Array.from({ length: 7 }, (_, i) => {
    const offset = (i - 3) * spacing
    return { x: cx + perpX * offset, z: cz + perpZ * offset }
  })
}

/**
 * Computes all foundation slot positions arranged in centered rows at the table origin.
 * Max 8 slots per row; all rows have equal length. Finds the smallest row count
 * where total/rows <= 8 and total divides evenly.
 *
 * Total slots = numPlayers * 4. All slots face angle 0 (no per-player rotation).
 * @param numPlayers - Total number of players
 * @param slotGap - Horizontal spacing between adjacent slots (default 0.7)
 * @param rowGap - Vertical spacing between rows (default 1.1)
 */
export const computeFoundationSlots = (
  numPlayers: number,
  slotGap = 0.85,
  rowGap = 1.15
): FoundationSlotTransform[] => {
  const total = numPlayers * 4

  // Find smallest row count where cols fit in 8 and divides evenly
  let rows = 1
  while (total / rows > 8 || total % rows !== 0) rows++
  const cols = total / rows

  const slots: FoundationSlotTransform[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      slots.push({
        x: (c - (cols - 1) / 2) * slotGap,
        z: (r - (rows - 1) / 2) * rowGap,
        angle: 0,
      })
    }
  }
  return slots
}
