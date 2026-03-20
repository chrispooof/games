# Nertz Game Logic & Validation Architecture

> **Living document** — updated to reflect the current implementation.

## Overview

Nertz is a simultaneously played multiplayer card game with no turns. All players act at the same time; the server is authoritative for shared state (foundations) while the client owns local rendering and UX gating.

---

## Where Logic Lives

| Concern | Where | Reason |
| --- | --- | --- |
| Foundation play validation | **Server** (`nertz.ts`) | Race condition: two players can play simultaneously; Node.js event loop serializes — first arrival wins |
| Work pile ownership + rule check | **Server** (`nertz.ts`) | Descending alternating-color rule enforced on arrival |
| Drag gating (only top cards draggable) | **Client** (`DragControls`) | Instant UX feedback; buried cards have `mousedown` blocked |
| Stock/waste flip | **Server** (`nertz.ts`) | Server owns pile order |
| Snap-back on rejection | **Client** (`game.ts`) | Card reverts to pre-drag position on `ok: false` |
| Game-over detection | **Server** (`nertz.ts`) | Nertz pile emptying triggers win broadcast |

---

## Key File Map

| Path | Role |
| --- | --- |
| `api/src/socket/index.ts` | Socket event handlers — routes every `game-action` |
| `api/src/socket/logic/nertz.ts` | Game state types, validation, `processAction`, `processFlipStock`, `createOrMergeGameState` |
| `api/src/socket/logic/geometry.ts` | Pure geometry (seat positions, deal piles, foundation slots) — no Three.js |
| `api/src/db/game-store.ts` | DynamoDB read/write (`getGameState`, `updateGameState`) |
| `ui/app/routes/nertz.tsx` | React route — mounts `NertzGame`, wires socket events to game methods |
| `ui/app/games/nertz/src/game.ts` | `NertzGame` class — Three.js renderer, pile state, action dispatch |
| `ui/app/games/nertz/src/controls/player.ts` | `DragControls` — raycasting, snap targets, stock click, pre-drag positions |
| `ui/app/games/nertz/src/types/actions.ts` | Shared action/result types (mirrored in API) |
| `ui/app/games/nertz/src/utils/geometry.ts` | Client-side pure geometry mirror |
| `ui/app/games/nertz/src/scenes/intro.ts` | Deal animation; exposes `dealtCards` after completion |

---

## Game Entry Point

1. **Player navigates to `/nertz/:roomCode`** — `nertz.tsx` mounts and connects the socket.
2. Socket emits `join-room { roomCode, playerId }`. The `playerId` is a stable UUID from `localStorage` (`nertz_player_id`).
3. Server responds with `room-state { players, maxPlayers, gameState }`.
4. `nertz.tsx` instantiates `NertzGame(container, maxPlayers, deckCount, localPlayerIndex, savedPositions)`.
   - If `gameState` contains saved card positions the deal animation is skipped; cards are placed directly.
   - Otherwise the **shuffle → deal** intro plays.

### Shuffle → Deal Intro

```
ShuffleAnimation → IntroAnimation → emit set-state
```

1. `ShuffleAnimation` runs on the local player's 52-card deck.
2. When complete, `IntroAnimation` deals cards to the 7-pile layout and zooms the camera in.
3. On `intro.isComplete`:
   - `NertzGame` reads `intro.dealtCards` (ordered array of 52 dealt cards) and builds `localPileState`:
     - `cards[0..12]` → nertz pile (0 = bottom, 12 = top)
     - `cards[13..16]` → work piles 1–4 (one card each, face-up)
     - `cards[17..51]` → stock pile (face-down)
     - waste starts empty
   - Emits `set-state { positions, pileState }` — the server stores this as the authoritative `NertzGameState` for the player.

---

## Pile Layout

Every player has **7 piles** arranged in a row centered on their seat, spaced 0.85 units apart:

```
[Nertz, Work1, Work2, Work3, Work4, Waste, Stock]
  0       1      2      3      4      5      6
```

Positions are computed by `computeDealPiles(seat, SEAT_RADIUS=6.5, PILE_OFFSET=1)`, which offsets each pile along the perpendicular of the radial direction using `(i - 3) * spacing`.

Work piles are **fanned** toward the table center (`-radial` direction) at `0.2` world units per card depth so all cards remain visible. The camera zooms out by `0.5` units per card beyond depth 3, capped at height 22.

Card ID format: `p{playerIndex}_Card_{rank}_{suit}` — e.g. `p0_Card_A_spades`.

---

## Socket Event Flow

### Player Action → Server

All player actions are emitted as `game-action` on the socket:

```
Client                                     Server
  |                                           |
  |-- game-action (PlayToFoundation) -------> |
  |                                           | validateFoundationPlay()
  |                                           | [serialize via Node.js event loop]
  |<-- action-result { ok, cardId } --------- |
  |<-- game-state-update { cardPositions } -- | (broadcast to room on ok:true)
```

