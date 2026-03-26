import { describe, expect, it } from "vitest"
import { getAppConfig } from "./env"

describe("config/env", () => {
  it("uses local development defaults when env is unset", () => {
    expect(getAppConfig({})).toEqual({
      nodeEnv: "development",
      port: 3001,
      uiOrigin: "http://localhost:5173",
      awsRegion: "us-east-1",
      dynamoDbTable: "CardGames",
      dynamoDbEndpoint: undefined,
    })
  })

  it("uses explicit environment overrides when provided", () => {
    expect(
      getAppConfig({
        NODE_ENV: "production",
        PORT: "8080",
        UI_ORIGIN: "https://example.com",
        AWS_REGION: "eu-west-1",
        DYNAMODB_TABLE: "CardGames-prod",
        DYNAMODB_ENDPOINT: "http://localhost:8000",
      })
    ).toEqual({
      nodeEnv: "production",
      port: 8080,
      uiOrigin: "https://example.com",
      awsRegion: "eu-west-1",
      dynamoDbTable: "CardGames-prod",
      dynamoDbEndpoint: "http://localhost:8000",
    })
  })
})
