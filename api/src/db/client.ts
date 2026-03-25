import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb"
import { appConfig } from "../config/env"

/**
 * Base DynamoDB client. When DYNAMODB_ENDPOINT is set (local dev),
 * requests are routed to DynamoDB Local instead of AWS.
 */
const dynamoClient = new DynamoDBClient({
  region: appConfig.awsRegion,
  ...(appConfig.dynamoDbEndpoint ? { endpoint: appConfig.dynamoDbEndpoint } : {}),
  // DynamoDB Local doesn't validate credentials, so use dummies in dev
  ...(appConfig.dynamoDbEndpoint
    ? { credentials: { accessKeyId: "local", secretAccessKey: "local" } }
    : {}),
})

export const documentClient = DynamoDBDocumentClient.from(dynamoClient)

/** DynamoDB table used by all Toolbox entities in this API. */
export const TABLE = appConfig.dynamoDbTable
