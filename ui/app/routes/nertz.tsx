import { useEffect, useRef, useState, useCallback } from "react"
import type { Route } from "./+types/nertz"
import { NertzGame } from "~/games"
import { PLAYER_BACK_COLORS } from "~/games/nertz/src/world/player-deck"
import NertzWelcome from "~/screens/nertz/welcome"
import RulesOverlay from "~/screens/nertz/rules-overlay"
import ScoreScreen from "~/screens/nertz/score-screen"
import type { PlayerScore } from "~/screens/nertz/score-screen"
import { socket } from "~/lib/socket"
import { getPlayerId } from "~/lib/player-id"
import { getUsername } from "~/lib/username"
import type { ActionResult } from "~/games/nertz/src/types/actions"
import type { InitialLocalPileState } from "~/games/nertz/src/game"

export const meta: Route.MetaFunction = () => {
  return [{ title: "Nertz" }, { name: "description", content: "Nertz game" }]
}

interface PlayerRef {
  playerId: string
  username?: string
}

interface GameState {
  cardPositions?: Record<string, { x: number; z: number }>
  foundations?: Array<{ suit: string | null; topValue: number }>
  nertzCounts?: Record<string, number>
  nertzTops?: Record<string, string | null>
  phase?: "waiting" | "dealing" | "playing" | "finished"
  startedAt?: string | null
  players?: Array<{
    playerId: string
    nertzPile: string[]
    workPiles: [string[], string[], string[], string[]]
    stock: string[]
    waste: string[]
  }>
}

type Scene =
  | { type: "lobby" }
  | {
      type: "game"
      roomCode: string
      maxPlayers: number
      isHost: boolean
      initialPlayers: PlayerRef[]
      gameState: GameState | null
    }

interface Notification {
  message: string
  color: string
}

