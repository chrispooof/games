/** How long (ms) to keep a disconnected player's session alive before removing them */
export const RECONNECT_GRACE_MS = 30_000

/** Default DynamoDB TTL for game/session records in seconds (24 hours). */
export const GAME_TTL_SECONDS = 86_400

/** Room code length used across API validation and generation. */
export const ROOM_CODE_LENGTH = 6

/** Allowed player count bounds for game creation. */
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 8

/** Default game type when callers do not provide one. */
export const DEFAULT_GAME_TYPE = "nertz"

/** Default API HTTP port when `PORT` is not provided. */
export const DEFAULT_API_PORT = 3001

/** Default browser origin used for CORS in local development. */
export const DEFAULT_UI_ORIGIN = "http://localhost:5173"

/** Default AWS region for API DynamoDB clients in local/dev usage. */
export const DEFAULT_AWS_REGION = "us-east-1"

/** Default DynamoDB table name for local and fallback environments. */
export const DEFAULT_DYNAMODB_TABLE = "CardGames"

/** Base seat radius used by server-side geometry helpers for Nertz. */
export const NERTZ_SEAT_RADIUS = 2.5

/** Forward offset from seat center to the player's pile row. */
export const NERTZ_PILE_OFFSET = 0.5

/** Work piles fan from base to tip by this spacing in world units. */
export const NERTZ_WORK_PILE_FAN_OFFSET = 0.2

/** Work piles start at pile index 1 in the seven-pile layout. */
export const NERTZ_PILE_WORK_START = 1
