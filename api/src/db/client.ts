import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb"

const REGION = process.env.AWS_REGION ?? "us-east-1"
const ENDPOINT = process.env.DYNAMODB_ENDPOINT

/**
 * Base DynamoDB client. When DYNAMODB_ENDPOINT is set (local dev),
 * requests are routed to DynamoDB Local instead of AWS.
 */
const dynamoClient = new DynamoDBClient({
  region: REGION,
  ...(ENDPOINT ? { endpoint: ENDPOINT } : {}),
  // DynamoDB Local doesn't validate credentials, so use dummies in dev
  ...(ENDPOINT
    ? { credentials: { accessKeyId: "local", secretAccessKey: "local" } }
    : {}),
})

export const documentClient = DynamoDBDocumentClient.from(dynamoClient)

export const TABLE = process.env.DYNAMODB_TABLE ?? "CardGames"
