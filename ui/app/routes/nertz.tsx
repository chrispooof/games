import { useEffect, useRef, useState } from "react"
import type { Route } from "./+types/nertz"
import { NertzGame } from "~/games"
import { PLAYER_BACK_COLORS } from "~/games/nertz/src/world/player-deck"
import NertzWelcome from "~/screens/nertz/welcome"
import { socket } from "~/lib/socket"
import { getPlayerId } from "~/lib/player-id"

export const meta: Route.MetaFunction = () => {
  return [{ title: "Nertz" }, { name: "description", content: "Nertz game" }]
}

interface PlayerRef {
  playerId: string
}

interface GameState {
  cardPositions?: Record<string, { x: number; z: number }>
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
  const [disconnected, setDisconnected] = useState<Set<string>>(new Set())
  const [notification, setNotification] = useState<Notification | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<NertzGame | null>(null)

  /** Create and destroy the game instance whenever the scene changes */
  useEffect(() => {
    if (scene.type !== "game" || !containerRef.current) return

    // Players are sorted by join order from the server — local player's index determines
    // which deck runs the intro animation vs. which are shown at their saved positions
    const localPlayerIndex = scene.initialPlayers.findIndex((p) => p.playerId === getPlayerId())
    const cardPositions = scene.gameState?.cardPositions ?? null

    const game = new NertzGame(
      containerRef.current,
      scene.maxPlayers,
      scene.initialPlayers.length,
      localPlayerIndex >= 0 ? localPlayerIndex : 0,
      cardPositions
    )
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
      socket.emit("join-room", { roomCode, playerId: getPlayerId() })
    }

    const onPlayerJoined = ({ playerId }: { playerId: string }) => {
      setPlayers((prev) => {
        if (prev.includes(playerId)) return prev
        const index = prev.length
        const color = `#${PLAYER_BACK_COLORS[index % PLAYER_BACK_COLORS.length].toString(16).padStart(6, "0")}`
        setNotification({ message: `Player ${index + 1} joined`, color })
        setTimeout(() => setNotification(null), 3000)
        gameRef.current?.addPlayer()
        return [...prev, playerId]
      })
    }

    const onPlayerReconnected = ({ playerId }: { playerId: string }) => {
      setDisconnected((prev) => {
        const next = new Set(prev)
        next.delete(playerId)
        return next
      })
      setNotification({ message: "A player reconnected", color: "#ffffff" })
      setTimeout(() => setNotification(null), 2000)
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

    /** Applies saved card positions — used on socket reconnect and when other players
     *  finish their intro and broadcast their initial pile layout */
    const onRoomState = ({ gameState }: { gameState: GameState | null }) => {
      if (gameState?.cardPositions) {
        gameRef.current?.applyState(gameState.cardPositions)
      }
    }

    const onGameStateUpdate = ({
      cardPositions,
    }: {
      cardPositions: Record<string, { x: number; z: number }>
    }) => {
      gameRef.current?.applyState(cardPositions)
    }

    socket.on("connect", onConnect)
    socket.on("player-joined", onPlayerJoined)
    socket.on("player-reconnected", onPlayerReconnected)
    socket.on("player-disconnected", onPlayerDisconnected)
    socket.on("player-left", onPlayerLeft)
    socket.on("game-action", onGameAction)
    socket.on("room-state", onRoomState)
    socket.on("game-state-update", onGameStateUpdate)

    return () => {
      socket.off("connect", onConnect)
      socket.off("player-joined", onPlayerJoined)
      socket.off("player-reconnected", onPlayerReconnected)
      socket.off("player-disconnected", onPlayerDisconnected)
      socket.off("player-left", onPlayerLeft)
      socket.off("game-action", onGameAction)
      socket.off("room-state", onRoomState)
      socket.off("game-state-update", onGameStateUpdate)
    }
  }, [scene])

  if (scene.type === "lobby") {
    return (
      <NertzWelcome
        onHost={(playerCount, roomCode, initialPlayers, gameState, maxPlayers) => {
          setPlayers(initialPlayers.map((p) => p.playerId))
          setScene({ type: "game", roomCode, maxPlayers, isHost: true, initialPlayers, gameState })
        }}
        onJoin={(roomCode, initialPlayers, gameState, maxPlayers) => {
          setPlayers(initialPlayers.map((p) => p.playerId))
          setScene({
            type: "game",
            roomCode,
            maxPlayers,
            isHost: false,
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
            title={id}
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

      <div className="absolute top-3 right-3 z-10 bg-black/60 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/10 select-none">
        <p className="text-white/50 text-xs uppercase tracking-widest font-medium">Room Code</p>
        <p className="text-white text-2xl font-black tracking-widest">{scene.roomCode}</p>
      </div>
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  )
}
