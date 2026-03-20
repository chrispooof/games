import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import * as THREE from "three"
import { socket } from "~/lib/socket"
import deckUrl from "~/assets/deck.glb?url"
import { Table } from "./world/terrain"
import { FoundationArea } from "./world/foundations"
import { PlayerDeck, type Seat } from "./world/player-deck"
import { DragControls } from "./controls/player"
import { ShuffleAnimation } from "./scenes/shuffle"
import { IntroAnimation } from "./scenes/intro"
import {
  AMBIENT_LIGHT_COLOR,
  AMBIENT_LIGHT_INTENSITY,
  CAMERA_FOV,
  CAMERA_HEIGHT,
  INTRO_CAMERA_HEIGHT,
  DIR_LIGHT_COLOR,
  DIR_LIGHT_HEIGHT,
  DIR_LIGHT_INTENSITY,
  MAX_DELTA_TIME,
  PILE_OFFSET,
  SCENE_BACKGROUND_COLOR,
  SEAT_RADIUS,
  SHADOW_CAM_EXTENT,
  SHADOW_CAM_FAR,
  SHADOW_CAM_NEAR,
  SHADOW_MAP_SIZE,
} from "./utils/constants"

/**
 * Main game class for Nertz. Owns the Three.js renderer, scene, and game loop.
 * Mount it by passing a container element; tear it down by calling `destroy()`.
 *
 * Players sit around a circular table. All clients use the same world-space seat
 * positions (determined by join order); each client rotates its camera so its own
 * deck always appears at the bottom of the screen.
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
  private lastTime = performance.now()
  private totalTime = 0
  /** Total seats around the table — used for consistent angle computation across all clients */
  private maxPlayers: number
  /** How many player decks to add once the GLB finishes loading */
  private initialDeckCount: number
  /** Which deck index belongs to the local player (runs the intro animation) */
  private localPlayerIndex: number
  /** Seat transform for the local player — used to compute deal pile positions */
  private localSeat: Seat | null = null
  /** Saved card positions from the server — used to skip intro and restore state */
  private initialCardPositions: Record<string, { x: number; z: number }> | null

  /**
   * @param container - The DOM element that will host the WebGL canvas
   * @param maxPlayers - Total seat count around the table; governs seat angle spacing
   * @param initialDeckCount - How many player decks to create on load (default 1)
   * @param localPlayerIndex - Deck index for the local player; that deck runs the intro (default 0)
   * @param initialCardPositions - Saved positions from the server; when present, local player's
   *   deck skips the intro animation and cards are placed at their last known positions
   */
  constructor(
    container: HTMLElement,
    maxPlayers = 1,
    initialDeckCount = 1,
    localPlayerIndex = 0,
    initialCardPositions: Record<string, { x: number; z: number }> | null = null
  ) {
    this.container = container
    this.maxPlayers = maxPlayers
    this.initialDeckCount = initialDeckCount
    this.localPlayerIndex = localPlayerIndex
    this.initialCardPositions = initialCardPositions
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
      (cardId, position) => {
        socket.emit("game-action", { type: "move-card", cardId, position })
      }
    )
    this.dragControls.setFoundationSlots(this.foundationArea.slots)
    this.loadDeck()
    this.init()
  }

  /**
   * Computes the world-space seat transform for player at `index` in a game of `total` players.
   * Seat 0 is at positive-Z (south); seats increment clockwise when viewed top-down.
   * The grid is oriented so the player faces the table center (rotation.y = angle).
   */
  private computeSeat(index: number, total: number): Seat {
    const angle = (2 * Math.PI * index) / total
    return {
      x: Math.sin(angle) * SEAT_RADIUS,
      z: Math.cos(angle) * SEAT_RADIUS,
      angle,
    }
  }

  /** Mounts the canvas, attaches event listeners, and starts the render loop */
  private init() {
    this.container.appendChild(this.renderer.domElement)
    window.addEventListener("resize", this.onResize)
    this.dragControls.attach()

    // Orient the camera so the local player's seat is always at the bottom of the screen.
    // camera.up is set to the vector pointing AWAY from the local seat (toward top of screen).
    const localSeat = this.computeSeat(this.localPlayerIndex, this.maxPlayers)
    this.camera.position.set(0, CAMERA_HEIGHT, 0)
    this.camera.up.set(-Math.sin(localSeat.angle), 0, -Math.cos(localSeat.angle))
    this.camera.lookAt(0, 0, 0)

    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight)
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.shadowMap.enabled = true
    this.renderer.setAnimationLoop(() => this.update())
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

  /**
   * Rebuilds the circular table felt. The radius is fixed to cover all possible seat grids.
   * Called once on construction; the size doesn't change when players join since seats
   * are always within SEAT_RADIUS of center.
   */
  private refreshTable() {
    if (this.table) this.scene.remove(this.table)
    // Cover grid depth beyond the seat center; add generous padding
    this.table = new Table(SEAT_RADIUS + 3)
    this.scene.add(this.table)
  }

  /** Loads the deck GLB once and adds the initial player decks when ready */
  private loadDeck() {
    this.loader.load(deckUrl, (deckGlb) => {
      this.deckGlbScene = deckGlb.scene
      for (let i = 0; i < this.initialDeckCount; i++) {
        this.addPlayer()
      }
    })
  }

  /**
   * Adds a new player deck at the next available seat around the table.
   * - Local player's deck: runs shuffle → intro unless saved positions exist,
   *   in which case cards are placed directly and drag is enabled immediately.
   * - Remote player decks: positioned from saved state if available, otherwise
   *   hidden until `applyState` is called when they complete their own intro.
   */
  addPlayer() {
    if (!this.deckGlbScene) return
    const deckIndex = this.playerDecks.length
    const isLocalPlayer = deckIndex === this.localPlayerIndex
    const seat = this.computeSeat(deckIndex, this.maxPlayers)

    const deck = new PlayerDeck(deckIndex)
    deck.buildFromGLB(this.deckGlbScene, this.scene, seat)
    this.playerDecks.push(deck)

    if (isLocalPlayer) {
      this.localSeat = seat
      const hasPositions = this.applyInitialPositions(deck)
      if (hasPositions) {
        // Resuming an existing game: skip the intro, zoom the camera out, and re-enable drag
        this.camera.position.y = INTRO_CAMERA_HEIGHT
        this.dragControls.setCards(deck.cards)
      } else {
        // Fresh game: run the full shuffle → deal intro sequence
        this.shuffle = new ShuffleAnimation(deck.cards, { x: seat.x, z: seat.z })
      }
    } else {
      const hasPositions = this.applyInitialPositions(deck)
      if (!hasPositions) {
        // Other player hasn't finished their intro yet — hide their deck until
        // game-state-update arrives with their initial pile layout
        for (const card of deck.cards) {
          card.object.visible = false
        }
      }
    }
  }

  /**
   * Computes the six world-space pile positions for a player's dealt hand.
   * Piles are arranged in a row perpendicular to the radial direction, just in front of the seat:
   *   [Nertz, Work1, Work2, Work3, Work4, Stock]
   */
  private computeDealPiles(seat: Seat): Array<{ x: number; z: number }> {
    const r = SEAT_RADIUS - PILE_OFFSET
    const cx = Math.sin(seat.angle) * r
    const cz = Math.cos(seat.angle) * r
    // Perpendicular direction for spreading the row of piles
    const perpX = Math.cos(seat.angle)
    const perpZ = -Math.sin(seat.angle)
    const spacing = 0.85

    return Array.from({ length: 6 }, (_, i) => {
      const offset = (i - 2.5) * spacing
      return { x: cx + perpX * offset, z: cz + perpZ * offset }
    })
  }

  /**
   * Returns the correct rotation.z for a card being restored from saved state.
   * Cards at work pile positions (piles 1–4) for their owning player are face-up (0);
   * everything else is face-down (π).
   * Card IDs are prefixed with `p{index}_` so we can derive the owning player's seat.
   */
  private getFaceRotation(cardId: string, x: number, z: number): number {
    const match = cardId.match(/^p(\d+)_/)
    if (!match) return Math.PI
    const seat = this.computeSeat(parseInt(match[1]), this.maxPlayers)
    const piles = this.computeDealPiles(seat)
    // Pile 0 is the Nertz pile (top card face-up); piles 1–4 are work piles (face-up)
    for (let i = 0; i <= 4; i++) {
      if (Math.abs(x - piles[i].x) < 0.01 && Math.abs(z - piles[i].z) < 0.01) return 0
    }
    return Math.PI
  }

  /**
   * Returns the Y-rotation angle of the nearest foundation slot if the given position is
   * within FOUNDATION_SNAP_RADIUS of it, otherwise returns null.
   */
  private getFoundationAngle(x: number, z: number): number | null {
    if (!this.foundationArea) return null
    for (const slot of this.foundationArea.slots) {
      const dist = Math.sqrt((x - slot.x) ** 2 + (z - slot.z) ** 2)
      if (dist < 0.01) return slot.angle
    }
    return null
  }

  /**
   * Applies saved `x`/`z` positions from `initialCardPositions` to a freshly-built deck.
   * Cards with a saved position are made visible and flipped face-down (rotation.z = π).
   * @returns true if at least one card had a saved position
   */
  private applyInitialPositions(deck: PlayerDeck): boolean {
    if (!this.initialCardPositions) return false
    let applied = false
    for (const card of deck.cards) {
      const pos = this.initialCardPositions[card.id]
      if (pos) {
        card.object.visible = true
        card.object.position.x = pos.x
        card.object.position.z = pos.z
        card.object.rotation.z = this.getFaceRotation(card.id, pos.x, pos.z)
        const foundationAngle = this.getFoundationAngle(pos.x, pos.z)
        if (foundationAngle !== null) card.object.rotation.y = foundationAngle
        applied = true
      }
    }
    return applied
  }

  /**
   * Applies a batch of card positions to all decks in the scene.
   * Used for reconnect state restore and when other players broadcast their initial layout.
   * Cards with a matching saved position are made visible, moved, and flipped face-down.
   */
  applyState(positions: Record<string, { x: number; z: number }>): void {
    for (const deck of this.playerDecks) {
      for (const card of deck.cards) {
        const pos = positions[card.id]
        if (pos) {
          card.object.visible = true
          card.object.position.x = pos.x
          card.object.position.z = pos.z
          card.object.rotation.z = this.getFaceRotation(card.id, pos.x, pos.z)
          const foundationAngle = this.getFoundationAngle(pos.x, pos.z)
          if (foundationAngle !== null) card.object.rotation.y = foundationAngle
        }
      }
    }
  }

  /**
   * Applies a game action received from another player via the server.
   * Currently handles 'move-card': moves the identified card to the given position.
   */
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
    if (foundationAngle !== null) card.object.rotation.y = foundationAngle
  }

  /** Keeps the renderer and camera aspect ratio in sync with the container size */
  private onResize = () => {
    const { clientWidth: width, clientHeight: height } = this.container
    this.renderer.setSize(width, height)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  /** Per-frame update: advances animations and renders the scene */
  private update() {
    const now = performance.now()
    const deltaTime = Math.min((now - this.lastTime) / 1000, MAX_DELTA_TIME)
    this.lastTime = now
    this.totalTime += deltaTime

    if (this.shuffle && !this.shuffle.isComplete) {
      this.shuffle.update(deltaTime)
      // Kick off the deal animation once shuffling is done
      if (this.shuffle.isComplete) {
        const piles = this.localSeat ? this.computeDealPiles(this.localSeat) : []
        this.intro = new IntroAnimation(this.shuffle.shuffledCards, this.camera, piles)
      }
    } else if (this.intro && !this.intro.isComplete) {
      this.intro.update(deltaTime)
      // Once the deal finishes: enable drag for local player's cards and save pile positions
      if (this.intro.isComplete) {
        const localDeck = this.playerDecks[this.localPlayerIndex]
        if (localDeck) {
          this.dragControls.setCards(localDeck.cards)
          // Bulk-save the dealt pile positions so reconnecting players skip the intro
          const positions: Record<string, { x: number; z: number }> = {}
          for (const card of localDeck.cards) {
            positions[card.id] = { x: card.object.position.x, z: card.object.position.z }
          }
          socket.emit("set-state", positions)
        }
      }
    }

    this.renderer.render(this.scene, this.camera)
  }

  /** Stops the render loop, removes event listeners, and disposes the renderer */
  destroy() {
    this.renderer.setAnimationLoop(null)
    window.removeEventListener("resize", this.onResize)
    this.dragControls.detach()
    this.renderer.dispose()
    this.container.removeChild(this.renderer.domElement)
  }
}