### Typed Action: Play to Foundation

1. `DragControls` detects a drop within `FOUNDATION_SNAP_RADIUS` of a foundation slot.
2. `NertzGame.handleCardDrop(cardId, pos, foundationSlotIndex, null)` is called.
3. `findCardSource(cardId)` checks if the card is the top of nertz, work, or waste pile.
4. Emits `game-action { type: "play-to-foundation", cardId, slotIndex, source, sourceIndex? }`.
5. Server handler in `index.ts`:
   - Loads `NertzGameState` from DynamoDB.
   - Calls `getFoundationSlotPosition(slotIndex, numPlayers)` — **canonical position computed server-side** (client coordinates not trusted).
   - Calls `processAction(action, playerId, state, resolvedPosition)`.
   - `validateFoundationPlay`: card must be top of stated source pile; empty slot accepts only Ace; occupied slot requires same suit and `topValue + 1`.
   - On success: mutates state, persists to DynamoDB, emits `action-result { ok: true }` to actor, broadcasts `game-state-update { cardPositions }` to room.
   - On failure: emits `action-result { ok: false, reason }` — no state change, no broadcast.
6. Client `applyActionResult(result)`:
   - `ok: true` → removes card from local source pile, refreshes display.
   - `ok: false` → calls `dragControls.snapBackCard(cardId)` to return to pre-drag position.

### Race Condition on Foundations

Node.js processes socket events one at a time on the event loop. If two players drop on the same foundation slot simultaneously:

- The first `game-action` event to arrive is processed, validated, and the state is mutated.
- The second arrives and finds the slot already occupied with a different card — `validateFoundationPlay` returns `"foundation-conflict"`.
- The second player's card snaps back. No coordination primitives needed.

### Typed Action: Play to Work Pile

1. `DragControls` detects a drop within `WORK_PILE_SNAP_RADIUS` of a work pile snap target.
2. Snap targets are recalculated after each action — the target is at `basePos + pileLength * 0.2 * fanDir` (where the next card will land).
3. Emits `game-action { type: "play-to-work-pile", cardId, targetPileIndex, source, sourceIndex? }`.
4. Server `validateWorkPilePlay`: card must be one rank lower than top card, and colors must alternate. Empty pile accepts any card.
5. Work piles are always the local player's own — `not-your-pile` is returned if the `playerId` doesn't own the pile state.
6. On success: same emit/broadcast pattern as foundation.

### Flip Stock

1. Player clicks the **Flip Stock** button (bottom right of UI) or clicks the stock pile area.
2. `NertzGame.flipStock()` emits `game-action { type: "flip-stock" }`.
3. Server `processFlipStock(playerId, state)`:
   - If stock is empty: reverses waste back to stock (face-down) and clears waste.
   - Otherwise: pops up to 3 cards from the top of stock, pushes to waste.
   - Returns `result.cardId` = top waste card after the flip.
4. Server broadcasts `game-state-update { cardPositions }` (only waste/stock positions change).
5. Client `applyActionResult` detects `flip-stock` pending action and updates `localPileState` accordingly, then calls `refreshLocalDisplay()`.

### Game Over

After every successful foundation play, `processAction` checks `nertzPile.length === 0`. If true:

- Sets `state.phase = "finished"` and `state.winnerId = playerId`.
- Returns `isGameOver: true`.
- Server emits `game-over { winnerId }` to the **entire room** (including the winner).
- UI in `nertz.tsx` shows a winner notification overlay.

---

## State Bootstrap: `set-state`

After the deal animation, each client emits:

```typescript
socket.emit("set-state", {
  positions: Record<cardId, { x, z }>,   // all 52 card world positions
  pileState: {                             // logical pile ordering
    nertzPile: string[],
    workPiles: [string[], string[], string[], string[]],
    stock: string[],
    waste: string[],
  }
})
```

Server handler (`index.ts`):

1. Determines `playerIndex` from sorted join order (`joinedAt` timestamps).
2. Calls `createOrMergeGameState(playerId, playerIndex, numPlayers, positions, pileData, existing)`.
   - First player creates the state with `numPlayers * 4` empty foundation slots.
   - Subsequent players merge their pile state in.
3. Persists updated `NertzGameState` to DynamoDB.
4. Broadcasts `game-state-update { cardPositions }` so other clients can render newly positioned cards.

---

## Reconnection (30s Grace Period)

- On socket disconnect: room is notified via `player-disconnected { playerId }`, a 30s timer starts.
- On reconnect within 30s: timer cancelled, socket ID updated in DynamoDB, room notified via `player-reconnected { playerId }`.
- Reconnecting player receives `room-state { players, gameState }` — `NertzGame` skips the deal and places cards from saved positions.
- After 30s: player removed from DynamoDB, room notified via `player-left { playerId }`.

