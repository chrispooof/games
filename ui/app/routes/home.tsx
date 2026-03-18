import type { Route } from "./+types/home"
import HomeScreen from "~/screens/home"

export const meta: Route.MetaFunction = () => {
  return [
    { title: "Games" },
    { name: "description", content: "Welcome to Games by Christian Bjerre-Fernandes" },
  ]
}

const Home = () => {
  return <HomeScreen />
}

export default Home
