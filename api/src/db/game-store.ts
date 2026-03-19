import {
  PutItemCommand,
  GetItemCommand,
  DeleteItemCommand,
  QueryCommand,
  UpdateItemCommand,
} from "dynamodb-toolbox"
import { CardGamesTable, GameEntity, PlayerEntity, GameStateEntity } from "./table"

export type GameStatus = "waiting" | "in-progress" | "finished"

export interface GameMetadata {
  roomCode: string
  gameType: string
  playerCount: number
  status: GameStatus
  createdAt: string
  updatedAt: string
  ttl: number
}

export interface GamePlayer {
  playerId: string
  socketId: string
  joinedAt: string
}

export interface GameState {
  gameType: string
  state: Record<string, unknown>
}

/** Unix epoch seconds — 24 hours from now */
const ttlInSeconds = (): number => Math.floor(Date.now() / 1000) + 86400

/**
 * Persists a new game session. createdAt and updatedAt are managed automatically
 * by DynamoDB Toolbox (_ct → createdAt, _md → updatedAt).
 */
export const createGame = async (params: {
  roomCode: string
  gameType: string
  playerCount: number
}): Promise<GameMetadata> => {
  const now = new Date().toISOString()

  await GameEntity.build(PutItemCommand)
    .item({
      PK: `GAME#${params.roomCode}`,
      SK: "METADATA",
      roomCode: params.roomCode,
      gameType: params.gameType,
      playerCount: params.playerCount,
      status: "waiting",
      ttl: ttlInSeconds(),
    })
    .send()

  return {
    ...params,
    status: "waiting",
    createdAt: now,
    updatedAt: now,
    ttl: ttlInSeconds(),
  }
}

/**
 * Fetches a game session by room code. Returns null if not found.
 */
export const getGame = async (roomCode: string): Promise<GameMetadata | null> => {
  const { Item } = await GameEntity.build(GetItemCommand)
    .key({ PK: `GAME#${roomCode}`, SK: "METADATA" })
    .send()

  if (!Item) return null

  return Item as unknown as GameMetadata
}

/**
 * Records a player joining a game room. joinedAt is managed automatically
 * by DynamoDB Toolbox (_ct → joinedAt).
 */
export const addPlayer = async (
  roomCode: string,
  playerId: string,
  socketId: string,
): Promise<void> => {
  await PlayerEntity.build(PutItemCommand)
    .item({
      PK: `GAME#${roomCode}`,
      SK: `PLAYER#${playerId}`,
      playerId,
      socketId,
      ttl: ttlInSeconds(),
    })
    .send()
}

/**
 * Removes a player from a game room.
 */
export const removePlayer = async (roomCode: string, playerId: string): Promise<void> => {
  await PlayerEntity.build(DeleteItemCommand)
    .key({ PK: `GAME#${roomCode}`, SK: `PLAYER#${playerId}` })
    .send()
}

/**
 * Persists game-type-specific state as a JSON blob. updatedAt is managed
 * automatically by DynamoDB Toolbox (_md → updatedAt).
 */
export const updateGameState = async (
  roomCode: string,
  gameType: string,
  state: Record<string, unknown>,
): Promise<void> => {
  await GameStateEntity.build(PutItemCommand)
    .item({
      PK: `GAME#${roomCode}`,
      SK: "STATE",
      gameType,
      state,
      ttl: ttlInSeconds(),
    })
    .send()
}

/**
 * Fetches the current game state blob. Returns null if no state has been saved yet.
 */
export const getGameState = async (roomCode: string): Promise<GameState | null> => {
  const { Item } = await GameStateEntity.build(GetItemCommand)
    .key({ PK: `GAME#${roomCode}`, SK: "STATE" })
    .send()

  if (!Item) return null

  return Item as unknown as GameState
}

/**
 * Returns all player records currently stored for a room.
 */
export const getPlayers = async (roomCode: string): Promise<GamePlayer[]> => {
  const { Items } = await CardGamesTable.build(QueryCommand)
    .entities(PlayerEntity)
    .query({ partition: `GAME#${roomCode}`, range: { beginsWith: "PLAYER#" } })
    .send()

  return (Items ?? []) as unknown as GamePlayer[]
}

/**
 * Updates the socketId on an existing player record after a reconnection.
 */
export const updatePlayerSocket = async (
  roomCode: string,
  playerId: string,
  socketId: string,
): Promise<void> => {
  await PlayerEntity.build(UpdateItemCommand)
    .item({ PK: `GAME#${roomCode}`, SK: `PLAYER#${playerId}`, socketId })
    .send()
}
