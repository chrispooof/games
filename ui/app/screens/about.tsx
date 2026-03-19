import ChristianBjerreFernandes from "~/assets/christian-bjerre-fernandes.png"
import GithubIcon from "~/assets/icons/github-icon.svg"
import LinkedinIcon from "~/assets/icons/linkedin-icon.svg"

const AboutScreen = () => {
  return (
    <div className="flex flex-col flex-1 items-center">
      <h1 className="text-4xl font-bold mb-8">Christian Bjerre-Fernandes</h1>
      <img
        className="w-64 h-64 rounded-full mb-4"
        src={ChristianBjerreFernandes}
        alt="Christian Bjerre Fernandes"
      />
      <div className="flex-1 flex items-center">
        <div className="text-center text-gray-500">
          Just a page of silly games I coded out for fun.
        </div>
      </div>
      <div className="flex gap-4 pb-6">
        <a href="https://github.com/chrispooof" target="_blank" rel="noopener noreferrer">
          <img className="w-8 h-8" src={GithubIcon} alt="GitHub" />
        </a>
        <a
          href="https://www.linkedin.com/in/christian-bjerre-fernandes/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img className="w-8 h-8" src={LinkedinIcon} alt="LinkedIn" />
        </a>
      </div>
    </div>
  )
}

export default AboutScreen
