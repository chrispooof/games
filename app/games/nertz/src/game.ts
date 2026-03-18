import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import * as THREE from "three"
import deckUrl from "~/assets/deck.glb?url"
import { Table } from "./world/terrain"
import { PlayerDeck } from "./world/player-deck"
import { DragControls } from "./controls/player"
import { IntroAnimation } from "./scenes/intro"
import {
  AMBIENT_LIGHT_COLOR,
  AMBIENT_LIGHT_INTENSITY,
  CAMERA_FOV,
  CAMERA_HEIGHT,
  COL_GAP,
  COLS,
  DIR_LIGHT_COLOR,
  DIR_LIGHT_HEIGHT,
  DIR_LIGHT_INTENSITY,
  MAX_DELTA_TIME,
  ROW_GAP,
  SCENE_BACKGROUND_COLOR,
  SHADOW_CAM_EXTENT,
  SHADOW_CAM_FAR,
  SHADOW_CAM_NEAR,
  SHADOW_MAP_SIZE,
} from "./utils/constants"

/**
 * Main game class for Nertz. Owns the Three.js renderer, scene, and game loop.
 * Mount it by passing a container element; tear it down by calling `destroy()`.
 *
 * Call `addPlayer()` after construction to add more players — each gets their own
 * cloned deck with a distinct card-back color.
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
  private dragControls!: DragControls
  private intro: IntroAnimation | null = null
  private lastTime = performance.now()
  private totalTime = 0

  /** @param container - The DOM element that will host the WebGL canvas */
  constructor(container: HTMLElement) {
    this.container = container
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
    this.dragControls = new DragControls(this.camera, this.renderer.domElement, [])
    this.loadDeck()
    this.init()
  }

  /** Mounts the canvas, attaches event listeners, and starts the render loop */
  private init() {
    this.container.appendChild(this.renderer.domElement)
    window.addEventListener("resize", this.onResize)
    this.dragControls.attach()

    // Top-down camera: up vector points toward -Z so "up" on screen is north
    this.camera.position.set(0, CAMERA_HEIGHT, 0)
    this.camera.up.set(0, 0, -1)
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
   * Rebuilds the table felt to fit all current player decks.
   * Called once on construction and again whenever a player is added.
   */
  private refreshTable() {
    if (this.table) this.scene.remove(this.table)
    const playerCount = Math.max(1, this.playerDecks.length)
    const totalRows = Math.ceil(52 / COLS)
    const tableW = COLS * COL_GAP + 0.2
    // Each deck occupies totalRows * ROW_GAP depth; decks are separated by 1.5 units
    const tableD = playerCount * totalRows * ROW_GAP + (playerCount - 1) * 1.5 + 0.2
    this.table = new Table(tableW, tableD)
    this.scene.add(this.table)
  }

  /** Loads the deck GLB once and adds the first player when ready */
  private loadDeck() {
    this.loader.load(deckUrl, (deckGlb) => {
      this.deckGlbScene = deckGlb.scene
      this.addPlayer()
    })
  }

  /**
   * Adds a new player: clones the deck GLB, assigns a unique card-back color,
   * positions the grid below existing players, and updates drag controls.
   * Safe to call before the GLB has loaded — the first call is deferred via loadDeck().
   */
  addPlayer() {
    if (!this.deckGlbScene) return
    const isFirstPlayer = this.playerDecks.length === 0
    const deck = new PlayerDeck(this.playerDecks.length)
    deck.buildFromGLB(this.deckGlbScene, this.scene)
    this.playerDecks.push(deck)
    this.refreshTable()

    if (isFirstPlayer) {
      // Intro animation runs first; drag is enabled once it completes
      this.intro = new IntroAnimation(deck.cards, this.camera)
    } else {
      this.dragControls.setCards(this.playerDecks.flatMap((d) => d.cards))
    }
  }

  /** Keeps the renderer and camera aspect ratio in sync with the container size */
  private onResize = () => {
    const { clientWidth: width, clientHeight: height } = this.container
    this.renderer.setSize(width, height)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  /** Per-frame update: advances game time and renders the scene */
  private update() {
    const now = performance.now()
    const deltaTime = Math.min((now - this.lastTime) / 1000, MAX_DELTA_TIME)
    this.lastTime = now
    this.totalTime += deltaTime

    if (this.intro && !this.intro.isComplete) {
      this.intro.update(deltaTime)
      // Enable drag as soon as the intro finishes
      if (this.intro.isComplete) {
        this.dragControls.setCards(this.playerDecks.flatMap((d) => d.cards))
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
