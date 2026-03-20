import { describe, it, expect, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import Header from "./header"

afterEach(cleanup)

describe("Header", () => {
  it("renders a header element", () => {
    const { container } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    )
    expect(container.querySelector("header")).not.toBeNull()
  })

  it("renders the Games nav link", () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    )
    const link = screen.getByRole("link", { name: /games/i })
    expect(link).not.toBeNull()
    expect(link.getAttribute("href")).toBe("/")
  })

  it("renders the About nav link", () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    )
    const link = screen.getByRole("link", { name: /about/i })
    expect(link).not.toBeNull()
    expect(link.getAttribute("href")).toBe("/about")
  })

  it("marks the active link with the active class", () => {
    render(
      <MemoryRouter initialEntries={["/about"]}>
        <Header />
      </MemoryRouter>
    )
    const aboutLink = screen.getByRole("link", { name: /about/i })
    expect(aboutLink.className).toContain("active")
  })
})
