import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import * as THREE from "three"
import { DECK_CARD_NAME_CONFIG } from "./config/deck"
import { Card } from "./types/deck"
import { parseCardConfig } from "./utils/deck"
import deckUrl from "~/assets/deck.glb?url"

export class NertzGame {
  private container: HTMLElement
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private animId: number = 0
  private loader: GLTFLoader
  private cards: Card[] = []

  constructor(container: HTMLElement) {
    this.container = container
    const { clientWidth: width, clientHeight: height } = container

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000)

    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.scene.background = new THREE.Color(0x1a1a2e)
    this.camera.position.z = 5

    const light = new THREE.DirectionalLight(0xffffff, 1)
    light.position.set(5, 5, 5)
    this.scene.add(light)
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.4))

    this.loader = new GLTFLoader()

    container.appendChild(this.renderer.domElement)
    window.addEventListener("resize", this.onResize)
    this.loadCards()
    this.animate()
  }

  private async loadCards() {
    this.loader.load(deckUrl, (deckGlb) => {
      const deck = deckGlb.scene
      DECK_CARD_NAME_CONFIG.forEach((name, index) => {
        const object = deck.getObjectByName(name)
        if (!object) {
          console.warn(`Card object not found in GLB: ${name}`)
          return
        }

        const { suit, rank, value } = parseCardConfig(name)
        const card = new Card(name, suit, rank, value)
        card.object = object
        this.cards.push(card)

        // Spread cards in a grid so they're visible
        const col = index % 13
        const row = Math.floor(index / 13)
        object.position.set(col * 0.8 - 4.8, row * 1.2 - 1.8, 0)
        this.scene.add(object)
      })
    })
  }

  private onResize = () => {
    const { clientWidth: width, clientHeight: height } = this.container
    this.renderer.setSize(width, height)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  private animate = () => {
    this.animId = requestAnimationFrame(this.animate)
    this.renderer.render(this.scene, this.camera)
  }

  destroy() {
    cancelAnimationFrame(this.animId)
    window.removeEventListener("resize", this.onResize)
    this.renderer.dispose()
    this.container.removeChild(this.renderer.domElement)
  }
}
