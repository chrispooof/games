import { describe, it, expect, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import Footer from "./footer"

afterEach(cleanup)

describe("Footer", () => {
  it("renders a footer element", () => {
    const { container } = render(<Footer />)
    expect(container.querySelector("footer")).not.toBeNull()
  })

  it("displays the MIT license text", () => {
    render(<Footer />)
    expect(screen.getByText(/mit/i)).not.toBeNull()
  })

  it("includes the current year", () => {
    render(<Footer />)
    const year = new Date().getFullYear().toString()
    expect(screen.getByText(new RegExp(year))).not.toBeNull()
  })
})
