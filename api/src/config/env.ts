import {
  DEFAULT_API_PORT,
  DEFAULT_AWS_REGION,
  DEFAULT_DYNAMODB_TABLE,
  DEFAULT_UI_ORIGIN,
} from "../utils/constants"

export interface AppConfig {
  nodeEnv: string
  port: number
  uiOrigin: string
  awsRegion: string
  dynamoDbTable: string
  dynamoDbEndpoint?: string
}

/**
 * Resolves the API runtime configuration from process environment variables.
 */
export const getAppConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => ({
  nodeEnv: env.NODE_ENV?.trim() || "development",
  port: Number(env.PORT ?? DEFAULT_API_PORT),
  uiOrigin: env.UI_ORIGIN?.trim() || DEFAULT_UI_ORIGIN,
  awsRegion: env.AWS_REGION?.trim() || DEFAULT_AWS_REGION,
  dynamoDbTable: env.DYNAMODB_TABLE?.trim() || DEFAULT_DYNAMODB_TABLE,
  dynamoDbEndpoint: env.DYNAMODB_ENDPOINT?.trim() || undefined,
})

export const appConfig = getAppConfig()
