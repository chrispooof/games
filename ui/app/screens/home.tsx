import GameTile from "~/components/game-tile"
import nertzImg from "~/assets/nertz.png"

const HomeScreen = () => {
  return (
    <div className="flex flex-col items-center justify-center">
      <h1 className="text-4xl font-bold mb-8">Home</h1>
      <div>
        <GameTile name="Nertz" url="/nertz" img={nertzImg} />
      </div>
    </div>
  )
}

export default HomeScreen
