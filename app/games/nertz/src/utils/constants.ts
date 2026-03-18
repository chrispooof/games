/** Card grid layout — sized to match GLB card dimensions (0.63 x 0.88) */
export const COLS = 13
export const COL_GAP = 0.75
export const ROW_GAP = 1.05

/** Y position of cards laid flat on the table surface */
export const CARD_Y_OFFSET = 0.01

/** Maximum delta time per frame (seconds) to prevent spiral-of-death on tab resume */
export const MAX_DELTA_TIME = 0.05

/** Scene background color (dark green) */
export const SCENE_BACKGROUND_COLOR = 0x1a472a

/** Camera field of view (degrees) */
export const CAMERA_FOV = 60

/** Top-down camera height above the table */
export const CAMERA_HEIGHT = 5

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
