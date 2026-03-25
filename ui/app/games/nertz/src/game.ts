import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import * as THREE from "three"
import { socket } from "~/lib/socket"
import deckUrl from "~/assets/deck.glb?url"
import { Table } from "./world/terrain"
import { FoundationArea } from "./world/foundations"
import { PLAYER_BACK_COLORS, PlayerDeck, type Seat } from "./world/player-deck"
import { DragControls, type ClientFoundationState } from "./controls/player"
import { ShuffleAnimation } from "./scenes/shuffle"
import { IntroAnimation } from "./scenes/intro"
import { FlipStockAnimation } from "./scenes/flip-stock"
import { computeSeat, computeDealPiles } from "./utils/geometry"
import type { GameAction, ActionResult } from "./types/actions"
import type { Card } from "../../shared/types/deck"
import {
  AMBIENT_LIGHT_COLOR,
  AMBIENT_LIGHT_INTENSITY,
  CARD_Y_OFFSET,
  CAMERA_ANGLE_HEIGHT,
  CAMERA_BEHIND_DISTANCE,
  CAMERA_FOV,
  CAMERA_LOOKAT_FORWARD,
  DIR_LIGHT_COLOR,
  DIR_LIGHT_HEIGHT,
  DIR_LIGHT_INTENSITY,
  MAX_DELTA_TIME,
  PILE_OFFSET,
  RANK_VALUES,
  IDLE_HINT_DELAY_MS,
  PLAYABLE_GLOW_COLOR,
  PLAYABLE_GLOW_INTENSITY,
  SCENE_BACKGROUND_COLOR,
  FOUNDATION_CARD_SCALE,
  FOUNDATION_PILE_Y_STEP,
  SHADOW_CAM_EXTENT,
  SHADOW_CAM_FAR,
  SHADOW_CAM_NEAR,
  SHADOW_MAP_SIZE,
} from "./utils/constants"

/** Parses the numeric rank value from a card ID of the form p{n}_Card_{rank}_{suit} */
const parseCardRankValue = (cardId: string): number => {
  const match = cardId.match(/^p\d+_Card_(.+)_\w+$/)
  return match ? (RANK_VALUES[match[1]] ?? 0) : 0
}

/** Pile indices in the 7-element computeDealPiles array */
const PILE_NERTZ = 0
const PILE_WORK_START = 1 // work piles at indices 1–4
const PILE_WASTE = 5
const PILE_STOCK = 6

/** How far each card in a fanned work pile is offset from the previous (world units) */
const WORK_PILE_FAN_OFFSET = 0.2

/** Base seat radius for low player counts (4 or fewer) */
const BASE_SEAT_RADIUS = 2.5
/** Extra seat radius per player above 4 to avoid crowding near foundations */
const SEAT_RADIUS_PER_PLAYER = 0.35

/** Computes seat radius scaled by total players so center foundations remain clear */
const computeSeatRadius = (maxPlayers: number): number =>
  BASE_SEAT_RADIUS + Math.max(0, maxPlayers - 4) * SEAT_RADIUS_PER_PLAYER

/** Local pile state maintained in parallel with the server */
interface LocalPileState {
  nertzPile: string[]
  workPiles: [string[], string[], string[], string[]]
  stock: string[]
  waste: string[]
}

export interface InitialLocalPileState {
  nertzPile: string[]
  workPiles: [string[], string[], string[], string[]]
  stock: string[]
  waste: string[]
}

/**
 * Main game class for Nertz. Owns the Three.js renderer, scene, and game loop.
 * Mount it by passing a container element; tear it down by calling `destroy()`.
 *
 * Pile layout per player (7 piles, centered):
 *   [Nertz, Work1, Work2, Work3, Work4, Waste, Stock]
 *    0       1      2      3      4      5      6
 *
 * Work piles are displayed as fanned stacks — each card offset toward the table
 * center so all cards are visible. The camera zooms out as work piles grow.
 */
export class NertzGame {
  private container: HTMLElement
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private loader: GLTFLoader
  private playerDecks: PlayerDeck[] = []
  private deckGlbScene: THREE.Object3D | null = null
  private table: Table | null = null
  private foundationArea: FoundationArea | null = null
  private dragControls!: DragControls
  private shuffle: ShuffleAnimation | null = null
  private intro: IntroAnimation | null = null
  private stockFlipAnim: FlipStockAnimation | null = null
  private lastTime = performance.now()
  private totalTime = 0
  /** Total seats around the table */
  private maxPlayers: number
  /** How many player decks to add once the GLB finishes loading */
  private initialDeckCount: number
  /** Which deck index belongs to the local player */
  private localPlayerIndex: number
  /** Reference to the local player's deck */
  private localDeck: PlayerDeck | null = null
  /** Seat transform for the local player */
  private localSeat: Seat | null = null
  /** All seven pile positions for the local player (set after intro completes) */
  private localPilePositions: Array<{ x: number; z: number }> | null = null
  /** Pile ordering for the local player — updated on confirmed server actions */
  private localPileState: LocalPileState | null = null
  /**
   * Mirrors the server's foundation state so DragControls can snap to the right slot.
   * Updated on every confirmed foundation play (local or remote).
   */
  private localFoundationState: ClientFoundationState[] = []
  /** Saved positions from the server — skips intro when present */
  private initialCardPositions: Record<string, { x: number; z: number }> | null
  /** In-flight typed action awaiting an `action-result` response */
  private pendingAction: GameAction | null = null
  /** Whether the host has started the game — blocks all moves until true */
  private gamePhase: "waiting" | "playing" | "finished" = "waiting"
  /** Callback fired when the local nertz pile count changes */
  private onNertzCountChange: ((count: number) => void) | null = null

  /** Radial direction components from center toward local player's seat */
  private radialX = 0
  private radialZ = 1

  /** DOM element showing the nertz pile remaining card count */
  private nertzCountEl: HTMLDivElement | null = null

  /** Timestamp of last successful player action — used for idle hint delay */
  private lastActionTime = 0
  /** Whether playable card highlights are currently active */
  private hintsActive = false

  /** DOM elements for opponent nertz count badges, keyed by playerId */
  private opponentEls = new Map<string, HTMLDivElement>()
  /** Ordered list of player IDs (set externally via route) */
  private playerIds: string[] = []
  /** Local player's ID */
  private localPlayerId = ""
  /** Display names keyed by playerId */
  private usernames: Map<string, string> = new Map()

  /** Offscreen renderer for capturing card face images */
  private miniRenderer: THREE.WebGLRenderer | null = null
  /** Offscreen scene containing a single card for snapshot rendering */
  private miniScene: THREE.Scene | null = null
  /** Orthographic camera sized to frame one card for the mini renderer */
  private miniCamera: THREE.OrthographicCamera | null = null
  /** Cached data-URL images of rendered card faces, keyed by card ID */
  private cardImageCache = new Map<string, string>()
  /** Dynamic seat radius scaled by player count */
  private seatRadius: number
  /** Last received opponent counts/tops — re-applied after decks load */
  private lastOpponentCounts: Record<string, number> | null = null
  private lastOpponentTops: Record<string, string | null> | null = null

