import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb"
import { DEFAULT_AWS_REGION, DEFAULT_DYNAMODB_TABLE } from "../utils/constants"

const REGION = process.env.AWS_REGION ?? DEFAULT_AWS_REGION
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

/** DynamoDB table used by all Toolbox entities in this API. */
export const TABLE = process.env.DYNAMODB_TABLE ?? DEFAULT_DYNAMODB_TABLE
