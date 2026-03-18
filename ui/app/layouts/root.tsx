import { Outlet } from "react-router"
import Footer from "../components/footer"
import Header from "../components/header"

const RootLayout = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex flex-col container mx-auto px-4 py-8">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

export default RootLayout
