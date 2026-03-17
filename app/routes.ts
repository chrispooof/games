import { type RouteConfig, index, layout, route } from "@react-router/dev/routes"

export default [
  layout("layouts/root.tsx", [
    index("routes/home.tsx"),
    route("about", "routes/about.tsx"),
    route("nertz", "routes/nertz.tsx"),
  ]),
] satisfies RouteConfig
