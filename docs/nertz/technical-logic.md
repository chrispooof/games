# Nertz Game Logic & Validation Architecture

> **Living document** — reflects the current modular Socket.IO backend.

## Overview

Nertz is a simultaneous multiplayer game (no turns). The server is authoritative for shared and persisted state; the client owns rendering, drag UX, and optimistic interaction gating.

The socket backend is now split into:

- **Shared socket lifecycle core** (`api/src/socket/index.ts`) for join/reconnect/leave/disconnect + persistence orchestration.
- **Game modules** (`api/src/socket/games/*`) keyed by `gameType`.
- **Nertz domain logic** (`api/src/socket/logic/nertz.ts`) for validation and deterministic state mutation.

---

## Where Logic Lives

| Concern | Where | Reason |
| --- | --- | --- |
| Join/reconnect/disconnect flow | **Server core** (`socket/index.ts`) | Shared across all games |
| Game routing by `gameType` | **Server registry** (`socket/games/registry.ts`) | Per-room module dispatch |
| Nertz socket protocol handling | **Nertz module** (`socket/games/nertz.ts`) | Keeps wire behavior game-specific but pluggable |
| Foundation/work/merge validation | **Server domain** (`socket/logic/nertz.ts`) | Race-safe, authoritative rules |
| Stock/waste flip | **Server domain** (`socket/logic/nertz.ts`) | Server owns pile order |
| Drag gating (top cards only) | **Client** (`DragControls`) | Immediate UX feedback |
| Snap-back on rejection | **Client** (`game.ts`) | Revert local drag on `ok: false` |
| Reconnect local pile rehydration | **Client** (`nertz.tsx` + `game.ts`) | Restores playability after reconnect |

---

## Key File Map

| Path | Role |
| --- | --- |
| `api/src/socket/index.ts` | Shared socket lifecycle, DB IO, module dispatch |
| `api/src/socket/games/types.ts` | `SocketGameModule` contract + emit envelope types |
| `api/src/socket/games/registry.ts` | `gameType` → module resolver |
| `api/src/socket/games/nertz.ts` | Nertz socket adapter (`room-state` extras, `game-action`, `set-state`) |
| `api/src/socket/logic/nertz.ts` | Nertz state types, validation, mutation, helpers |
| `api/src/socket/logic/geometry.ts` | Pure geometry helpers (seat/piles/foundations) |
| `api/src/db/game-store.ts` | DynamoDB read/write persistence |
| `ui/app/routes/nertz.tsx` | Route socket wiring + reconnect state apply |
| `ui/app/games/nertz/src/game.ts` | Three.js game class + local pile/model state |
| `ui/app/games/nertz/src/controls/player.ts` | Drag controls and snap detection |

---

## Connection and Game Boot Flow

1. Player opens `/nertz/:roomCode`; route connects socket and emits `join-room { roomCode, playerId }`.
2. Server `socket/index.ts`:
   - validates room via `getGame(roomCode)`
   - handles reconnect vs fresh join
   - loads `players` + `gameState`
   - resolves module via `resolveGameModule(game.gameType)`
   - emits `room-state` with base fields plus module extras (for Nertz: `nertzCounts`, `nertzTops`)
3. Client route creates `NertzGame(...)` using:
   - saved `cardPositions`
   - saved `foundations`
   - saved local player's pile arrays (from `gameState.players`) to restore drag/playability
4. If no saved positions exist, local player runs shuffle/deal intro and emits `set-state`.

---

## Socket Event Flow (Current)

### `game-action`

1. Server core loads room metadata and current game state.
2. Core resolves module by `gameType`.
3. Module handles action and returns:
   - `emits`: one or more messages targeted at actor / others / room
   - optional `nextState` to persist
4. Core persists `nextState` via `updateGameState(...)` and emits returned messages.

For Nertz, module behavior remains:

