/** Card grid layout — sized to match GLB card dimensions (0.63 x 0.88) */
export const CARD_WIDTH = 0.63
export const CARD_DEPTH = 0.88
export const COLS = 13
export const COL_GAP = 0.75
export const ROW_GAP = 1.05

/** Y position of cards laid flat on the table surface */
export const CARD_Y_OFFSET = 0.01

/** Y height of a card while being dragged (lifted slightly above the table) */
export const CARD_DRAG_Y = 0.15

/** Maximum delta time per frame (seconds) to prevent spiral-of-death on tab resume */
export const MAX_DELTA_TIME = 0.05

/** Scene background color (dark green) */
export const SCENE_BACKGROUND_COLOR = 0x1a472a

/** Camera field of view (degrees) */
export const CAMERA_FOV = 60

/** Top-down camera height above the table before the intro zoom (close-up view) */
export const CAMERA_HEIGHT = 13

/** Camera height after the intro zoom-out completes (full table view) */
export const INTRO_CAMERA_HEIGHT = 12

/** Extra radial distance behind the player's seat for the angled camera */
export const CAMERA_BEHIND_DISTANCE = 2

/** Y position (height) of the angled perspective camera */
export const CAMERA_ANGLE_HEIGHT = 5

/** Bias along the radial direction for the camera look-at target (negative = toward center) */
export const CAMERA_LOOKAT_FORWARD = -0.3

/** Distance from the table center to each player's seat (world units) */
export const SEAT_RADIUS = 2.5

/** Distance beyond the seat center where each player's dealt pile lands (world units) */
export const PILE_OFFSET = 0.5

/** Snap radius for foundation slots — cards dropped within this distance snap to the slot center */
export const FOUNDATION_SNAP_RADIUS = 0.45

/** Scale multiplier for foundation slot outlines (larger = bigger visual target) */
export const FOUNDATION_OUTLINE_SCALE = 1.2

/** Scale multiplier for cards placed on foundation piles (easier to read from angled camera) */
export const FOUNDATION_CARD_SCALE = 1.2

/** Y increment per card in a foundation pile — prevents z-fighting as the pile grows */
export const FOUNDATION_PILE_Y_STEP = 0.003

/** Directional (key) light color and intensity */
export const DIR_LIGHT_COLOR = 0xfff5e0
export const DIR_LIGHT_INTENSITY = 1.5

/** Height of the directional light above the scene */
export const DIR_LIGHT_HEIGHT = 20

/** Shadow map resolution (width and height in pixels) */
export const SHADOW_MAP_SIZE = 2048

/** Directional light shadow camera frustum bounds */
export const SHADOW_CAM_NEAR = 0.1
export const SHADOW_CAM_FAR = 50
export const SHADOW_CAM_EXTENT = 15

/** Ambient fill light color and intensity */
export const AMBIENT_LIGHT_COLOR = 0xffffff
export const AMBIENT_LIGHT_INTENSITY = 0.6

/** Felt playing surface color and material properties */
export const FELT_COLOR = 0x2d6a4f
export const FELT_ROUGHNESS = 0.9

/** Wood border color */
export const BORDER_COLOR = 0x5c3d1e

/** Extra size added to each side of the border plane beyond the felt */
export const TABLE_BORDER_PADDING = 0.1

/** Y offset of the border below the felt to prevent z-fighting */
export const BORDER_Y_OFFSET = -0.01

/** Scale multiplier applied to a card on hover */
export const HOVER_SCALE = 1.5

/** Extra Y lift when a card is hovered */
export const HOVER_LIFT_Y = 0.08

/** Emissive glow color for playable cards (idle hint) */
export const PLAYABLE_GLOW_COLOR = 0x00ff00

/** Emissive intensity for playable cards (idle hint) */
export const PLAYABLE_GLOW_INTENSITY = 0.15

/** Milliseconds of inactivity before playable card hints appear */
export const IDLE_HINT_DELAY_MS = 15_000

/** Numeric values for each card rank */
export const RANK_VALUES: Record<string, number> = {
  A: 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
}