---

## Types Reference

### Action Types (`ui/app/games/nertz/src/types/actions.ts`, mirrored in `api/src/socket/logic/nertz.ts`)

```typescript
/** Play a card to a shared foundation slot */
type PlayToFoundationAction = {
  type: "play-to-foundation"
  cardId: string
  slotIndex: number           // index into foundations array (0..numPlayers*4-1)
  source: "nertz" | "work" | "waste"
  sourceIndex?: number        // work pile 0–3 when source === "work"
}

/** Play a card to the local player's own work pile */
type PlayToWorkPileAction = {
  type: "play-to-work-pile"
  cardId: string
  targetPileIndex: number     // 0–3 (always local player's piles)
  source: "nertz" | "work" | "waste"
  sourceIndex?: number
}

/** Flip up to 3 cards from stock to waste (or cycle waste → stock) */
type FlipStockAction = { type: "flip-stock" }

/** Legacy free-move — no server validation, forwarded as-is */
type MoveCardAction = {
  type: "move-card"
  cardId: string
  position: { x: number; z: number }
}

type GameAction = PlayToFoundationAction | PlayToWorkPileAction | FlipStockAction | MoveCardAction

/** Server response to acting player only */
type ActionResult =
  | { ok: true; cardId: string }
  | { ok: false; cardId: string; reason: "illegal-move" | "foundation-conflict" | "not-your-pile" }
```

### Server State Types (`api/src/socket/logic/nertz.ts`)

```typescript
type Suit = "clubs" | "diamonds" | "hearts" | "spades"

/** State of a single shared foundation slot */
interface FoundationState {
  slotIndex: number   // global index; slot for playerIdx p, column c = p*4 + c
  suit: Suit | null   // null = empty
  topValue: number    // 0 = empty, 1 = Ace, ..., 13 = King
}

/** Pile state for one player — arrays are bottom-to-top (last = playable top) */
interface PlayerPileState {
  playerId: string
  playerIndex: number
  nertzPile: string[]                             // 13 cards at start
  workPiles: [string[], string[], string[], string[]]  // 4 piles
  stock: string[]                                 // 35 cards at start
  waste: string[]                                 // empty at start
}

/** Full server-side game state persisted in DynamoDB */
interface NertzGameState {
  numPlayers: number
  cardPositions: Record<string, { x: number; z: number }>  // world-space positions for rendering
  foundations: FoundationState[]   // numPlayers * 4 slots
  players: PlayerPileState[]
  phase: "dealing" | "playing" | "finished"
  winnerId: string | null
}

/** Subset of pile state sent by client after deal completes */
interface InitialPileData {
  nertzPile: string[]
  workPiles: [string[], string[], string[], string[]]
  stock: string[]
  waste: string[]
}
```

### Geometry Types (`api/src/socket/logic/geometry.ts`, mirrored in `ui/app/games/nertz/src/utils/geometry.ts`)

```typescript
/** World-space seat: position + rotation angle around table */
interface SeatTransform { x: number; z: number; angle: number }

/** computeSeat(index, total, seatRadius) → SeatTransform */
// Seat 0 at positive-Z (south); increments clockwise top-down.
// angle = 2π * index / total

/** computeDealPiles(seat, seatRadius, pileOffset) → Array<{x,z}>[7] */
// Returns [Nertz, Work1, Work2, Work3, Work4, Waste, Stock]
// Positions computed along the perpendicular of the seat's radial,
// spaced 0.85 units apart, centered at index 3.

/** computeFoundationSlots(numPlayers, slotGap=0.7) → FoundationSlotTransform[] */
// numPlayers * 4 slots arranged in rows near table center.
// slotIndex = playerIdx * 4 + col (col 0–3)
interface FoundationSlotTransform { x: number; z: number; angle: number }
```

---

## Socket Events Summary

| Event | Direction | Payload | Trigger |
| --- | --- | --- | --- |
| `join-room` | client → server | `{ roomCode, playerId }` | Player enters game route |
| `leave-room` | client → server | — | Player navigates away intentionally |
| `set-state` | client → server | `{ positions, pileState }` | Deal animation completes |
| `game-action` | client → server | `GameAction` | Card drop or flip-stock button |
| `room-state` | server → client | `{ players, maxPlayers, gameState }` | On join/reconnect |
| `player-joined` | server → room | `{ playerId }` | New player joins |
| `player-reconnected` | server → room | `{ playerId }` | Player reconnects within grace period |
| `player-disconnected` | server → room | `{ playerId }` | Socket drops (grace period starts) |
| `player-left` | server → room | `{ playerId }` | Grace period expires or explicit leave |
| `action-result` | server → actor | `ActionResult` | Response to every typed game action |
| `game-state-update` | server → room | `{ cardPositions }` | Successful action (position delta) |
| `game-over` | server → room | `{ winnerId }` | Nertz pile empties |