  /**
   * @param container - The DOM element that will host the WebGL canvas
   * @param maxPlayers - Total seat count; governs seat angle spacing
   * @param initialDeckCount - How many player decks to create on load
   * @param localPlayerIndex - Deck index for the local player
   * @param initialCardPositions - Saved server positions; skips the intro when present
   * @param initialFoundations - Server foundation state for reconnects; pre-populates smart snap
   */
  constructor(
    container: HTMLElement,
    maxPlayers = 1,
    initialDeckCount = 1,
    localPlayerIndex = 0,
    initialCardPositions: Record<string, { x: number; z: number }> | null = null,
    initialFoundations: ClientFoundationState[] | null = null,
    initialLocalPileState: InitialLocalPileState | null = null
  ) {
    this.container = container
    this.maxPlayers = maxPlayers
    this.initialDeckCount = initialDeckCount
    this.localPlayerIndex = localPlayerIndex
    this.seatRadius = computeSeatRadius(maxPlayers)
    this.initialCardPositions = initialCardPositions
    if (initialLocalPileState) {
      this.localPileState = {
        nertzPile: [...initialLocalPileState.nertzPile],
        workPiles: initialLocalPileState.workPiles.map((p) => [...p]) as [
          string[],
          string[],
          string[],
          string[],
        ],
        stock: [...initialLocalPileState.stock],
        waste: [...initialLocalPileState.waste],
      }
    }
    // Initialize foundation state: use server state if available, else all empty slots
    this.localFoundationState =
      initialFoundations ??
      Array.from({ length: maxPlayers * 4 }, () => ({ suit: null, topValue: 0 }))
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(SCENE_BACKGROUND_COLOR)
    this.camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      100
    )
    this.loader = new GLTFLoader()
    this.addLights()
    this.refreshTable()
    this.foundationArea = new FoundationArea(maxPlayers)
    this.scene.add(this.foundationArea)
    this.dragControls = new DragControls(
      this.camera,
      this.renderer.domElement,
      [],
      (cardId, position, foundationSlotIndex, workPileIndex) => {
        this.handleCardDrop(cardId, position, foundationSlotIndex, workPileIndex)
      }
    )
    this.dragControls.setFoundationSlots(this.foundationArea.slots)
    this.dragControls.setFoundationStates(this.localFoundationState)
    this.loadDeck()
    this.init()
  }

  /** Mounts the canvas, attaches event listeners, and starts the render loop */
  private init() {
    this.container.appendChild(this.renderer.domElement)
    window.addEventListener("resize", this.onResize)
    this.dragControls.attach()

    const localSeat = computeSeat(this.localPlayerIndex, this.maxPlayers, this.seatRadius)
    this.radialX = Math.sin(localSeat.angle)
    this.radialZ = Math.cos(localSeat.angle)
    this.positionCamera()

    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight)
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.shadowMap.enabled = true
    this.setupNertzCounter()
    this.setupMiniRenderer()
    this.renderer.setAnimationLoop(() => this.update())
  }

  /** Creates the nertz pile card count badge overlay */
  private setupNertzCounter(): void {
    const el = document.createElement("div")
    el.style.cssText =
      "position:absolute;pointer-events:none;user-select:none;" +
      "background:rgba(0,0,0,0.7);color:#fff;font-weight:bold;font-size:14px;" +
      "padding:2px 8px;border-radius:10px;backdrop-filter:blur(4px);" +
      "border:1px solid rgba(255,255,255,0.2);display:none;"
    this.container.style.position = "relative"
    this.container.appendChild(el)
    this.nertzCountEl = el
  }

  /** Creates a tiny offscreen WebGL renderer + scene for snapshotting card faces */
  private setupMiniRenderer(): void {
    const w = 140
    const h = 196
    this.miniRenderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    })
    this.miniRenderer.setSize(w, h)
    this.miniScene = new THREE.Scene()
    const hw = 0.63 / 2
    const hh = 0.88 / 2
    this.miniCamera = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 0.1, 10)
    this.miniCamera.position.set(0, 2, 0)
    this.miniCamera.lookAt(0, 0, 0)
    this.miniScene.add(new THREE.AmbientLight(0xffffff, 2))
  }

  /**
   * Renders a card face to a data-URL image using the offscreen mini renderer.
   * Results are cached so each card is only rendered once.
   */
  private renderCardImage(cardId: string): string | null {
    if (this.cardImageCache.has(cardId)) return this.cardImageCache.get(cardId)!
    if (!this.miniRenderer || !this.miniScene || !this.miniCamera) return null
    const card = this.playerDecks.flatMap((d) => d.cards).find((c) => c.id === cardId)
    if (!card) return null

    const clone = card.object.clone(true)
    clone.position.set(0, 0, 0)
    clone.rotation.set(0, 0, 0)
    clone.visible = true
    this.miniScene.add(clone)
    this.miniRenderer.render(this.miniScene, this.miniCamera)
    const dataUrl = this.miniRenderer.domElement.toDataURL()
    this.miniScene.remove(clone)
    this.cardImageCache.set(cardId, dataUrl)
    return dataUrl
  }

  /** Projects a world position to screen coordinates and updates the nertz count badge */
  private updateNertzCounter(): void {
    if (!this.nertzCountEl || !this.localPileState || !this.localPilePositions) return
    const count = this.localPileState.nertzPile.length
    this.nertzCountEl.textContent = `${count}`
    this.nertzCountEl.style.display = count > 0 ? "" : "none"
    this.onNertzCountChange?.(count)

    const nertzBase = this.localPilePositions[0]
    const pos = new THREE.Vector3(nertzBase.x, 0.5, nertzBase.z)
    pos.project(this.camera)
    const cw = this.container.clientWidth
    const ch = this.container.clientHeight
    const sx = (pos.x * 0.5 + 0.5) * cw
    const sy = (-pos.y * 0.5 + 0.5) * ch
    this.nertzCountEl.style.transform = `translate(${sx - 16}px, ${sy - 24}px)`
  }

  /**
   * Sets ordered player IDs and local player ID so opponent overlays can be created.
   * Call after construction from the route component.
   */
  setPlayerIds(playerIds: string[], localPlayerId: string, usernames?: Map<string, string>): void {
    this.playerIds = playerIds
    this.localPlayerId = localPlayerId
    if (usernames) this.usernames = usernames
    this.setupOpponentOverlays()
  }

  /** Creates DOM badge elements for each non-local player at the top of the screen */
  private setupOpponentOverlays(): void {
    for (const el of this.opponentEls.values()) el.remove()
    this.opponentEls.clear()

    const opponents = this.playerIds
      .map((id, i) => ({ id, index: i }))
      .filter((p) => p.id !== this.localPlayerId)

    opponents.forEach((opp, i) => {
      const el = document.createElement("div")
      const color = PLAYER_BACK_COLORS[opp.index % PLAYER_BACK_COLORS.length]
      const hex = `#${color.toString(16).padStart(6, "0")}`
      el.style.cssText =
        "position:absolute;top:48px;pointer-events:none;user-select:none;" +
        "display:flex;align-items:center;gap:10px;" +
        "background:rgba(0,0,0,0.75);color:#fff;font-weight:bold;" +
        "padding:6px 12px;border-radius:14px;backdrop-filter:blur(4px);" +
        `border:2px solid ${hex};`
      el.style.left = "50%"
      el.style.transform = `translateX(calc(-50% + ${(i - (opponents.length - 1) / 2) * 150}px))`

      // Rendered card image
      const img = document.createElement("img")
      img.setAttribute("data-card-img", "")
      img.style.cssText =
        "width:48px;height:67px;border-radius:4px;" +
        "box-shadow:0 2px 6px rgba(0,0,0,0.4);background:#555;display:block;"
      el.appendChild(img)

      // Username + nertz pile count stacked in a column
      const info = document.createElement("div")
      info.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:2px;"

      const name = document.createElement("span")
      name.setAttribute("data-username", "")
      name.textContent = this.usernames.get(opp.id) ?? ""
      name.style.cssText =
        "font-size:11px;opacity:0.7;max-width:90px;overflow:hidden;" +
        "text-overflow:ellipsis;white-space:nowrap;text-align:center;"
      info.appendChild(name)

      const count = document.createElement("span")
      count.setAttribute("data-count", "")
      count.textContent = "13"
      count.style.cssText = "font-size:20px;min-width:22px;text-align:center;"
      info.appendChild(count)

      el.appendChild(info)

      this.container.appendChild(el)
      this.opponentEls.set(opp.id, el)
    })
  }

  /**
   * Updates opponent nertz pile counts and top card image from server broadcast.
   * Called by the route when a `game-state-update` includes `nertzCounts`.
   */
  updateOpponentCounts(counts: Record<string, number>, tops?: Record<string, string | null>): void {
    this.lastOpponentCounts = counts
    if (tops) this.lastOpponentTops = tops
    for (const [playerId, el] of this.opponentEls) {
      const count = counts[playerId]
      if (count === undefined) continue
      const countSpan = el.querySelector("[data-count]") as HTMLSpanElement | null
      if (countSpan) countSpan.textContent = `${count}`
      if (tops) {
        const topCardId = tops[playerId]
        const img = el.querySelector("[data-card-img]") as HTMLImageElement | null
        if (img && topCardId) {
          const dataUrl = this.renderCardImage(topCardId)
          if (dataUrl) img.src = dataUrl
        }
      }
    }
  }

  /** Positions the camera behind and above the local player, angled toward the table center */
  private positionCamera(extraOffset = 0): void {
    const dist = this.seatRadius + CAMERA_BEHIND_DISTANCE + extraOffset
    this.camera.position.set(
      this.radialX * dist,
      CAMERA_ANGLE_HEIGHT + extraOffset * 0.5,
      this.radialZ * dist
    )
    this.camera.up.set(0, 1, 0)
    this.camera.lookAt(
      this.radialX * CAMERA_LOOKAT_FORWARD,
      0,
      this.radialZ * CAMERA_LOOKAT_FORWARD
    )
  }

  /** Adds a directional key light and ambient fill light to the scene */
  private addLights() {
    const dirLight = new THREE.DirectionalLight(DIR_LIGHT_COLOR, DIR_LIGHT_INTENSITY)
    dirLight.position.set(0, DIR_LIGHT_HEIGHT, 0)
    dirLight.castShadow = true
    dirLight.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE)
    dirLight.shadow.camera.near = SHADOW_CAM_NEAR
    dirLight.shadow.camera.far = SHADOW_CAM_FAR
    dirLight.shadow.camera.left = -SHADOW_CAM_EXTENT
    dirLight.shadow.camera.right = SHADOW_CAM_EXTENT
    dirLight.shadow.camera.top = SHADOW_CAM_EXTENT
    dirLight.shadow.camera.bottom = -SHADOW_CAM_EXTENT
    this.scene.add(dirLight)
    this.scene.add(new THREE.AmbientLight(AMBIENT_LIGHT_COLOR, AMBIENT_LIGHT_INTENSITY))
  }

  private refreshTable() {
    if (this.table) this.scene.remove(this.table)
    this.table = new Table(this.seatRadius + 2)
    this.scene.add(this.table)
  }

  private loadDeck() {
    this.loader.load(deckUrl, (deckGlb) => {
      this.deckGlbScene = deckGlb.scene
      for (let i = 0; i < this.initialDeckCount; i++) {
        this.addPlayer()
      }
      // Re-apply opponent counts now that card meshes are available for rendering
      if (this.lastOpponentCounts) {
        this.updateOpponentCounts(this.lastOpponentCounts, this.lastOpponentTops ?? undefined)
      }
    })
  }

  /**
   * Adds a new player deck at the next available seat.
   * Local player's deck runs the shuffle → deal intro unless saved positions exist.
   * Remote decks are hidden until their `game-state-update` arrives.
   */
  addPlayer() {
    if (!this.deckGlbScene) return
    const deckIndex = this.playerDecks.length
    const isLocalPlayer = deckIndex === this.localPlayerIndex
    const seat = computeSeat(deckIndex, this.maxPlayers, this.seatRadius)

    const deck = new PlayerDeck(deckIndex)
    deck.buildFromGLB(this.deckGlbScene, this.scene, seat)
    this.playerDecks.push(deck)

    if (isLocalPlayer) {
      this.localDeck = deck
      this.localSeat = seat
      const hasPositions = this.applyInitialPositions(deck)
      if (hasPositions) {
        this.positionCamera()
        this.localPilePositions = computeDealPiles(seat, this.seatRadius, PILE_OFFSET)
        if (this.localPileState) {
          this.refreshLocalDisplay()
        } else {
          this.updateDraggableCards()
          this.registerWorkPilesWithDragControls()
        }
        this.registerStockWithDragControls()
      } else {
        const perpDir = { x: Math.cos(seat.angle), z: -Math.sin(seat.angle) }
        this.shuffle = new ShuffleAnimation(deck.cards, { x: seat.x, z: seat.z }, perpDir)
      }
    } else {
      const hasPositions = this.applyInitialPositions(deck)
      if (!hasPositions) {
        for (const card of deck.cards) {
          card.object.visible = false
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Display state helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns face rotation (rotation.z) for a card at the given position during state restore.
   * Foundation cards are face-up (0); nertz pile top and work pile cards face-up;
   * everything else face-down (π).
   */
  private getFaceRotation(cardId: string, x: number, z: number): number {
    if (this.getFoundationAngle(x, z) !== null) return 0

    const match = cardId.match(/^p(\d+)_/)
    if (!match) return Math.PI
    const seat = computeSeat(parseInt(match[1]), this.maxPlayers, this.seatRadius)
    const piles = computeDealPiles(seat, this.seatRadius, PILE_OFFSET)
    // Nertz pile, work pile bases, and waste pile are face-up on initial deal
    for (let i = PILE_NERTZ; i <= PILE_WASTE; i++) {
      if (Math.abs(x - piles[i].x) < 0.01 && Math.abs(z - piles[i].z) < 0.01) return 0
    }

    // Work pile cards at fanned positions (offset toward player) are also face-up
    const fanDirX = Math.sin(seat.angle)
    const fanDirZ = Math.cos(seat.angle)
    for (let wi = 0; wi < 4; wi++) {
      const base = piles[PILE_WORK_START + wi]
      const dx = x - base.x
      const dz = z - base.z
      const proj = dx * fanDirX + dz * fanDirZ
      const perpX = dx - proj * fanDirX
      const perpZ = dz - proj * fanDirZ
      const perpDist = Math.sqrt(perpX ** 2 + perpZ ** 2)
      if (proj >= -0.05 && proj <= 14 * WORK_PILE_FAN_OFFSET + 0.05 && perpDist < 0.1) {
        return 0
      }
    }

    return Math.PI
  }

  /** Returns the foundation slot angle for the given position, or null if not a slot */
  private getFoundationAngle(x: number, z: number): number | null {
    if (!this.foundationArea) return null
    for (const slot of this.foundationArea.slots) {
      const dist = Math.sqrt((x - slot.x) ** 2 + (z - slot.z) ** 2)
      if (dist < 0.01) return slot.angle
    }
    return null
  }

  /**
   * Refreshes all local pile visuals from `localPileState`.
   * Called after every confirmed action to keep rendering in sync.
   *
   * - Work piles: fanned toward table center so all cards are visible
   * - Nertz pile: top card face-up, rest face-down
   * - Waste pile: all face-up (stacked)
   * - Stock pile: all face-down (stacked)
   * - Camera: zooms out as work piles grow
   */
  private refreshLocalDisplay(): void {
    if (!this.localPileState || !this.localDeck || !this.localPilePositions || !this.localSeat)
      return
    // Defer position updates while a stock flip animation owns the card positions
    if (this.stockFlipAnim) return

    // Fan direction: toward player (positive radial) — cards extend downward on screen
    const fanDirX = Math.sin(this.localSeat.angle)
    const fanDirZ = Math.cos(this.localSeat.angle)

    // Nertz pile: all face-down except the top card.
    // Each card is staggered slightly toward the player (fanDir) so the stack
    // looks visibly thicker as more cards remain — you can see card edges from above.
    const nertzBase = this.localPilePositions[PILE_NERTZ]
    const nertzTop = this.localPileState.nertzPile[this.localPileState.nertzPile.length - 1]
    this.localPileState.nertzPile.forEach((cardId, i) => {
      const card = this.localDeck!.cards.find((c) => c.id === cardId)
      if (!card) return
      const isTop = cardId === nertzTop
      card.object.position.set(
        nertzBase.x + i * 0.005 * fanDirX,
        CARD_Y_OFFSET + i * 0.004 + (isTop ? 0.01 : 0),
        nertzBase.z + i * 0.005 * fanDirZ
      )
      card.object.rotation.z = isTop ? 0 : Math.PI
    })

    // Work piles: fanned face-up toward center; each card offset by WORK_PILE_FAN_OFFSET
    for (let wi = 0; wi < 4; wi++) {
      const pile = this.localPileState.workPiles[wi]
      const basePos = this.localPilePositions[PILE_WORK_START + wi]
      pile.forEach((cardId, i) => {
        const card = this.localDeck!.cards.find((c) => c.id === cardId)
        if (!card) return
        card.object.visible = true
        card.object.position.set(
          basePos.x + i * WORK_PILE_FAN_OFFSET * fanDirX,
          CARD_Y_OFFSET + i * 0.01,
          basePos.z + i * WORK_PILE_FAN_OFFSET * fanDirZ
        )
        card.object.rotation.z = 0 // all work pile cards face-up
      })
    }

    // Waste pile: all face-up, stacked with a mild stagger so it looks like
    // an actual discard pile rather than a single card.
    const wasteBase = this.localPilePositions[PILE_WASTE]
    this.localPileState.waste.forEach((cardId, i) => {
      const card = this.localDeck!.cards.find((c) => c.id === cardId)
      if (!card) return
      card.object.visible = true
      card.object.position.set(
        wasteBase.x + i * 0.003 * fanDirX,
        CARD_Y_OFFSET + i * 0.002,
        wasteBase.z + i * 0.003 * fanDirZ
      )
      card.object.rotation.z = 0 // face-up
    })

    // Stock pile: all face-down, staggered toward the player so depth is visible.
    // A full stock of 35 cards looks noticeably thicker than a depleted one.
    const stockBase = this.localPilePositions[PILE_STOCK]
    this.localPileState.stock.forEach((cardId, i) => {
      const card = this.localDeck!.cards.find((c) => c.id === cardId)
      if (!card) return
      card.object.position.set(
        stockBase.x + i * 0.005 * fanDirX,
        CARD_Y_OFFSET + i * 0.004,
        stockBase.z + i * 0.005 * fanDirZ
      )
      card.object.rotation.z = Math.PI // face-down
    })

    // Camera: pull back as work piles grow (0.3 units per card beyond depth 3)
    const maxDepth = Math.max(...this.localPileState.workPiles.map((p) => p.length))
    const extraOffset = Math.max(0, maxDepth - 3) * 0.3
    this.positionCamera(extraOffset)

    this.updateDraggableCards()
    this.registerWorkPilesWithDragControls()
    this.updateNertzCounter()
  }

  private applyInitialPositions(deck: PlayerDeck): boolean {
    if (!this.initialCardPositions) return false
    const isLocal = deck.playerIndex === this.localPlayerIndex
    let applied = false
    for (const card of deck.cards) {
      const pos = this.initialCardPositions[card.id]
      if (pos) {
        card.object.position.x = pos.x
        card.object.position.z = pos.z
        card.object.position.y = CARD_Y_OFFSET + this.computeCardFanY(card.id, pos.x, pos.z)
        card.object.rotation.z = this.getFaceRotation(card.id, pos.x, pos.z)
        const foundationAngle = this.getFoundationAngle(pos.x, pos.z)
        if (foundationAngle !== null) {
          card.object.rotation.y = foundationAngle
          card.object.scale.setScalar(FOUNDATION_CARD_SCALE)
          card.object.visible = true
        } else {
          card.object.scale.setScalar(1)
          card.object.visible = isLocal
        }
        applied = true
      }
    }
    return applied
  }

  /**
   * Applies a batch of card positions to all decks.
   * Used for reconnect state restore and other-player position broadcasts.
   * @param foundations - Optional updated foundation state from the server broadcast.
   *   Passed when the remote action was a foundation play so smart snap stays accurate.
   */
  applyState(
    positions: Record<string, { x: number; z: number }>,
    foundations?: ClientFoundationState[]
  ): void {
    if (foundations) {
      this.localFoundationState = foundations
      this.dragControls.setFoundationStates(this.localFoundationState)
    }
    for (const deck of this.playerDecks) {
      // Local player cards are managed by refreshLocalDisplay — skip them here
      // to avoid stale server positions overwriting current local state
      if (deck === this.localDeck) continue
      for (const card of deck.cards) {
        const pos = positions[card.id]
        if (pos) {
          card.object.position.x = pos.x
          card.object.position.z = pos.z
          card.object.position.y = CARD_Y_OFFSET + this.computeCardFanY(card.id, pos.x, pos.z)
          card.object.rotation.z = this.getFaceRotation(card.id, pos.x, pos.z)
          const foundationAngle = this.getFoundationAngle(pos.x, pos.z)
          if (foundationAngle !== null) {
            card.object.rotation.y = foundationAngle
            card.object.scale.setScalar(FOUNDATION_CARD_SCALE)
            card.object.visible = true // Foundation cards always visible
          } else {
            card.object.scale.setScalar(1)
            card.object.visible = false // Remote player non-foundation cards hidden
          }
        }
      }
    }
  }

  /**
   * Replaces local pile ordering from an authoritative server snapshot (e.g. reconnect room-state),
   * then refreshes the local player's display/draggables.
   */
  applyLocalPileState(pileState: InitialLocalPileState): void {
    this.localPileState = {
      nertzPile: [...pileState.nertzPile],
      workPiles: pileState.workPiles.map((p) => [...p]) as [string[], string[], string[], string[]],
      stock: [...pileState.stock],
      waste: [...pileState.waste],
    }
    this.refreshLocalDisplay()
    this.registerStockWithDragControls()
  }

  /**
   * Computes the y-offset above CARD_Y_OFFSET for a card at the given world position.
   * Handles nertz pile, stock pile, work pile, and foundation stacking to prevent z-fighting.
   */
  private computeCardFanY(cardId: string, x: number, z: number): number {
    // Foundation piles: each card sits one step above the previous.
    // Card rank value equals its depth (Ace=1st, 2=2nd, …, King=13th).
    if (this.foundationArea) {
      for (const slot of this.foundationArea.slots) {
        if (Math.abs(x - slot.x) < 0.05 && Math.abs(z - slot.z) < 0.05) {
          const value = parseCardRankValue(cardId)
          return Math.max(0, value - 1) * FOUNDATION_PILE_Y_STEP
        }
      }
    }

    const match = cardId.match(/^p(\d+)_/)
    if (!match) return 0
    const seat = computeSeat(parseInt(match[1]), this.maxPlayers, this.seatRadius)
    const piles = computeDealPiles(seat, this.seatRadius, PILE_OFFSET)
    const fanDirX = Math.sin(seat.angle)
    const fanDirZ = Math.cos(seat.angle)

    // Nertz pile (index 0): staggered 0.005 along fanDir, Y += i * 0.004
    const nertzBase = piles[PILE_NERTZ]
    const ndx = x - nertzBase.x
    const ndz = z - nertzBase.z
    const nProj = ndx * fanDirX + ndz * fanDirZ
    const nPerpDist = Math.sqrt((ndx - nProj * fanDirX) ** 2 + (ndz - nProj * fanDirZ) ** 2)
    if (nProj >= -0.01 && nProj <= 13 * 0.005 + 0.01 && nPerpDist < 0.1) {
      return Math.round(nProj / 0.005) * 0.004
    }

    // Stock pile (index 6): same stagger pattern as nertz
    const stockBase = piles[PILE_STOCK]
    const sdx = x - stockBase.x
    const sdz = z - stockBase.z
    const sProj = sdx * fanDirX + sdz * fanDirZ
    const sPerpDist = Math.sqrt((sdx - sProj * fanDirX) ** 2 + (sdz - sProj * fanDirZ) ** 2)
    if (sProj >= -0.01 && sProj <= 35 * 0.005 + 0.01 && sPerpDist < 0.1) {
      return Math.round(sProj / 0.005) * 0.004
    }

    // Work piles (indices 1–4): fanned with WORK_PILE_FAN_OFFSET spacing
    for (let wi = 0; wi < 4; wi++) {
      const base = piles[PILE_WORK_START + wi]
      const dx = x - base.x
      const dz = z - base.z
      const proj = dx * fanDirX + dz * fanDirZ
      const perpX = dx - proj * fanDirX
      const perpZ = dz - proj * fanDirZ
      const perpDist = Math.sqrt(perpX ** 2 + perpZ ** 2)
      if (proj >= -0.05 && proj <= 14 * WORK_PILE_FAN_OFFSET + 0.05 && perpDist < 0.1) {
        return Math.round(proj / WORK_PILE_FAN_OFFSET) * 0.01
      }
    }
    return 0
  }

  /** Handles the legacy `move-card` broadcast from remote players */
  applyRemoteAction(action: {
    type: string
    cardId: string
    position: { x: number; z: number }
  }): void {
    if (action.type !== "move-card") return
    const card = this.playerDecks.flatMap((d) => d.cards).find((c) => c.id === action.cardId)
    if (!card) return
    card.object.position.x = action.position.x
    card.object.position.z = action.position.z
    const foundationAngle = this.getFoundationAngle(action.position.x, action.position.z)
    if (foundationAngle !== null) {
      card.object.rotation.y = foundationAngle
      card.object.scale.setScalar(FOUNDATION_CARD_SCALE)
    }
  }

  /**
   * Handles the server's response to a typed game action.
   * On success: updates local pile state then refreshes all display.
   * On failure: snaps the card back to its pre-drag position.
   */
  applyActionResult(result: ActionResult): void {
    const action = this.pendingAction
    this.pendingAction = null

    if (!result.ok) {
      this.dragControls.snapBackCard(result.cardId)
      // Refresh the full display to restore correct fanned y-positions — snapBackCard
      // only restores x/z and hardcodes y=CARD_Y_OFFSET, which causes z-fighting
      // when the card was mid-stack in a fanned pile.
      this.refreshLocalDisplay()
      return
    }

    if (!action || !this.localPileState) return

    this.lastActionTime = performance.now()
    if (this.hintsActive) this.clearPlayableHighlights()

    if (action.type === "play-to-foundation" || action.type === "play-to-work-pile") {
      this.removeFromLocalPile(action.source, action.sourceIndex, action.cardId)
      if (action.type === "play-to-foundation") {
        // Scale up the card on the foundation for readability
        const foundationCard = this.localDeck?.cards.find((c) => c.id === action.cardId)
        if (foundationCard) foundationCard.object.scale.setScalar(FOUNDATION_CARD_SCALE)
        // Update local foundation state so DragControls can smart-snap to the right slot
        const match = action.cardId.match(/^p\d+_Card_(.+)_(\w+)$/)
        if (match) {
          const value = RANK_VALUES[match[1]] ?? 0
          if (value > 0) {
            this.localFoundationState[action.slotIndex] = { suit: match[2], topValue: value }
            this.dragControls.setFoundationStates(this.localFoundationState)
            // Correct Y so each card in the pile sits above the previous one
            if (foundationCard) {
              foundationCard.object.position.y =
                CARD_Y_OFFSET + (value - 1) * FOUNDATION_PILE_Y_STEP
            }
          }
        }
      } else if (action.type === "play-to-work-pile") {
        const targetPile = this.localPileState.workPiles[action.targetPileIndex]
        const newValue = parseCardRankValue(action.cardId)
        const topValue =
          targetPile.length > 0 ? parseCardRankValue(targetPile[targetPile.length - 1]) : 0
        // New card ranks higher than current pile top → becomes new base (unshift).
        // Lower-ranked card → appends at the tip (push). Mirrors server applyWorkPilePlay.
        if (newValue > topValue) {
          targetPile.unshift(action.cardId)
        } else {
          targetPile.push(action.cardId)
        }
      }
    } else if (action.type === "merge-work-piles") {
      const sourcePile = this.localPileState.workPiles[action.sourcePileIndex]
      const targetPile = this.localPileState.workPiles[action.targetPileIndex]
      const groupStart = sourcePile.indexOf(action.cardId)
      if (groupStart >= 0) {
        const group = sourcePile.splice(groupStart)
        const bottomValue = parseCardRankValue(action.cardId)
        const topValue =
          targetPile.length > 0 ? parseCardRankValue(targetPile[targetPile.length - 1]) : 0
        // Group bottom ranks higher than target top → group goes behind (unshift).
        // Otherwise appends on top (push). Mirrors server applyMergeWorkPiles.
        if (bottomValue > topValue) {
          targetPile.unshift(...group)
        } else {
          targetPile.push(...group)
        }
      }
    } else if (action.type === "flip-stock") {
      const anim = this.buildFlipStockAnimation()
      if (anim) {
        this.stockFlipAnim = anim
        return // animation calls refreshLocalDisplay when complete
      }
    }

    this.refreshLocalDisplay()
  }

  /**
   * Emits a flip-stock action to the server.
   * Called by the Flip Stock button in the UI.
   */
  flipStock(): void {
    if (!this.localPileState || this.gamePhase !== "playing") return
    this.lastActionTime = performance.now()
    if (this.hintsActive) this.clearPlayableHighlights()
    const action: GameAction = { type: "flip-stock" }
    this.pendingAction = action
    socket.emit("game-action", action)
  }

  /**
   * Transitions the game phase, enabling or disabling card interactions.
   * Call with `"playing"` when the host starts the game, `"finished"` on game-over.
   */
  setGamePhase(phase: "waiting" | "playing" | "finished"): void {
    this.gamePhase = phase
    // Re-run draggable registration so cards become interactive (or locked) immediately
    if (this.localPileState && this.localPilePositions) {
      this.updateDraggableCards()
      this.registerWorkPilesWithDragControls()
    }
  }

  /**
   * Registers a callback that fires whenever the local nertz pile count changes.
   * Used by the route component to show/hide the "Nertz!" button.
   */
  setNertzCountCallback(cb: (count: number) => void): void {
    this.onNertzCountChange = cb
  }

  /**
   * Emits `call-nertz` to the server to end the game.
   * The server validates the nertz pile is actually empty before accepting.
   */
  callNertz(): void {
    if (this.gamePhase !== "playing") return
    socket.emit("call-nertz")
  }

  // ---------------------------------------------------------------------------
  // Private: flip-stock animation
  // ---------------------------------------------------------------------------

  /**
   * Captures current card positions, mutates `localPileState` for the flip-stock
   * action, then creates a `FlipStockAnimation` to visually transition cards to
   * their new positions. Returns null if prerequisites are missing.
   */
  private buildFlipStockAnimation(): FlipStockAnimation | null {
    if (!this.localPileState || !this.localDeck || !this.localPilePositions) return null

    const fanDirX = this.radialX
    const fanDirZ = this.radialZ
    const isRecycle = this.localPileState.stock.length === 0

    if (isRecycle) {
      // Capture waste card objects and their current 3D positions before state mutation
      const wasteIds = [...this.localPileState.waste]
      const wasteObjects = wasteIds
        .map((id) => this.localDeck!.cards.find((c) => c.id === id)?.object)
        .filter((o): o is THREE.Object3D => o !== undefined)

      // Mutate state: cycle waste back to stock face-down
      this.localPileState.stock = [...this.localPileState.waste].reverse()
      this.localPileState.waste = []

      const stockBase = this.localPilePositions[PILE_STOCK]
      const animObjects = wasteObjects.map((obj, i) => ({
        object: obj,
        stockIdx: this.localPileState!.stock.indexOf(wasteIds[i]),
      }))
      return FlipStockAnimation.buildRecycle(animObjects, stockBase, fanDirX, fanDirZ)
    } else {
      // Capture the top `count` stock cards before state mutation
      const count = Math.min(3, this.localPileState.stock.length)
      const stockTopIds = this.localPileState.stock.slice(-count)
      const stockObjects = stockTopIds
        .map((id) => this.localDeck!.cards.find((c) => c.id === id)?.object)
        .filter((o): o is THREE.Object3D => o !== undefined)
      const existingWasteCount = this.localPileState.waste.length

      // Mutate state: flip top cards to waste
      const flipped = this.localPileState.stock.splice(-count)
      this.localPileState.waste.push(...flipped)

      const wasteBase = this.localPilePositions[PILE_WASTE]
      return FlipStockAnimation.buildFlip(
        stockObjects,
        wasteBase,
        existingWasteCount,
        fanDirX,
        fanDirZ
      )
    }
  }

  // ---------------------------------------------------------------------------
  // Private: action routing
  // ---------------------------------------------------------------------------

  /**
   * Routes a card drop to the correct typed action.
   * Cards dropped outside a valid target (foundation or work pile) snap back — there are
   * no free moves; every play must land on a legal target.
   */
  private handleCardDrop(
    cardId: string,
    _position: { x: number; z: number },
    foundationSlotIndex: number | null,
    workPileIndex: number | null
  ): void {
    if (this.gamePhase !== "playing") {
      this.dragControls.snapBackCard(cardId)
      return
    }
    const source = this.findCardSource(cardId)

    if (foundationSlotIndex !== null) {
      // Only the top card of a pile can go to a foundation
      if (!source || !source.isTop) {
        this.dragControls.snapBackCard(cardId)
        this.refreshLocalDisplay()
        return
      }
      const action: GameAction = {
        type: "play-to-foundation",
        cardId,
        slotIndex: foundationSlotIndex,
        source: source.pileType,
        ...(source.pileIndex !== undefined ? { sourceIndex: source.pileIndex } : {}),
      }
      this.pendingAction = action
      socket.emit("game-action", action)
      // Optimistically set the correct Y immediately so the card never z-fights
      // with existing foundation cards during the server round-trip
      const rankValue = parseCardRankValue(cardId)
      if (rankValue > 0) {
        const foundationCard = this.localDeck?.cards.find((c) => c.id === cardId)
        if (foundationCard) {
          foundationCard.object.position.y =
            CARD_Y_OFFSET + (rankValue - 1) * FOUNDATION_PILE_Y_STEP
        }
      }
      return
    }

    if (workPileIndex !== null) {
      if (!source) {
        this.dragControls.snapBackCard(cardId)
        this.refreshLocalDisplay()
        return
      }

      if (source.pileType === "work") {
        // Work-to-work: move this card and everything above it as a group
        const action: GameAction = {
          type: "merge-work-piles",
          sourcePileIndex: source.pileIndex!,
          cardId,
          targetPileIndex: workPileIndex,
        }
        this.pendingAction = action
        socket.emit("game-action", action)
        return
      }

      // Nertz or waste top card → work pile
      if (!source.isTop) {
        this.dragControls.snapBackCard(cardId)
        this.refreshLocalDisplay()
        return
      }
      const action: GameAction = {
        type: "play-to-work-pile",
        cardId,
        targetPileIndex: workPileIndex,
        source: source.pileType,
      }
      this.pendingAction = action
      socket.emit("game-action", action)
      return
    }

    // No valid target — snap back to source position and refresh y-positions
    this.dragControls.snapBackCard(cardId)
    this.refreshLocalDisplay()
  }

  /**
   * Finds the source pile for a card.
   * For work piles, returns the card's index within the pile so callers can
   * determine whether it's the top card or part of a group.
   */
  private findCardSource(cardId: string): {
    pileType: "nertz" | "work" | "waste"
    pileIndex?: number
    /** True when the card is the playable top of its pile */
    isTop: boolean
  } | null {
    if (!this.localPileState) return null
    const { nertzPile, workPiles, waste } = this.localPileState

    if (nertzPile[nertzPile.length - 1] === cardId) return { pileType: "nertz", isTop: true }

    for (let i = 0; i < 4; i++) {
      const idx = workPiles[i].indexOf(cardId)
      if (idx >= 0) {
        return { pileType: "work", pileIndex: i, isTop: idx === workPiles[i].length - 1 }
      }
    }

    if (waste[waste.length - 1] === cardId) return { pileType: "waste", isTop: true }
    return null
  }

  /** Removes the top card of the given source pile from localPileState */
  private removeFromLocalPile(
    source: "nertz" | "work" | "waste",
    sourceIndex: number | undefined,
    _cardId: string
  ): void {
    if (!this.localPileState) return
    if (source === "nertz") {
      this.localPileState.nertzPile.pop()
    } else if (source === "waste") {
      this.localPileState.waste.pop()
    } else if (source === "work" && sourceIndex !== undefined) {
      this.localPileState.workPiles[sourceIndex].pop()
    }
  }

  /**
   * Updates the draggable card set.
   * - Nertz pile top and waste pile top: single draggable cards
   * - Work piles: every card is draggable (dragging from index k picks up
   *   cards k through the top as a group, handled by updateWorkPileGroups)
   * - Stock cards are never draggable — flip them via the Flip Stock button
   */
  private updateDraggableCards(): void {
    if (!this.localPileState || !this.localDeck) return
    // No interactions until the host starts the game or after it ends
    if (this.gamePhase !== "playing") {
      this.dragControls.setCards([])
      return
    }
    const { nertzPile, workPiles, waste } = this.localPileState
    const draggable: Card[] = []

    const addTop = (pile: string[]) => {
      const topId = pile[pile.length - 1]
      if (!topId) return
      const card = this.localDeck!.cards.find((c) => c.id === topId)
      if (card) draggable.push(card)
    }

    addTop(nertzPile)

    // All work pile cards are draggable; clicking any one picks up that card
    // and everything above it via the cardGroups map
    for (const pile of workPiles) {
      for (const cardId of pile) {
        const card = this.localDeck!.cards.find((c) => c.id === cardId)
        if (card) draggable.push(card)
      }
    }

    addTop(waste)

    this.dragControls.setCards(draggable)
    this.updateWorkPileGroups()
  }

  /**
   * Builds the cardGroups map for DragControls so that dragging any work pile
   * card automatically picks up the entire sub-pile from that card to the top.
   */
  private updateWorkPileGroups(): void {
    if (!this.localPileState || !this.localDeck) return
    const groups = new Map<string, Card[]>()

    for (const pile of this.localPileState.workPiles) {
      for (let i = 0; i < pile.length; i++) {
        const group: Card[] = []
        for (let j = i; j < pile.length; j++) {
          const card = this.localDeck!.cards.find((c) => c.id === pile[j])
          if (card) group.push(card)
        }
        if (group.length > 0) groups.set(pile[i], group)
      }
    }

    this.dragControls.setCardGroups(groups)
  }

  /**
   * Updates work pile snap targets based on current pile depth.
   * The snap target for each pile is where the NEXT card will land (one above current top).
   */
  private registerWorkPilesWithDragControls(): void {
    if (!this.localPilePositions || !this.localSeat) return
    const workPiles =
      this.localPileState?.workPiles ??
      ([[], [], [], []] as [string[], string[], string[], string[]])
    const fanDirX = Math.sin(this.localSeat.angle)
    const fanDirZ = Math.cos(this.localSeat.angle)

    const slots = []
    for (let i = 0; i < 4; i++) {
      const basePos = this.localPilePositions[PILE_WORK_START + i]
      const pileLen = workPiles[i].length
      // Snap target = where the next card will land (end of fan)
      // baseX/baseZ = pile origin, used for segment hit detection so the user
      // can drop anywhere along the visible pile, not just at the tip
      slots.push({
        x: basePos.x + pileLen * WORK_PILE_FAN_OFFSET * fanDirX,
        z: basePos.z + pileLen * WORK_PILE_FAN_OFFSET * fanDirZ,
        baseX: basePos.x,
        baseZ: basePos.z,
        index: i,
      })
    }
    this.dragControls.setWorkPileSlots(slots)
  }

  /** Registers the stock pile position with DragControls for click-to-flip detection */
  private registerStockWithDragControls(): void {
    if (!this.localPilePositions) return
    const stockPos = this.localPilePositions[PILE_STOCK]
    this.dragControls.setStockPile(stockPos, () => this.flipStock())
  }

  // ---------------------------------------------------------------------------
  // Playable card highlighting (idle hint)
  // ---------------------------------------------------------------------------

  /** Suit color groups for alternating-color validation on work piles */
  private static readonly RED_SUITS = new Set(["Hearts", "Diamonds"])

  /**
   * Checks whether a card (by ID) can legally play on any foundation or work pile.
   * Used by the idle hint system to highlight playable cards after inactivity.
   */
  private isCardPlayable(cardId: string): boolean {
    const info = this.parseCardInfo(cardId)
    if (!info) return false

    // Check foundations: Ace on empty, or same suit + next rank
    for (const fs of this.localFoundationState) {
      if (
        (fs.topValue === 0 && info.value === 1) ||
        (fs.suit === info.suit && info.value === fs.topValue + 1)
      ) {
        return true
      }
    }

    // Check work piles: alternating color + descending rank, or any card on empty pile
    if (!this.localPileState) return false
    for (const pile of this.localPileState.workPiles) {
      if (pile.length === 0) return true
      const topInfo = this.parseCardInfo(pile[pile.length - 1])
      if (!topInfo) continue
      const cardIsRed = NertzGame.RED_SUITS.has(info.suit)
      const topIsRed = NertzGame.RED_SUITS.has(topInfo.suit)
      if (cardIsRed !== topIsRed && info.value === topInfo.value - 1) return true
    }

    return false
  }

  /** Parses suit and numeric value from a card ID */
  private parseCardInfo(cardId: string): { suit: string; value: number } | null {
    const match = cardId.match(/^p\d+_Card_(.+)_(\w+)$/)
    if (!match) return null
    const value = RANK_VALUES[match[1]]
    if (!value) return null
    return { suit: match[2], value }
  }

  /**
   * Sets emissive glow on the face material of playable top cards.
   * Only applies to nertz top, waste top, and work pile tops.
   */
  private updatePlayableHighlights(): void {
    if (!this.localPileState || !this.localDeck) return
    const glowColor = new THREE.Color(PLAYABLE_GLOW_COLOR)

    const checkAndHighlight = (cardId: string | undefined) => {
      if (!cardId) return
      if (!this.isCardPlayable(cardId)) return
      const card = this.localDeck!.cards.find((c) => c.id === cardId)
      if (!card) return
      card.object.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.emissive = glowColor
          child.material.emissiveIntensity = PLAYABLE_GLOW_INTENSITY
        }
      })
    }

    // Nertz top
    checkAndHighlight(this.localPileState.nertzPile[this.localPileState.nertzPile.length - 1])
    // Waste top
    checkAndHighlight(this.localPileState.waste[this.localPileState.waste.length - 1])
    // Work pile tops
    for (const pile of this.localPileState.workPiles) {
      checkAndHighlight(pile[pile.length - 1])
    }

    this.hintsActive = true
  }

  /** Clears emissive glow from all local player cards */
  private clearPlayableHighlights(): void {
    if (!this.localDeck) return
    const black = new THREE.Color(0x000000)
    for (const card of this.localDeck.cards) {
      card.object.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.emissive = black
          child.material.emissiveIntensity = 0
        }
      })
    }
    this.hintsActive = false
  }

  // ---------------------------------------------------------------------------
  // Render loop
  // ---------------------------------------------------------------------------

  private onResize = () => {
    const { clientWidth: width, clientHeight: height } = this.container
    this.renderer.setSize(width, height)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  private update() {
    const now = performance.now()
    const deltaTime = Math.min((now - this.lastTime) / 1000, MAX_DELTA_TIME)
    this.lastTime = now
    this.totalTime += deltaTime

    if (this.shuffle && !this.shuffle.isComplete) {
      this.shuffle.update(deltaTime)
      if (this.shuffle.isComplete) {
        const piles = this.localSeat
          ? computeDealPiles(this.localSeat, this.seatRadius, PILE_OFFSET)
          : []
        const fanDir = this.localSeat
          ? { x: Math.sin(this.localSeat.angle), z: Math.cos(this.localSeat.angle) }
          : { x: 0, z: 1 }
        // Camera starts close to the deal area, ends at the final angled position
        const closerDist = this.seatRadius + CAMERA_BEHIND_DISTANCE * 0.5
        const cameraStart = new THREE.Vector3(
          this.radialX * closerDist,
          CAMERA_ANGLE_HEIGHT * 0.7,
          this.radialZ * closerDist
        )
        const finalDist = this.seatRadius + CAMERA_BEHIND_DISTANCE
        const cameraEnd = new THREE.Vector3(
          this.radialX * finalDist,
          CAMERA_ANGLE_HEIGHT,
          this.radialZ * finalDist
        )
        this.intro = new IntroAnimation(
          this.shuffle.shuffledCards,
          this.camera,
          piles,
          fanDir,
          cameraStart,
          cameraEnd
        )
      }
    } else if (this.intro && !this.intro.isComplete) {
      this.intro.update(deltaTime)
      if (this.intro.isComplete) {
        const localDeck = this.playerDecks[this.localPlayerIndex]
        if (localDeck && this.localSeat) {
          this.localPilePositions = computeDealPiles(this.localSeat, this.seatRadius, PILE_OFFSET)

          // Build ordered pile state from the deal animation card order:
          //   cards[0..12]  → nertz pile (0=bottom, 12=top)
          //   cards[13..16] → work piles 1–4 (one card each, face-up)
          //   cards[17..51] → stock pile (17=bottom, 51=top, face-down)
          //   waste starts empty at index 5
          const dealt = this.intro.dealtCards
          this.localPileState = {
            nertzPile: dealt.slice(0, 13).map((c) => c.id),
            workPiles: [[dealt[13].id], [dealt[14].id], [dealt[15].id], [dealt[16].id]],
            stock: dealt.slice(17).map((c) => c.id),
            waste: [],
          }

          this.updateDraggableCards()
          this.registerWorkPilesWithDragControls()
          this.registerStockWithDragControls()

          const positions: Record<string, { x: number; z: number }> = {}
          for (const card of localDeck.cards) {
            positions[card.id] = { x: card.object.position.x, z: card.object.position.z }
          }
          socket.emit("set-state", { positions, pileState: this.localPileState })
          this.lastActionTime = performance.now()
          this.updateNertzCounter()
        }
      }
    }

    if (this.stockFlipAnim && !this.stockFlipAnim.isComplete) {
      this.stockFlipAnim.update(deltaTime)
      if (this.stockFlipAnim.isComplete) {
        this.stockFlipAnim = null
        this.refreshLocalDisplay()
      }
    }

    // Idle hint: show playable card highlights after IDLE_HINT_DELAY_MS of inactivity
    if (
      this.localPileState &&
      !this.hintsActive &&
      this.lastActionTime > 0 &&
      now - this.lastActionTime > IDLE_HINT_DELAY_MS
    ) {
      this.updatePlayableHighlights()
    }

    this.renderer.render(this.scene, this.camera)
  }

  destroy() {
    this.renderer.setAnimationLoop(null)
    window.removeEventListener("resize", this.onResize)
    this.dragControls.detach()
    this.renderer.dispose()
    this.container.removeChild(this.renderer.domElement)
    if (this.nertzCountEl) {
      this.container.removeChild(this.nertzCountEl)
      this.nertzCountEl = null
    }
    for (const el of this.opponentEls.values()) el.remove()
    this.opponentEls.clear()
    if (this.miniRenderer) {
      this.miniRenderer.dispose()
      this.miniRenderer = null
    }
  }
}
