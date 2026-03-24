const STORAGE_KEY = "nertz_username"

const ADJECTIVES = [
  "Fuzzy",
  "Sneaky",
  "Grumpy",
  "Jolly",
  "Wobbly",
  "Zany",
  "Clumsy",
  "Bouncy",
  "Cranky",
  "Dizzy",
  "Fluffy",
  "Grouchy",
  "Jumpy",
  "Loopy",
  "Messy",
  "Noisy",
  "Pesky",
  "Quirky",
  "Rowdy",
  "Silly",
  "Tipsy",
  "Wacky",
  "Zippy",
  "Snarky",
]

const ANIMALS = [
  "Badger",
  "Capybara",
  "Dingo",
  "Ferret",
  "Gecko",
  "Hamster",
  "Iguana",
  "Jackal",
  "Koala",
  "Lemur",
  "Meerkat",
  "Narwhal",
  "Otter",
  "Platypus",
  "Quokka",
  "Raccoon",
  "Sloth",
  "Tapir",
  "Vole",
  "Wombat",
  "Yak",
  "Porcupine",
  "Chinchilla",
  "Axolotl",
]

/** Picks a random element from an array */
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

/** Generates a random silly username like "FuzzyCapybara" */
export const generateSillyUsername = (): string => `${pick(ADJECTIVES)}${pick(ANIMALS)}`

/**
 * Returns the player's stored username, generating and persisting a silly one
 * on first call.
 */
export const getUsername = (): string => {
  const existing = localStorage.getItem(STORAGE_KEY)
  if (existing) return existing
  const generated = generateSillyUsername()
  localStorage.setItem(STORAGE_KEY, generated)
  return generated
}

/** Persists the player's chosen username to localStorage. */
export const setUsername = (name: string): void => {
  localStorage.setItem(STORAGE_KEY, name.trim())
}
