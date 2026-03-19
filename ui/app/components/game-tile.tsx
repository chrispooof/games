import { NavLink } from "react-router"
import ComingSoon from "~/assets/coming-soon.png"

interface GameTileProps {
  name: string
  url?: string
  img?: string
}

const GameTile = ({ name, url, img }: GameTileProps) => {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <NavLink to={`${url}`}>
        {img && <img src={img} alt={name} className="w-full h-48 object-contain rounded-lg" />}
        {!img && (
          <img src={ComingSoon} alt={name} className="w-full h-48 object-contain rounded-lg" />
        )}
        <h2 className="text-xl font-bold mt-2">{name}</h2>
      </NavLink>
    </div>
  )
}

export default GameTile
