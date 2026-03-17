import { NavLink } from "react-router"

interface GameTileProps {
  name: string
  url?: string
}

const GameTile = ({ name, url }: GameTileProps) => {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <NavLink to={`/nertz`}>
        {url && <img src={url} alt={name} className="w-full h-48 object-cover rounded-lg" />}
        <h2 className="text-xl font-bold mt-2">{name}</h2>
      </NavLink>
    </div>
  )
}

export default GameTile
