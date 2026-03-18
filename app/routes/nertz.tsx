import { useEffect, useRef, useState } from "react"
import type { Route } from "./+types/nertz"
import { NertzGame } from "~/games"
import NertzWelcome from "~/screens/nertz/welcome"

export const meta: Route.MetaFunction = () => {
  return [{ title: "Nertz" }, { name: "description", content: "Nertz game" }]
}

type Scene =
  | { type: "lobby" }
  | { type: "game"; roomCode: string; playerCount: number; isHost: boolean }

export default function NertzRoute() {
  const [scene, setScene] = useState<Scene>({ type: "lobby" })
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scene.type !== "game" || !containerRef.current) return
    const game = new NertzGame(containerRef.current)
    return () => game.destroy()
  }, [scene])

  if (scene.type === "lobby") {
    return (
      <NertzWelcome
        onHost={(playerCount, roomCode) =>
          setScene({ type: "game", roomCode, playerCount, isHost: true })
        }
        onJoin={(roomCode) => setScene({ type: "game", roomCode, playerCount: 0, isHost: false })}
      />
    )
  }

  return (
    <div className="relative w-full flex-1 min-h-0 rounded-xl overflow-hidden">
      {scene.isHost && (
        <div className="absolute top-3 right-3 z-10 bg-black/60 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/10 select-none">
          <p className="text-white/50 text-xs uppercase tracking-widest font-medium">Room Code</p>
          <p className="text-white text-2xl font-black tracking-widest">{scene.roomCode}</p>
        </div>
      )}
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  )
}