- `flip-stock` -> actor gets `action-result`, room gets `game-state-update` delta on success.
- `move-card` (legacy) -> broadcasts `game-action`, persists updated `cardPositions`.
- typed actions (`play-to-foundation`, `play-to-work-pile`, `merge-work-piles`) -> validated in `processAction`.

### `set-state`

1. Server core resolves game module.
2. Module parses payload and merges/creates server state.
3. Core persists returned `nextState` and emits module-provided broadcasts.

For Nertz, this uses `createOrMergeGameState(...)` and broadcasts updated `cardPositions` + nertz info.

### Unsupported Game Types

If `gameType` has no registered module:

- server emits `error { message: "Unsupported game type: ..." }`
- game-specific events are rejected
- socket is not forcibly disconnected

---

## Reconnection Behavior (30s Grace)

- On disconnect: room gets `player-disconnected`; server starts 30s timer.
- Reconnect within grace:
  - timer cancelled
  - socketId updated
  - room gets `player-reconnected`
  - reconnecting client receives `room-state`
- Client reconnect restore now includes:
  - `applyState(cardPositions)` for transforms
  - `applyLocalPileState(...)` from `gameState.players` for local pile ordering

This local pile hydration is required for hover/drag/playability and correct top-card face orientation after reconnect.

---

## Nertz Rule Validation Notes

Implemented in `api/src/socket/logic/nertz.ts`:

- **Foundation play**:
  - source card must be top of declared source pile
  - empty foundation accepts Ace only
  - occupied foundation requires same suit + exactly next rank
- **Work pile play**:
  - source card must be top of declared source
  - card can connect to target pile top or base if adjacent rank and alternating color
- **Merge work piles**:
  - move dragged card and above as a group
  - validates source/target and group connection rules
- **Game over**:
  - after successful foundation play, empty local nertz pile sets phase to `finished` and emits `game-over`

Node’s single-threaded event loop serializes concurrent socket actions, so simultaneous foundation races resolve by arrival order.

---

## Types Snapshot

### Actions (`ui/.../types/actions.ts`, mirrored in API)

```typescript
type GameAction =
  | { type: "play-to-foundation"; cardId: string; slotIndex: number; source: "nertz" | "work" | "waste"; sourceIndex?: number }
  | { type: "play-to-work-pile"; cardId: string; targetPileIndex: number; source: "nertz" | "work" | "waste"; sourceIndex?: number }
  | { type: "merge-work-piles"; sourcePileIndex: number; cardId: string; targetPileIndex: number }
  | { type: "flip-stock" }
  | { type: "move-card"; cardId: string; position: { x: number; z: number } }
```

### Socket module contract (`api/src/socket/games/types.ts`)

```typescript
interface SocketGameModule {
  gameType: string
  buildRoomStateExtras?: (ctx) => Record<string, unknown>
  handleGameAction: (ctx) => { emits: SocketEmitMessage[]; nextState?: Record<string, unknown> }
  handleSetState?: (ctx) => { emits: SocketEmitMessage[]; nextState?: Record<string, unknown> }
}
```

---

## Socket Events Summary

| Event | Direction | Payload | Trigger |
| --- | --- | --- | --- |
| `join-room` | client -> server | `{ roomCode, playerId }` | Player enters route |
| `leave-room` | client -> server | — | Intentional leave |
| `set-state` | client -> server | `{ positions, pileState }` | Intro completes |
| `game-action` | client -> server | `GameAction` | Drag/drop or flip |
| `room-state` | server -> client | `{ players, maxPlayers, gameState, ...extras }` | Join/reconnect |
| `player-joined` | server -> room | `{ playerId }` | New player join |
| `player-reconnected` | server -> room | `{ playerId }` | Reconnect inside grace |
| `player-disconnected` | server -> room | `{ playerId }` | Socket drop |
| `player-left` | server -> room | `{ playerId }` | Grace timeout or leave |
| `action-result` | server -> actor | `ActionResult` | Typed action response |
| `game-state-update` | server -> room | `{ cardPositions, ... }` | Successful state mutation |
| `game-over` | server -> room | `{ winnerId }` | Nertz win condition |
