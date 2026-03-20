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
import { computeSeat, computeDealPiles } from "./utils/geometry"
import type { GameAction, ActionResult } from "./types/actions"
import type { Card } from "../../shared/types/deck"
import {
  AMBIENT_LIGHT_COLOR,
  AMBIENT_LIGHT_INTENSITY,
  CARD_Y_OFFSET,
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

/** Pile indices in the 7-element computeDealPiles array */
const PILE_NERTZ = 0
const PILE_WORK_START = 1 // work piles at indices 1–4
const PILE_WASTE = 5
const PILE_STOCK = 6

/** How far each card in a fanned work pile is offset from the previous (world units) */
const WORK_PILE_FAN_OFFSET = 0.2

/** Local pile state maintained in parallel with the server */
interface LocalPileState {
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
  /** Saved positions from the server — skips intro when present */
  private initialCardPositions: Record<string, { x: number; z: number }> | null
  /** In-flight typed action awaiting an `action-result` response */
  private pendingAction: GameAction | null = null

  /**
   * @param container - The DOM element that will host the WebGL canvas
   * @param maxPlayers - Total seat count; governs seat angle spacing
   * @param initialDeckCount - How many player decks to create on load
   * @param localPlayerIndex - Deck index for the local player
   * @param initialCardPositions - Saved server positions; skips the intro when present
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
      (cardId, position, foundationSlotIndex, workPileIndex) => {
        this.handleCardDrop(cardId, position, foundationSlotIndex, workPileIndex)
      }
    )
    this.dragControls.setFoundationSlots(this.foundationArea.slots)
    this.loadDeck()
    this.init()
  }

  /** Mounts the canvas, attaches event listeners, and starts the render loop */
  private init() {
    this.container.appendChild(this.renderer.domElement)
    window.addEventListener("resize", this.onResize)
    this.dragControls.attach()

    const localSeat = computeSeat(this.localPlayerIndex, this.maxPlayers, SEAT_RADIUS)
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

  private refreshTable() {
    if (this.table) this.scene.remove(this.table)
    this.table = new Table(SEAT_RADIUS + 3)
    this.scene.add(this.table)
  }

  private loadDeck() {
    this.loader.load(deckUrl, (deckGlb) => {
      this.deckGlbScene = deckGlb.scene
      for (let i = 0; i < this.initialDeckCount; i++) {
        this.addPlayer()
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
    const seat = computeSeat(deckIndex, this.maxPlayers, SEAT_RADIUS)

    const deck = new PlayerDeck(deckIndex)
    deck.buildFromGLB(this.deckGlbScene, this.scene, seat)
    this.playerDecks.push(deck)

    if (isLocalPlayer) {
      this.localDeck = deck
      this.localSeat = seat
      const hasPositions = this.applyInitialPositions(deck)
      if (hasPositions) {
        this.camera.position.y = INTRO_CAMERA_HEIGHT
        this.localPilePositions = computeDealPiles(seat, SEAT_RADIUS, PILE_OFFSET)
        this.updateDraggableCards()
        this.registerWorkPilesWithDragControls()
        this.registerStockWithDragControls()
      } else {
        this.shuffle = new ShuffleAnimation(deck.cards, { x: seat.x, z: seat.z })
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
    const seat = computeSeat(parseInt(match[1]), this.maxPlayers, SEAT_RADIUS)
    const piles = computeDealPiles(seat, SEAT_RADIUS, PILE_OFFSET)
    // Nertz pile position and work pile positions are all face-up on initial deal
    for (let i = PILE_NERTZ; i <= PILE_WORK_START + 3; i++) {
      if (Math.abs(x - piles[i].x) < 0.01 && Math.abs(z - piles[i].z) < 0.01) return 0
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

    // Fan direction: toward table center (negative radial) — plenty of space, no seat clipping
    const fanDirX = -Math.sin(this.localSeat.angle)
    const fanDirZ = -Math.cos(this.localSeat.angle)

    // Nertz pile: all face-down except the top card
    const nertzBase = this.localPilePositions[PILE_NERTZ]
    const nertzTop = this.localPileState.nertzPile[this.localPileState.nertzPile.length - 1]
    this.localPileState.nertzPile.forEach((cardId, i) => {
      const card = this.localDeck!.cards.find((c) => c.id === cardId)
      if (!card) return
      card.object.position.set(nertzBase.x, CARD_Y_OFFSET + i * 0.0005, nertzBase.z)
      card.object.rotation.z = cardId === nertzTop ? 0 : Math.PI
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
          CARD_Y_OFFSET + i * 0.002,
          basePos.z + i * WORK_PILE_FAN_OFFSET * fanDirZ
        )
        card.object.rotation.z = 0 // all work pile cards face-up
      })
    }

    // Waste pile: all face-up, stacked
    const wasteBase = this.localPilePositions[PILE_WASTE]
    this.localPileState.waste.forEach((cardId, i) => {
      const card = this.localDeck!.cards.find((c) => c.id === cardId)
      if (!card) return
      card.object.visible = true
      card.object.position.set(wasteBase.x, CARD_Y_OFFSET + i * 0.0005, wasteBase.z)
      card.object.rotation.z = 0 // face-up
    })

    // Stock pile: all face-down, stacked
    const stockBase = this.localPilePositions[PILE_STOCK]
    this.localPileState.stock.forEach((cardId, i) => {
      const card = this.localDeck!.cards.find((c) => c.id === cardId)
      if (!card) return
      card.object.position.set(stockBase.x, CARD_Y_OFFSET + i * 0.0005, stockBase.z)
      card.object.rotation.z = Math.PI // face-down
    })

    // Camera: zoom out as work piles grow (0.5 units per card beyond depth 3)
    const maxDepth = Math.max(...this.localPileState.workPiles.map((p) => p.length))
    const extraHeight = Math.max(0, maxDepth - 3) * 0.5
    this.camera.position.y = Math.min(INTRO_CAMERA_HEIGHT + extraHeight, 22)

    this.updateDraggableCards()
    this.registerWorkPilesWithDragControls()
  }

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
   * Applies a batch of card positions to all decks.
   * Used for reconnect state restore and other-player position broadcasts.
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
    if (foundationAngle !== null) card.object.rotation.y = foundationAngle
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
      return
    }

    if (!action || !this.localPileState) return

    if (action.type === "play-to-foundation" || action.type === "play-to-work-pile") {
      this.removeFromLocalPile(action.source, action.sourceIndex, action.cardId)
      if (action.type === "play-to-work-pile") {
        this.localPileState.workPiles[action.targetPileIndex].push(action.cardId)
      }
    } else if (action.type === "flip-stock") {
      if (this.localPileState.stock.length === 0) {
        // Stock exhausted — cycle waste back to stock face-down
        this.localPileState.stock = [...this.localPileState.waste].reverse()
        this.localPileState.waste = []
      } else {
        const count = Math.min(3, this.localPileState.stock.length)
        const flipped = this.localPileState.stock.splice(-count)
        this.localPileState.waste.push(...flipped)
      }
    }

    this.refreshLocalDisplay()
  }

  /**
   * Emits a flip-stock action to the server.
   * Called by the Flip Stock button in the UI.
   */
  flipStock(): void {
    if (!this.localPileState) return
    const action: GameAction = { type: "flip-stock" }
    this.pendingAction = action
    socket.emit("game-action", action)
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
    position: { x: number; z: number },
    foundationSlotIndex: number | null,
    workPileIndex: number | null
  ): void {
    if (foundationSlotIndex !== null) {
      const source = this.findCardSource(cardId)
      if (!source) {
        this.dragControls.snapBackCard(cardId)
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
      return
    }

    if (workPileIndex !== null) {
      const source = this.findCardSource(cardId)
      if (!source) {
        this.dragControls.snapBackCard(cardId)
        return
      }
      const action: GameAction = {
        type: "play-to-work-pile",
        cardId,
        targetPileIndex: workPileIndex,
        source: source.pileType,
        ...(source.pileIndex !== undefined ? { sourceIndex: source.pileIndex } : {}),
      }
      this.pendingAction = action
      socket.emit("game-action", action)
      return
    }

    // No valid target — snap back to source position
    this.dragControls.snapBackCard(cardId)
  }

  /**
   * Finds the source pile for a card by checking if it is the TOP of any local pile.
   * Returns null for buried cards or when pile state is unknown.
   */
  private findCardSource(
    cardId: string
  ): { pileType: "nertz" | "work" | "waste"; pileIndex?: number } | null {
    if (!this.localPileState) return null
    const { nertzPile, workPiles, waste } = this.localPileState

    if (nertzPile[nertzPile.length - 1] === cardId) return { pileType: "nertz" }
    for (let i = 0; i < 4; i++) {
      if (workPiles[i][workPiles[i].length - 1] === cardId) {
        return { pileType: "work", pileIndex: i }
      }
    }
    if (waste[waste.length - 1] === cardId) return { pileType: "waste" }
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
   * Restricts the draggable card set to the top card of each playable pile.
   * Stock cards are never draggable — flip them via the Flip Stock button.
   */
  private updateDraggableCards(): void {
    if (!this.localPileState || !this.localDeck) return
    const { nertzPile, workPiles, waste } = this.localPileState
    const draggable: Card[] = []

    const addTop = (pile: string[]) => {
      const topId = pile[pile.length - 1]
      if (!topId) return
      const card = this.localDeck!.cards.find((c) => c.id === topId)
      if (card) draggable.push(card)
    }

    addTop(nertzPile)
    for (const pile of workPiles) addTop(pile)
    addTop(waste)

    this.dragControls.setCards(draggable)
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
    const fanDirX = -Math.sin(this.localSeat.angle)
    const fanDirZ = -Math.cos(this.localSeat.angle)

    const slots = []
    for (let i = 0; i < 4; i++) {
      const basePos = this.localPilePositions[PILE_WORK_START + i]
      const pileLen = workPiles[i].length
      // Snap target = position where the next card will be placed
      slots.push({
        x: basePos.x + pileLen * WORK_PILE_FAN_OFFSET * fanDirX,
        z: basePos.z + pileLen * WORK_PILE_FAN_OFFSET * fanDirZ,
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
          ? computeDealPiles(this.localSeat, SEAT_RADIUS, PILE_OFFSET)
          : []
        this.intro = new IntroAnimation(this.shuffle.shuffledCards, this.camera, piles)
      }
    } else if (this.intro && !this.intro.isComplete) {
      this.intro.update(deltaTime)
      if (this.intro.isComplete) {
        const localDeck = this.playerDecks[this.localPlayerIndex]
        if (localDeck && this.localSeat) {
          this.localPilePositions = computeDealPiles(this.localSeat, SEAT_RADIUS, PILE_OFFSET)

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
        }
      }
    }

    this.renderer.render(this.scene, this.camera)
  }

  destroy() {
    this.renderer.setAnimationLoop(null)
    window.removeEventListener("resize", this.onResize)
    this.dragControls.detach()
    this.renderer.dispose()
    this.container.removeChild(this.renderer.domElement)
  }
}
