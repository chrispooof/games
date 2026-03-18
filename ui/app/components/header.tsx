import { NavLink } from "react-router"

const Header = () => {
  return (
    <header className="border-b border-gray-200">
      <div className="flex items-center gap-4 justify-center mx-auto p-4">
        <NavLink to="/">
          <h1 className="text-2xl font-bold">Games</h1>
        </NavLink>
        <NavLink to="/about">
          <h1 className="text-2xl font-bold">About</h1>
        </NavLink>
      </div>
    </header>
  )
}

export default Header
