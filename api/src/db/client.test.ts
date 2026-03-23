import { beforeEach, describe, expect, it, vi } from "vitest"

const { dynamoCtor, documentFrom } = vi.hoisted(() => ({
  dynamoCtor: vi.fn(),
  documentFrom: vi.fn((base: unknown) => ({ __kind: "doc", base })),
}))

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {
    constructor(config: unknown) {
      dynamoCtor(config)
    }
  },
}))

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: documentFrom,
  },
}))

describe("db/client", () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env = { ...originalEnv }
    delete process.env.AWS_REGION
    delete process.env.DYNAMODB_ENDPOINT
    delete process.env.DYNAMODB_TABLE
  })

  it("uses default region and table when env is unset", async () => {
    const mod = await import("./client")

    expect(dynamoCtor).toHaveBeenCalledTimes(1)
    expect(dynamoCtor).toHaveBeenCalledWith({ region: "us-east-1" })
    expect(documentFrom).toHaveBeenCalledTimes(1)
    expect(mod.TABLE).toBe("CardGames")
  })

  it("uses explicit region and table from env", async () => {
    process.env.AWS_REGION = "eu-west-1"
    process.env.DYNAMODB_TABLE = "CustomGames"

    const mod = await import("./client")

    expect(dynamoCtor).toHaveBeenCalledWith({ region: "eu-west-1" })
    expect(mod.TABLE).toBe("CustomGames")
  })

  it("sets endpoint and local dummy credentials when endpoint is configured", async () => {
    process.env.DYNAMODB_ENDPOINT = "http://localhost:8000"

    await import("./client")

    expect(dynamoCtor).toHaveBeenCalledWith({
      region: "us-east-1",
      endpoint: "http://localhost:8000",
      credentials: { accessKeyId: "local", secretAccessKey: "local" },
    })
  })
})
