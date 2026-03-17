import AboutScreen from "~/screens/about"
import type { Route } from "./+types/about"

export const meta: Route.MetaFunction = () => {
  return [{ title: "About" }, { name: "description", content: "Learn more about this project." }]
}

const About = () => {
  return <AboutScreen />
}

export default About
