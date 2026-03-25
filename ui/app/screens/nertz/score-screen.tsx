import { PLAYER_BACK_COLORS } from "~/games/nertz/src/world/player-deck"

/** Per-player score breakdown from the server. */
export interface PlayerScore {
  foundationCards: number
  nertzRemaining: number
  total: number
}

interface ScoreScreenProps {
  scores: Record<string, PlayerScore>
  /** Player IDs in join order — index maps to PLAYER_BACK_COLORS */
  players: string[]
  usernames: Map<string, string>
  winnerId: string
  /** Frozen timer string from when the game ended */
  elapsed: string
  onPlayAgain: () => void
}

/**
 * Full-screen overlay shown after a Nertz game ends.
 * Displays sorted per-player scores with foundation cards, nertz remaining, and totals.
 */
const ScoreScreen = ({
  scores,
  players,
  usernames,
  winnerId,
  elapsed,
  onPlayAgain,
}: ScoreScreenProps) => {
  const sortedPlayers = [...players].sort((a, b) => {
    const aTotal = scores[a]?.total ?? 0
    const bTotal = scores[b]?.total ?? 0
    return bTotal - aTotal
  })

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#1a472a]/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <h1 className="text-white text-4xl font-black tracking-wide">Game Over</h1>
        <span className="px-3 py-1 rounded-lg bg-black/40 text-white/60 text-sm font-mono border border-white/10">
          {elapsed}
        </span>
      </div>

      {/* Score table */}
      <div className="w-full max-w-md flex flex-col gap-2 px-4">
        {sortedPlayers.map((playerId) => {
          const score = scores[playerId]
          const colorIndex = players.indexOf(playerId)
          const color = `#${PLAYER_BACK_COLORS[colorIndex % PLAYER_BACK_COLORS.length].toString(16).padStart(6, "0")}`
          const name = usernames.get(playerId) ?? `Player ${colorIndex + 1}`
          const isWinner = playerId === winnerId

          return (
            <div
              key={playerId}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                isWinner ? "bg-amber-500/20 border-amber-400/40" : "bg-black/30 border-white/10"
              }`}
            >
              <span
                className="w-4 h-4 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="flex-1 text-white font-semibold truncate">
                {isWinner && <span className="mr-1.5 text-amber-400">♛</span>}
                {name}
              </span>
              {score ? (
                <div className="flex items-center gap-2 text-sm font-mono">
                  <span className="text-green-400">+{score.foundationCards}</span>
                  {score.nertzRemaining > 0 && (
                    <span className="text-red-400">−{score.nertzRemaining}</span>
                  )}
                  <span className="text-white font-bold ml-1">= {score.total}</span>
                </div>
              ) : (
                <span className="text-white/30 text-sm font-mono">—</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Play Again */}
      <button
        className="mt-10 px-10 py-4 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-black text-xl font-black shadow-2xl transition-all select-none"
        onClick={onPlayAgain}
      >
        Play Again
      </button>
    </div>
  )
}

export default ScoreScreen
