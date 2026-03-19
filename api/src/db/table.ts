import { Table, Entity, item, string, number, any } from "dynamodb-toolbox"
import { documentClient, TABLE } from "./client"

/**
 * Single DynamoDB table for all card game data.
 * Uses single-table design: PK = GAME#<roomCode>, SK = METADATA | PLAYER#<id> | STATE
 */
export const CardGamesTable = new Table({
  name: TABLE,
  partitionKey: { name: "PK", type: "string" },
  sortKey: { name: "SK", type: "string" },
  documentClient,
})

/** Game session metadata — status, player count, game type */
export const GameEntity = new Entity({
  name: "Game",
  table: CardGamesTable,
  timestamps: {
    created: { name: "createdAt", savedAs: "createdAt" },
    modified: { name: "updatedAt", savedAs: "updatedAt" },
  },
  schema: item({
    PK: string().key(),
    SK: string().key(),
    roomCode: string(),
    gameType: string(),
    playerCount: number(),
    status: string(),
    ttl: number().optional(),
  }),
})

/** A player record within a game room */
export const PlayerEntity = new Entity({
  name: "Player",
  table: CardGamesTable,
  timestamps: {
    created: { name: "joinedAt", savedAs: "joinedAt" },
    modified: false,
  },
  schema: item({
    PK: string().key(),
    SK: string().key(),
    playerId: string(),
    socketId: string(),
    ttl: number().optional(),
  }),
})

/** Game-type-specific state stored as an opaque JSON blob */
export const GameStateEntity = new Entity({
  name: "GameState",
  table: CardGamesTable,
  timestamps: {
    created: false,
    modified: { name: "updatedAt", savedAs: "updatedAt" },
  },
  schema: item({
    PK: string().key(),
    SK: string().key(),
    gameType: string(),
    state: any(),
    ttl: number().optional(),
  }),
})
