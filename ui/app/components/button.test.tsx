import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import Button from "./button"

afterEach(cleanup)

describe("Button", () => {
  describe("variants", () => {
    it("renders primary variant by default", () => {
      render(<Button>Click me</Button>)
      const btn = screen.getByRole("button", { name: "Click me" })
      expect(btn.className).toContain("bg-amber-600")
    })

    it("renders secondary variant", () => {
      render(<Button variant="secondary">Click me</Button>)
      const btn = screen.getByRole("button", { name: "Click me" })
      expect(btn.className).toContain("bg-white/10")
    })

    it("renders tertiary variant", () => {
      render(<Button variant="tertiary">Click me</Button>)
      const btn = screen.getByRole("button", { name: "Click me" })
      expect(btn.className).toContain("text-white/50")
    })
  })

  describe("onClick", () => {
    it("calls onClick when clicked", () => {
      const onClick = vi.fn()
      render(<Button onClick={onClick}>Click me</Button>)
      fireEvent.click(screen.getByRole("button", { name: "Click me" }))
      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it("does not call onClick when disabled", () => {
      const onClick = vi.fn()
      render(
        <Button onClick={onClick} isDisabled>
          Click me
        </Button>
      )
      fireEvent.click(screen.getByRole("button"))
      expect(onClick).not.toHaveBeenCalled()
    })

    it("does not call onClick when loading", () => {
      const onClick = vi.fn()
      render(
        <Button onClick={onClick} isLoading>
          Click me
        </Button>
      )
      fireEvent.click(screen.getByRole("button"))
      expect(onClick).not.toHaveBeenCalled()
    })
  })

  describe("isDisabled", () => {
    it("sets the disabled attribute", () => {
      render(<Button isDisabled>Click me</Button>)
      const button = screen.getByRole("button") as HTMLButtonElement
      expect(button.disabled).toBe(true)
    })

    it("applies reduced opacity", () => {
      render(<Button isDisabled>Click me</Button>)
      expect(screen.getByRole("button").className).toContain("opacity-40")
    })
  })

  describe("isLoading", () => {
    it("renders the spinner", () => {
      render(<Button isLoading>Click me</Button>)
      expect(screen.getByRole("button").querySelector("svg")).not.toBeNull()
    })

    it("hides the label while loading", () => {
      render(<Button isLoading>Click me</Button>)
      const label = screen.getByText("Click me")
      expect(label.className).toContain("invisible")
    })

    it("disables the button while loading", () => {
      render(<Button isLoading>Click me</Button>)
      const button = screen.getByRole("button") as HTMLButtonElement
      expect(button.disabled).toBe(true)
    })
  })

  describe("className", () => {
    it("appends extra className", () => {
      render(<Button className="w-full">Click me</Button>)
      expect(screen.getByRole("button").className).toContain("w-full")
    })
  })
})
