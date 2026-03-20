/**
 * Pure geometry utilities — mirrored from ui/app/games/nertz/src/utils/geometry.ts.
 * No Three.js dependencies; all inputs are explicit parameters.
 */

/** Seat transform: world-space position and Y-rotation for a player's area */
export interface SeatTransform {
  x: number
  z: number
  angle: number
}

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
  pileOffset: number,
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

/** Foundation slot position in world space */
export interface FoundationSlotTransform {
  x: number
  z: number
  angle: number
}

/**
 * Computes all foundation slot positions for a game with `numPlayers` players.
 * Slot index = playerIndex * 4 + col (col 0–3).
 * @param numPlayers - Total number of players
 * @param slotGap - Spacing between adjacent slots within a player's row (default 0.7)
 */
export const computeFoundationSlots = (
  numPlayers: number,
  slotGap = 0.7,
): FoundationSlotTransform[] => {
  const totalRowWidth = 3 * slotGap
  const minRadius = numPlayers > 1 ? totalRowWidth / (2 * Math.sin(Math.PI / numPlayers)) : 1.2
  const groupRadius = Math.max(1.2, minRadius + 1.2)
  const slots: FoundationSlotTransform[] = []

  for (let playerIdx = 0; playerIdx < numPlayers; playerIdx++) {
    const angle = (2 * Math.PI * playerIdx) / numPlayers
    const radialX = Math.sin(angle)
    const radialZ = Math.cos(angle)
    const perpX = Math.cos(angle)
    const perpZ = -Math.sin(angle)
    const groupX = radialX * groupRadius
    const groupZ = radialZ * groupRadius

    for (let col = 0; col < 4; col++) {
      const offset = col * slotGap - totalRowWidth / 2
      slots.push({
        x: groupX + perpX * offset,
        z: groupZ + perpZ * offset,
        angle,
      })
    }
  }

  return slots
}
