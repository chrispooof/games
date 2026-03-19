const STORAGE_KEY = "nertz_player_id"

/**
 * Returns a stable player ID for this browser, generating and persisting one
 * in localStorage on first call. Used to identify players across reconnections.
 */
export const getPlayerId = (): string => {
  const existing = localStorage.getItem(STORAGE_KEY)
  if (existing) return existing
  const id = crypto.randomUUID()
  localStorage.setItem(STORAGE_KEY, id)
  return id
}
