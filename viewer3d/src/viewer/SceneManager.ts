import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export type Background = 'dark' | 'light'

export class SceneManager {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly controls: OrbitControls
  readonly modelRoot = new THREE.Group()

  private container: HTMLDivElement | null = null
  private resizeObserver: ResizeObserver
  private frameId = 0
  private disposed = false

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.localClippingEnabled = true
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 5000)
    this.camera.position.set(3, 2.2, 4)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.autoRotateSpeed = 2.2

    this.scene.add(this.modelRoot)
    this.setupLights()
    this.setBackground('dark')

    this.resizeObserver = new ResizeObserver(() => this.handleResize())
    this.animate = this.animate.bind(this)
  }

  private setupLights() {
    const hemi = new THREE.HemisphereLight(0xffffff, 0x33384a, 1.1)
    const key = new THREE.DirectionalLight(0xffffff, 2.4)
    key.position.set(5, 8, 6)
    const fill = new THREE.DirectionalLight(0xbfd4ff, 0.6)
    fill.position.set(-6, -2, -4)
    this.scene.add(hemi, key, fill)
  }

  mount(container: HTMLDivElement) {
    this.container = container
    container.appendChild(this.renderer.domElement)
    this.handleResize()
    this.resizeObserver.observe(container)
    this.frameId = requestAnimationFrame(this.animate)
  }

  private handleResize() {
    if (!this.container) return
    const { clientWidth, clientHeight } = this.container
    if (clientWidth === 0 || clientHeight === 0) return
    this.camera.aspect = clientWidth / clientHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(clientWidth, clientHeight)
  }

  private animate() {
    if (this.disposed) return
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
    this.frameId = requestAnimationFrame(this.animate)
  }

  setBackground(mode: Background) {
    this.scene.background = new THREE.Color(mode === 'dark' ? 0x11141c : 0xeef1f7)
    this.scene.fog = mode === 'dark' ? new THREE.FogExp2(0x11141c, 0.012) : null
  }

  setAutoRotate(enabled: boolean) {
    this.controls.autoRotate = enabled
  }

  clearModel() {
    while (this.modelRoot.children.length) {
      this.modelRoot.remove(this.modelRoot.children[0])
    }
  }

  setModel(object: THREE.Object3D) {
    this.clearModel()
    this.modelRoot.add(object)
  }

  /** Frames the camera/controls around the given bounding sphere. */
  frameObject(box: THREE.Box3) {
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    // An empty/degenerate box (e.g. a model with zero geometry) yields a
    // non-finite center/radius; fall back to the origin so the camera never
    // ends up at a NaN position, which would render a silent blank canvas.
    if (!Number.isFinite(sphere.radius) || !Number.isFinite(sphere.center.x)) {
      sphere.center.set(0, 0, 0)
      sphere.radius = 1
    }
    const radius = Math.max(sphere.radius, 0.001)
    const fovRad = (this.camera.fov * Math.PI) / 180
    const distance = (radius / Math.sin(fovRad / 2)) * 1.35

    this.controls.target.copy(sphere.center)
    const dir = new THREE.Vector3(1, 0.65, 1).normalize()
    this.camera.position.copy(sphere.center).addScaledVector(dir, distance)
    this.camera.near = Math.max(distance / 100, 0.01)
    this.camera.far = distance * 100
    this.camera.updateProjectionMatrix()
    this.controls.update()

    return radius
  }

  screenshot(): string {
    this.renderer.render(this.scene, this.camera)
    return this.renderer.domElement.toDataURL('image/png')
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.frameId)
    this.resizeObserver.disconnect()
    this.controls.dispose()
    this.renderer.dispose()
    this.container?.removeChild(this.renderer.domElement)
  }
}
