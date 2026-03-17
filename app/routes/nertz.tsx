import { useEffect, useRef } from "react"
import type { Route } from "./+types/nertz"
import { NertzGame } from "~/games"

export const meta: Route.MetaFunction = () => {
  return [{ title: "Nertz" }, { name: "description", content: "Nertz game" }]
}

export default function NertzRoute() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const game = new NertzGame(containerRef.current)
    return () => game.destroy()
  }, [])

  return <div ref={containerRef} className="w-full flex-1 min-h-0" />
}