export default function NertzRoute() {
  const [scene, setScene] = useState<Scene>({ type: "lobby" })
  const [players, setPlayers] = useState<string[]>([])
  const [usernames, setUsernames] = useState<Map<string, string>>(new Map())
  const [disconnected, setDisconnected] = useState<Set<string>>(new Set())
  const [notification, setNotification] = useState<Notification | null>(null)
  const [gamePhase, setGamePhase] = useState<"waiting" | "playing" | "finished">("waiting")
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState("0:00")
  const [nertzEmpty, setNertzEmpty] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [scores, setScores] = useState<Record<string, PlayerScore>>({})
  const [winnerId, setWinnerId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<NertzGame | null>(null)

  const getLocalPileState = (gameState: GameState | null): InitialLocalPileState | null => {
    const localId = getPlayerId()
    const playerState = gameState?.players?.find((p) => p.playerId === localId)
    if (!playerState) return null
    return {
      nertzPile: [...playerState.nertzPile],
      workPiles: playerState.workPiles.map((pile) => [...pile]) as [
        string[],
        string[],
        string[],
        string[],
      ],
      stock: [...playerState.stock],
      waste: [...playerState.waste],
    }
  }

  /** Formats milliseconds elapsed into M:SS */
  const formatElapsed = useCallback((ms: number): string => {
    const totalSec = Math.floor(ms / 1000)
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${m}:${s.toString().padStart(2, "0")}`
  }, [])

  /** Ticks the elapsed timer once per second while the game is playing */
  useEffect(() => {
    if (!startedAt || gamePhase !== "playing") return
    const tick = () => setElapsed(formatElapsed(Date.now() - startedAt))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startedAt, gamePhase, formatElapsed])

  /** Create and destroy the game instance whenever the scene changes */
  useEffect(() => {
    if (scene.type !== "game" || !containerRef.current) return

    // Players are sorted by join order from the server — local player's index determines
    // which deck runs the intro animation vs. which are shown at their saved positions
    const localPlayerIndex = scene.initialPlayers.findIndex((p) => p.playerId === getPlayerId())
    const cardPositions = scene.gameState?.cardPositions ?? null
    const initialFoundations = scene.gameState?.foundations ?? null
    const initialLocalPileState = getLocalPileState(scene.gameState)

    const game = new NertzGame(
      containerRef.current,
      scene.maxPlayers,
      scene.initialPlayers.length,
      localPlayerIndex >= 0 ? localPlayerIndex : 0,
      cardPositions,
      initialFoundations,
      initialLocalPileState
    )
    game.setPlayerIds(
      scene.initialPlayers.map((p) => p.playerId),
      getPlayerId(),
      usernames
    )
    if (scene.gameState?.nertzCounts) {
      game.updateOpponentCounts(scene.gameState.nertzCounts, scene.gameState.nertzTops)
    }
    // Apply phase from server state (reconnect mid-game or game already started)
    const initialPhase = scene.gameState?.phase
    if (initialPhase === "playing" || initialPhase === "finished") {
      game.setGamePhase(initialPhase)
    }
    game.setNertzCountCallback((count) => setNertzEmpty(count === 0))
    gameRef.current = game

    return () => {
      game.destroy()
      gameRef.current = null
    }
  }, [scene])

  /** Attach socket event listeners for the duration of the in-game scene */
  useEffect(() => {
    if (scene.type !== "game") return

    const { roomCode } = scene

    /** Re-join the room if the socket auto-reconnects after a network blip */
    const onConnect = () => {
      socket.emit("join-room", { roomCode, playerId: getPlayerId(), username: getUsername() })
    }

    const onPlayerJoined = ({ playerId, username }: { playerId: string; username?: string }) => {
      setPlayers((prev) => {
        if (prev.includes(playerId)) return prev
        const index = prev.length
        const color = `#${PLAYER_BACK_COLORS[index % PLAYER_BACK_COLORS.length].toString(16).padStart(6, "0")}`
        setNotification({ message: `${username ?? "A player"} joined`, color })
        setTimeout(() => setNotification(null), 3000)
        gameRef.current?.addPlayer()
        const updated = [...prev, playerId]
        // Build updated usernames inline so the new entry is visible to setPlayerIds
        const updatedUsernames = username ? new Map(usernames).set(playerId, username) : usernames
        setUsernames(updatedUsernames)
        gameRef.current?.setPlayerIds(updated, getPlayerId(), updatedUsernames)
        return updated
      })
    }

    const onPlayerReconnected = ({ playerId }: { playerId: string }) => {
      setDisconnected((prev) => {
        const next = new Set(prev)
        next.delete(playerId)
        return next
      })
      setUsernames((prev) => {
        const name = prev.get(playerId)
        setNotification({ message: `${name ?? "A player"} reconnected`, color: "#ffffff" })
        setTimeout(() => setNotification(null), 2000)
        return prev
      })
    }

    const onPlayerDisconnected = ({ playerId }: { playerId: string }) => {
      setDisconnected((prev) => new Set([...prev, playerId]))
    }

    const onPlayerLeft = ({ playerId }: { playerId: string }) => {
      setPlayers((prev) => prev.filter((id) => id !== playerId))
      setDisconnected((prev) => {
        const next = new Set(prev)
        next.delete(playerId)
        return next
      })
    }

    const onGameAction = (action: {
      type: string
      cardId: string
      position: { x: number; z: number }
    }) => {
      gameRef.current?.applyRemoteAction(action)
    }

    /** Server response to the local player's typed action (foundation/work-pile play) */
    const onActionResult = (result: ActionResult) => {
      gameRef.current?.applyActionResult(result)
    }

    /** Applies saved card positions — used on socket reconnect and when other players
     *  finish their intro and broadcast their initial pile layout */
    const onRoomState = ({
      gameState,
      nertzCounts,
      nertzTops,
    }: {
      gameState: GameState | null
      nertzCounts?: Record<string, number>
      nertzTops?: Record<string, string | null>
    }) => {
      if (gameState?.cardPositions) {
        gameRef.current?.applyState(gameState.cardPositions)
      }
      const localPileState = getLocalPileState(gameState)
      if (localPileState) {
        gameRef.current?.applyLocalPileState(localPileState)
      }
      if (nertzCounts) {
        gameRef.current?.updateOpponentCounts(nertzCounts, nertzTops)
      }
    }

    const onGameStateUpdate = ({
      cardPositions,
      foundations,
      nertzCounts,
      nertzTops,
    }: {
      cardPositions: Record<string, { x: number; z: number }>
      foundations?: Array<{ suit: string | null; topValue: number }>
      nertzCounts?: Record<string, number>
      nertzTops?: Record<string, string | null>
    }) => {
      gameRef.current?.applyState(cardPositions, foundations)
      if (nertzCounts) gameRef.current?.updateOpponentCounts(nertzCounts, nertzTops)
    }

    const onGameStarted = ({ startedAt: iso }: { startedAt: string }) => {
      const ts = new Date(iso).getTime()
      setStartedAt(ts)
      setGamePhase("playing")
      gameRef.current?.setGamePhase("playing")
    }

    const onGameOver = ({
      winnerId: wId,
      scores: incoming,
    }: {
      winnerId: string
      scores?: Record<string, PlayerScore>
    }) => {
      setGamePhase("finished")
      gameRef.current?.setGamePhase("finished")
      setWinnerId(wId)
      if (incoming) setScores(incoming)
      const winnerIndex = players.findIndex((id) => id === wId)
      const color =
        winnerIndex >= 0
          ? `#${PLAYER_BACK_COLORS[winnerIndex % PLAYER_BACK_COLORS.length].toString(16).padStart(6, "0")}`
          : "#ffffff"
      const winnerName = usernames.get(wId) ?? `Player ${winnerIndex + 1}`
      setNotification({ message: `${winnerName} wins! 🎉`, color })
    }

    socket.on("connect", onConnect)
    socket.on("player-joined", onPlayerJoined)
    socket.on("player-reconnected", onPlayerReconnected)
    socket.on("player-disconnected", onPlayerDisconnected)
    socket.on("player-left", onPlayerLeft)
    socket.on("game-action", onGameAction)
    socket.on("action-result", onActionResult)
    socket.on("room-state", onRoomState)
    socket.on("game-state-update", onGameStateUpdate)
    socket.on("game-started", onGameStarted)
    socket.on("game-over", onGameOver)

    return () => {
      socket.off("connect", onConnect)
      socket.off("player-joined", onPlayerJoined)
      socket.off("player-reconnected", onPlayerReconnected)
      socket.off("player-disconnected", onPlayerDisconnected)
      socket.off("player-left", onPlayerLeft)
      socket.off("game-action", onGameAction)
      socket.off("action-result", onActionResult)
      socket.off("room-state", onRoomState)
      socket.off("game-state-update", onGameStateUpdate)
      socket.off("game-started", onGameStarted)
      socket.off("game-over", onGameOver)
    }
  }, [scene])

  if (scene.type === "lobby") {
    return (
      <NertzWelcome
        onHost={(_playerCount, roomCode, initialPlayers, gameState, maxPlayers) => {
          setPlayers(initialPlayers.map((p) => p.playerId))
          setUsernames(
            new Map(initialPlayers.filter((p) => p.username).map((p) => [p.playerId, p.username!]))
          )
          const phase = gameState?.phase
          if (phase === "playing" || phase === "finished") {
            setGamePhase(phase)
            if (gameState?.startedAt) setStartedAt(new Date(gameState.startedAt).getTime())
          } else {
            setGamePhase("waiting")
            setStartedAt(null)
          }
          setScene({ type: "game", roomCode, maxPlayers, isHost: true, initialPlayers, gameState })
        }}
        onJoin={(roomCode, initialPlayers, gameState, maxPlayers) => {
          setPlayers(initialPlayers.map((p) => p.playerId))
          setUsernames(
            new Map(initialPlayers.filter((p) => p.username).map((p) => [p.playerId, p.username!]))
          )
          const phase = gameState?.phase
          if (phase === "playing" || phase === "finished") {
            setGamePhase(phase)
            if (gameState?.startedAt) setStartedAt(new Date(gameState.startedAt).getTime())
          } else {
            setGamePhase("waiting")
            setStartedAt(null)
          }
          setScene({
            type: "game",
            roomCode,
            maxPlayers,
            isHost: initialPlayers[0]?.playerId === getPlayerId(),
            initialPlayers,
            gameState,
          })
        }}
      />
    )
  }

  return (
    <div className="relative w-full flex-1 min-h-0 rounded-xl overflow-hidden">
      {notification && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 rounded-lg bg-black/70 backdrop-blur-sm border border-white/10 text-white text-sm font-semibold shadow-lg pointer-events-none select-none">
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: notification.color }}
          />
          {notification.message}
        </div>
      )}

      <div className="absolute top-3 left-3 z-10 flex gap-2">
        {players.map((id, i) => (
          <div
            key={id}
            title={usernames.get(id) ?? id}
            className={`w-6 h-6 rounded-full border-2 border-white/30 transition-opacity ${
              disconnected.has(id) ? "opacity-30" : "opacity-100"
            }`}
            style={{
              backgroundColor: `#${PLAYER_BACK_COLORS[i % PLAYER_BACK_COLORS.length]
                .toString(16)
                .padStart(6, "0")}`,
            }}
          />
        ))}
      </div>

      {/* Top-right: room code + timer */}
      <div className="absolute top-3 right-3 z-10 bg-black/60 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/10 select-none text-right">
        <p className="text-white/50 text-xs uppercase tracking-widest font-medium">Room Code</p>
        <p className="text-white text-2xl font-black tracking-widest">{scene.roomCode}</p>
        {gamePhase !== "waiting" && (
          <p className="text-white/60 text-sm font-mono mt-0.5">{elapsed}</p>
        )}
      </div>

      {/* Host "Start Game" button — only visible in waiting phase */}
      {scene.isHost && gamePhase === "waiting" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <button
            className="pointer-events-auto px-8 py-4 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-black text-xl font-black shadow-2xl transition-all select-none"
            onClick={() => socket.emit("start-game")}
          >
            Start Game
          </button>
        </div>
      )}

      {/* "Waiting for host" message for non-host players */}
      {!scene.isHost && gamePhase === "waiting" && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 px-4 py-2 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 text-white/60 text-sm select-none pointer-events-none">
          Waiting for host to start…
        </div>
      )}

      {/* Bottom row: Flip Stock + Nertz! */}
      <div className="absolute bottom-4 right-4 z-10 flex gap-2">
        {gamePhase === "playing" && nertzEmpty && (
          <button
            className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-95 text-black text-sm font-black shadow-lg select-none transition-all"
            onClick={() => gameRef.current?.callNertz()}
          >
            Nertz!
          </button>
        )}
        <button
          className="px-5 py-2 rounded-lg bg-black/70 backdrop-blur-sm border border-white/10 text-white text-sm font-semibold select-none hover:bg-white/10 active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none"
          disabled={gamePhase !== "playing"}
          onClick={() => gameRef.current?.flipStock()}
        >
          Flip Stock
        </button>
      </div>

      {/* ? rules button */}
      <button
        onClick={() => setShowRules(true)}
        className="absolute bottom-4 left-4 z-10 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 text-white/70 text-sm font-bold hover:bg-white/10 hover:text-white transition-all select-none"
      >
        ?
      </button>

      {showRules && <RulesOverlay onClose={() => setShowRules(false)} />}

      {gamePhase === "finished" && Object.keys(scores).length > 0 && (
        <ScoreScreen
          scores={scores}
          players={players}
          usernames={usernames}
          winnerId={winnerId ?? ""}
          elapsed={elapsed}
          onPlayAgain={() => {
            setScene({ type: "lobby" })
            setGamePhase("waiting")
            setStartedAt(null)
            setScores({})
            setWinnerId(null)
          }}
        />
      )}

      <div ref={containerRef} className="absolute inset-0" />
    </div>
  )
}
