import { describe, it, expect, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import GameTile from "./game-tile"

afterEach(cleanup)

const renderTile = (props: { name: string; url?: string; img?: string }) =>
  render(
    <MemoryRouter>
      <GameTile {...props} />
    </MemoryRouter>
  )

describe("GameTile", () => {
  it("renders the game name", () => {
    renderTile({ name: "Nertz", url: "/nertz" })
    expect(screen.getByText("Nertz")).not.toBeNull()
  })

  it("links to the provided url", () => {
    renderTile({ name: "Nertz", url: "/nertz" })
    const link = screen.getByRole("link")
    expect(link.getAttribute("href")).toBe("/nertz")
  })

  it("renders the custom image with correct alt text when img is provided", () => {
    renderTile({ name: "Nertz", url: "/nertz", img: "/nertz-cover.png" })
    const img = screen.getByAltText("Nertz") as HTMLImageElement
    expect(img.src).toContain("nertz-cover.png")
  })

  it("renders the coming soon image when img is not provided", () => {
    renderTile({ name: "Nertz", url: "/nertz" })
    const img = screen.getByAltText("Nertz") as HTMLImageElement
    expect(img).not.toBeNull()
  })

  it("renders inside a bordered card container", () => {
    const { container } = renderTile({ name: "Nertz", url: "/nertz" })
    const card = container.firstChild as HTMLElement
    expect(card.className).toContain("border")
    expect(card.className).toContain("rounded-lg")
  })
})
