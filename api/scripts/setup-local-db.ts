import "dotenv/config"
import { DynamoDBClient, CreateTableCommand, ListTablesCommand } from "@aws-sdk/client-dynamodb"

const TABLE = process.env.DYNAMODB_TABLE ?? "CardGames"
const ENDPOINT = process.env.DYNAMODB_ENDPOINT ?? "http://localhost:8000"

const client = new DynamoDBClient({
  region: "us-east-1",
  endpoint: ENDPOINT,
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
})

/** Creates the CardGames table in DynamoDB Local if it doesn't already exist */
const setup = async (): Promise<void> => {
  const { TableNames } = await client.send(new ListTablesCommand({}))

  if (TableNames?.includes(TABLE)) {
    console.log(`Table "${TABLE}" already exists — skipping.`)
    return
  }

  await client.send(
    new CreateTableCommand({
      TableName: TABLE,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "PK", AttributeType: "S" },
        { AttributeName: "SK", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "PK", KeyType: "HASH" },
        { AttributeName: "SK", KeyType: "RANGE" },
      ],
      TimeToLiveSpecification: {
        AttributeName: "ttl",
        Enabled: true,
      },
    })
  )

  console.log(`Table "${TABLE}" created successfully.`)
}

setup().catch((err) => {
  console.error("Failed to set up local DB:", err)
  process.exit(1)
})
