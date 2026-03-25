import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import ScoreScreen from "./score-screen"

afterEach(cleanup)

const players = ["p0", "p1"]
const usernames = new Map([
  ["p0", "Alice"],
  ["p1", "Bob"],
])
const scores = {
  p0: { foundationCards: 10, nertzRemaining: 2, total: 8 },
  p1: { foundationCards: 6, nertzRemaining: 0, total: 6 },
}

describe("ScoreScreen", () => {
  it("renders all player rows", () => {
    render(
      <ScoreScreen
        scores={scores}
        players={players}
        usernames={usernames}
        winnerId="p0"
        elapsed="1:23"
        onPlayAgain={vi.fn()}
      />
    )
    expect(screen.getByText("Alice")).toBeDefined()
    expect(screen.getByText("Bob")).toBeDefined()
  })

  it("winner row shows crown", () => {
    render(
      <ScoreScreen
        scores={scores}
        players={players}
        usernames={usernames}
        winnerId="p0"
        elapsed="1:23"
        onPlayAgain={vi.fn()}
      />
    )
    expect(screen.getByText(/♛/)).toBeDefined()
  })

  it("rows sorted by total score descending", () => {
    render(
      <ScoreScreen
        scores={scores}
        players={players}
        usernames={usernames}
        winnerId="p0"
        elapsed="1:23"
        onPlayAgain={vi.fn()}
      />
    )
    const names = screen.getAllByText(/Alice|Bob/).map((el) => el.textContent)
    // Alice (total 8) should appear before Bob (total 6)
    expect(names[0]).toContain("Alice")
  })

  it("calls onPlayAgain when button clicked", () => {
    const onPlayAgain = vi.fn()
    render(
      <ScoreScreen
        scores={scores}
        players={players}
        usernames={usernames}
        winnerId="p0"
        elapsed="1:23"
        onPlayAgain={onPlayAgain}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: "Play Again" }))
    expect(onPlayAgain).toHaveBeenCalledTimes(1)
  })

  it("shows elapsed time", () => {
    render(
      <ScoreScreen
        scores={scores}
        players={players}
        usernames={usernames}
        winnerId="p0"
        elapsed="2:47"
        onPlayAgain={vi.fn()}
      />
    )
    expect(screen.getByText("2:47")).toBeDefined()
  })
})
