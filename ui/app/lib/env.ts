interface PublicEnvironment {
  VITE_API_URL?: string
}

type ApiEnvironment = ImportMetaEnv | PublicEnvironment

const DEFAULT_API_URL = "http://localhost:3001"

/**
 * Resolves the public API base URL for browser and build-time usage.
 */
export const resolveApiUrl = (env: ApiEnvironment = import.meta.env): string =>
  env.VITE_API_URL?.trim() || DEFAULT_API_URL

export const publicEnv = {
  apiUrl: resolveApiUrl(),
}
