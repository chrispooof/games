import { describe, expect, it } from "vitest"
import { resolveGameModule } from "./registry"

describe("socket game registry", () => {
  it("resolves nertz module", () => {
    const mod = resolveGameModule("nertz")
    expect(mod).not.toBeNull()
    expect(mod?.gameType).toBe("nertz")
  })

  it("returns null for unsupported game type", () => {
    expect(resolveGameModule("unknown-game")).toBeNull()
  })
})
