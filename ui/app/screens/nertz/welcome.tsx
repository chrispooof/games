import { useState } from "react"
import { trpc } from "~/lib/trpc"
import { socket } from "~/lib/socket"
import { getPlayerId } from "~/lib/player-id"

type View = "welcome" | "hosting" | "joining"

interface PlayerRef {
  playerId: string
}

interface NertzWelcomeProps {
  onHost: (playerCount: number, roomCode: string, initialPlayers: PlayerRef[]) => void
  onJoin: (roomCode: string, initialPlayers: PlayerRef[]) => void
}

/**
 * Welcome / lobby screen for Nertz. Manages three views — welcome, hosting, and joining —
 * via local state and calls the appropriate prop callback when the player commits.
 */
const NertzWelcome = ({ onHost, onJoin }: NertzWelcomeProps) => {
  const [view, setView] = useState<View>("welcome")
  const [playerCount, setPlayerCount] = useState(2)
  const [joinCode, setJoinCode] = useState("")

  const createGame = trpc.game.create.useMutation({
    onSuccess: (data) => {
      // Host also joins the room via socket so they receive real-time events
      socket.connect()
      socket.once("connect", () => {
        socket.emit("join-room", { roomCode: data.roomCode, playerId: getPlayerId() })
      })
      socket.once("room-state", ({ players }: { players: PlayerRef[] }) => {
        onHost(playerCount, data.roomCode, players)
      })
    },
  })

  const handleCreate = () => {
    createGame.mutate({ playerCount })
  }

  const handleJoin = () => {
    const code = joinCode.trim().toUpperCase()
    if (code.length === 0) return
    socket.connect()
    socket.once("connect", () => {
      socket.emit("join-room", { roomCode: code, playerId: getPlayerId() })
    })
    socket.once("room-state", ({ players }: { players: PlayerRef[] }) => {
      onJoin(code, players)
    })
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-[#1a472a] rounded-xl min-h-0">
      {view === "welcome" && (
        <div className="flex flex-col items-center gap-10">
          <div className="flex gap-6 text-4xl opacity-30 select-none">
            <span className="text-white">♠</span>
            <span className="text-red-400">♥</span>
            <span className="text-red-400">♦</span>
            <span className="text-white">♣</span>
          </div>

          <h1 className="text-8xl font-black text-white tracking-tight drop-shadow-2xl">Nertz!</h1>

          <div className="flex gap-4">
            <button
              onClick={() => setView("hosting")}
              className="px-8 py-4 bg-amber-600 hover:bg-amber-500 text-white font-bold text-lg rounded-lg shadow-lg transition-colors cursor-pointer"
            >
              Host a Game
            </button>
            <button
              onClick={() => setView("joining")}
              className="px-8 py-4 bg-white/10 hover:bg-white/20 text-white font-bold text-lg rounded-lg shadow-lg transition-colors border border-white/20 cursor-pointer"
            >
              Join a Game
            </button>
          </div>
        </div>
      )}

      {view === "hosting" && (
        <div className="flex flex-col items-center gap-8 bg-black/20 rounded-2xl p-10 shadow-2xl border border-white/10 w-80">
          <h2 className="text-3xl font-bold text-white">Host a Game</h2>

          <div className="flex flex-col gap-2 w-full">
            <label className="text-white/70 font-medium text-xs uppercase tracking-wider">
              Number of Players
            </label>
            <input
              type="number"
              min={2}
              max={8}
              value={playerCount}
              onChange={(e) =>
                setPlayerCount(Math.min(8, Math.max(2, Number(e.target.value) || 2)))
              }
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white text-2xl font-bold text-center focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
            />
            <p className="text-white/40 text-xs text-center">Between 2 and 8 players</p>
          </div>

          <button
            onClick={handleCreate}
            className="w-full px-8 py-4 bg-amber-600 hover:bg-amber-500 text-white font-bold text-lg rounded-lg shadow-lg transition-colors cursor-pointer"
          >
            Create Game
          </button>

          <button
            onClick={() => setView("welcome")}
            className="text-white/50 hover:text-white/80 text-sm transition-colors cursor-pointer"
          >
            ← Back
          </button>
        </div>
      )}

      {view === "joining" && (
        <div className="flex flex-col items-center gap-8 bg-black/20 rounded-2xl p-10 shadow-2xl border border-white/10 w-80">
          <h2 className="text-3xl font-bold text-white">Join a Game</h2>

          <div className="flex flex-col gap-2 w-full">
            <label className="text-white/70 font-medium text-xs uppercase tracking-wider">
              Room Code
            </label>
            <input
              type="text"
              maxLength={6}
              placeholder="XXXXXX"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white text-2xl font-bold text-center tracking-widest uppercase placeholder:text-white/20 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
            />
          </div>

          <button
            onClick={handleJoin}
            disabled={joinCode.trim().length === 0}
            className="w-full px-8 py-4 bg-amber-600 hover:bg-amber-500 disabled:bg-white/10 disabled:text-white/30 disabled:cursor-not-allowed text-white font-bold text-lg rounded-lg shadow-lg transition-colors cursor-pointer"
          >
            Join
          </button>

          <button
            onClick={() => setView("welcome")}
            className="text-white/50 hover:text-white/80 text-sm transition-colors cursor-pointer"
          >
            ← Back
          </button>
        </div>
      )}
    </div>
  )
}

export default NertzWelcome
