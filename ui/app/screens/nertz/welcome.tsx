import { useState } from "react"
import { trpc } from "~/lib/trpc"
import { socket } from "~/lib/socket"
import { getPlayerId } from "~/lib/player-id"
import { getUsername, setUsername } from "~/lib/username"
import Button from "~/components/button"
import RulesOverlay from "~/screens/nertz/rules-overlay"

type View = "welcome" | "hosting" | "joining"

interface PlayerRef {
  playerId: string
  username?: string
}

interface GameState {
  cardPositions?: Record<string, { x: number; z: number }>
  nertzCounts?: Record<string, number>
  nertzTops?: Record<string, string | null>
  phase?: "waiting" | "dealing" | "playing" | "finished"
  startedAt?: string | null
}

interface NertzWelcomeProps {
  onHost: (
    playerCount: number,
    roomCode: string,
    initialPlayers: PlayerRef[],
    gameState: GameState | null,
    maxPlayers: number
  ) => void
  onJoin: (
    roomCode: string,
    initialPlayers: PlayerRef[],
    gameState: GameState | null,
    maxPlayers: number
  ) => void
}

/**
 * Welcome / lobby screen for Nertz. Manages three views — welcome, hosting, and joining —
 * via local state and calls the appropriate prop callback when the player commits.
 */
const NertzWelcome = ({ onHost, onJoin }: NertzWelcomeProps) => {
  const [view, setView] = useState<View>("welcome")
  const [showRules, setShowRules] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [playerCount, setPlayerCount] = useState(2)
  const [joinCode, setJoinCode] = useState("")
  const [createError, setCreateError] = useState<string | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [username, setUsernameState] = useState(() => getUsername())

  const createGame = trpc.game.create.useMutation({
    onMutate: () => {
      setCreateError(null)
    },
    onSuccess: (data) => {
      if (!data) return
      // Host also joins the room via socket so they receive real-time events
      socket.connect()
      socket.once("connect", () => {
        socket.emit("join-room", { roomCode: data.roomCode, playerId: getPlayerId(), username })
      })
      socket.once(
        "room-state",
        ({
          players,
          gameState,
          maxPlayers,
          nertzCounts,
          nertzTops,
          phase,
          startedAt,
        }: {
          players: PlayerRef[]
          gameState: GameState | null
          maxPlayers: number
          nertzCounts?: Record<string, number>
          nertzTops?: Record<string, string | null>
          phase?: GameState["phase"]
          startedAt?: string | null
        }) => {
          const state = gameState
            ? { ...gameState, nertzCounts, nertzTops, phase, startedAt }
            : null
          onHost(playerCount, data.roomCode, players, state, maxPlayers)
        }
      )
    },
    onError: () => {
      setCreateError("Unable to create a game right now. Please try again in a moment.")
    },
  })

  /**
   * Creates a new game room with the specified player count.
   */
  const handleCreate = () => {
    createGame.mutate({ playerCount })
  }

  /**
   * Joins an existing game room with the specified room code.
   */
  const handleJoin = () => {
    const code = joinCode.trim().toUpperCase()
    if (code.length === 0) return
    setJoinError(null)
    socket.connect()
    socket.once("connect", () => {
      setIsLoading(true)
      socket.emit("join-room", { roomCode: code, playerId: getPlayerId(), username })
    })

    const onRoomState = ({
      players,
      gameState,
      maxPlayers,
      nertzCounts,
      nertzTops,
    }: {
      players: PlayerRef[]
      gameState: GameState | null
      maxPlayers: number
      nertzCounts?: Record<string, number>
      nertzTops?: Record<string, string | null>
    }) => {
      setIsLoading(false)
      socket.off("error", onError)
      const state = gameState ? { ...gameState, nertzCounts, nertzTops } : null
      onJoin(code, players, state, maxPlayers)
    }

    const onError = ({ message }: { message: string }) => {
      socket.off("room-state", onRoomState)
      socket.disconnect()
      setJoinError(message)
      setIsLoading(false)
    }

    socket.once("room-state", onRoomState)
    socket.once("error", onError)
  }

  return (
    <div className="relative flex-1 flex items-center justify-center bg-[#1a472a] rounded-xl min-h-0">
      {view === "welcome" && (
        <div className="flex flex-col items-center gap-10">
          <div className="flex gap-6 text-4xl opacity-30 select-none">
            <span className="text-white">♠</span>
            <span className="text-red-400">♥</span>
            <span className="text-red-400">♦</span>
            <span className="text-white">♣</span>
          </div>

          <h1 className="text-8xl font-black text-white tracking-tight drop-shadow-2xl">Nertz!</h1>

          <div className="flex flex-col items-center gap-3 w-72">
            <label className="text-white/60 font-medium text-xs uppercase tracking-wider self-start">
              Your Name
            </label>
            <input
              type="text"
              maxLength={24}
              value={username}
              onChange={(e) => {
                setUsernameState(e.target.value)
                setUsername(e.target.value)
              }}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white text-lg font-bold text-center focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
            />
          </div>

          <div className="flex gap-4">
            <Button onClick={() => setView("hosting")}>Host a Game</Button>
            <Button variant="secondary" onClick={() => setView("joining")}>
              Join a Game
            </Button>
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

          <Button onClick={handleCreate} isLoading={createGame.isPending} className="w-full">
            Create Game
          </Button>

          {createError && <p className="text-red-400 text-sm text-center -mt-4">{createError}</p>}

          <Button variant="tertiary" onClick={() => setView("welcome")}>
            ← Back
          </Button>
        </div>
      )}

      <button
        onClick={() => setShowRules(true)}
        className="absolute bottom-4 left-4 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 text-white/70 text-sm font-bold hover:bg-white/10 hover:text-white transition-all select-none"
      >
        ?
      </button>

      {showRules && <RulesOverlay onClose={() => setShowRules(false)} />}

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

          {joinError && <p className="text-red-400 text-sm text-center -mt-4">{joinError}</p>}

          <Button
            isLoading={isLoading}
            onClick={handleJoin}
            isDisabled={joinCode.trim().length < 6}
            className="w-full"
          >
            Join
          </Button>

          <Button variant="tertiary" onClick={() => setView("welcome")}>
            ← Back
          </Button>
        </div>
      )}
    </div>
  )
}

export default NertzWelcome
