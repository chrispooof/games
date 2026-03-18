import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import * as THREE from "three"
import { DECK_CARD_NAME_CONFIG } from "../../shared/config/deck"
import { Card } from "../../shared/types/deck"
import { parseCardConfig } from "../../shared/utils/deck"
import deckUrl from "~/assets/deck.glb?url"
import { Table } from "./world/terrain"
import {
  AMBIENT_LIGHT_COLOR,
  AMBIENT_LIGHT_INTENSITY,
  CAMERA_FOV,
  CAMERA_HEIGHT,
  CARD_Y_OFFSET,
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
 */
export class NertzGame {
  private container: HTMLElement
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private loader: GLTFLoader
  private cards: Card[] = []
  private raycaster = new THREE.Raycaster()
  private lastTime = performance.now()
  private totalTime = 0

  /**
   * @param container - The DOM element that will host the WebGL canvas
   */
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
    this.addTable()
    this.loadCards()
    this.init()
  }

  /** Mounts the canvas, attaches event listeners, and starts the render loop */
  private init() {
    this.container.appendChild(this.renderer.domElement)
    // Event listeners
    window.addEventListener("resize", this.onResize)
    this.renderer.domElement.addEventListener("click", this.onClick)

    // Camera setup - Top-down camera view: up vector points toward -Z so "up" on screen is north
    this.camera.position.set(0, CAMERA_HEIGHT, 0)
    this.camera.up.set(0, 0, -1)
    this.camera.lookAt(0, 0, 0)

    // Renderer setup
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight)
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.shadowMap.enabled = true
    this.renderer.setAnimationLoop(() => this.update())
  }

  /** Adds a directional key light and ambient fill light to the scene */
  private addLights() {
    // Overhead key light casting soft shadows
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

  /** Sizes the table to fit the full card grid and adds it to the scene */
  private addTable() {
    const tableW = COLS * COL_GAP + 0.2
    const tableD = 4 * ROW_GAP + 0.2
    this.scene.add(new Table(tableW, tableD))
  }

  /** Loads the deck GLB and lays all 52 cards out in a grid on the table */
  private async loadCards() {
    this.loader.load(deckUrl, (deckGlb) => {
      const deck = deckGlb.scene
      const totalCols = COLS
      const totalRows = Math.ceil(DECK_CARD_NAME_CONFIG.length / totalCols)
      const offsetX = ((totalCols - 1) * COL_GAP) / 2
      const offsetZ = ((totalRows - 1) * ROW_GAP) / 2

      DECK_CARD_NAME_CONFIG.forEach((name, index) => {
        const object = deck.getObjectByName(name)
        if (!object) {
          console.warn(`Card object not found in GLB: ${name}`)
          return
        }

        const { suit, rank, value } = parseCardConfig(name)
        const card = new Card(name, suit, rank, value, true, object, () =>
          console.log("Card clicked:", name)
        )
        this.cards.push(card)

        const col = index % totalCols
        const row = Math.floor(index / totalCols)

        // Cards are already flat in the GLB (Y is thickness) — no rotation needed
        object.position.set(col * COL_GAP - offsetX, CARD_Y_OFFSET, row * ROW_GAP - offsetZ)
        object.castShadow = true
        this.scene.add(object)
      })
    })
  }

  /**
   * Raycasts from the click position into the scene and fires the matching card's onClick.
   * Walks up the object hierarchy so clicking a child mesh still resolves the parent card.
   */
  private onClick = (event: MouseEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    )

    this.raycaster.setFromCamera(pointer, this.camera)

    const cardObjects = this.cards.flatMap((c) => (c.object ? [c.object] : []))
    const [hit] = this.raycaster.intersectObjects(cardObjects, true)
    if (!hit) return

    const card = this.cards.find((c) => {
      if (!c.object) return false
      let node: THREE.Object3D | null = hit.object
      while (node) {
        if (node === c.object) return true
        node = node.parent
      }
      return false
    })
    card?.onClick?.()
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

    this.renderer.render(this.scene, this.camera)
  }

  /** Stops the render loop, removes event listeners, and disposes the renderer */
  destroy() {
    this.renderer.setAnimationLoop(null)
    window.removeEventListener("resize", this.onResize)
    this.renderer.domElement.removeEventListener("click", this.onClick)
    this.renderer.dispose()
    this.container.removeChild(this.renderer.domElement)
  }
}
