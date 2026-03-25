import { describe, expect, it } from "vitest"
import { resolveApiUrl } from "./env"

describe("lib/env", () => {
  it("uses the local API url when no build-time variable is provided", () => {
    expect(resolveApiUrl({})).toBe("http://localhost:3001")
  })

  it("uses the configured build-time API url when provided", () => {
    expect(resolveApiUrl({ VITE_API_URL: "https://api.example.com" })).toBe(
      "https://api.example.com"
    )
  })
})
