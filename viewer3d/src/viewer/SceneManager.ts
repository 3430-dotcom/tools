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
  private onError: ((err: unknown) => void) | null = null
  private raycaster = new THREE.Raycaster()

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

  /** Reports any error thrown inside the render loop, which would otherwise fail silently with no visible trace. */
  setErrorHandler(handler: (err: unknown) => void) {
    this.onError = handler
  }

  private animate() {
    if (this.disposed) return
    try {
      this.controls.update()
      this.renderer.render(this.scene, this.camera)
    } catch (err) {
      this.onError?.(err)
      this.onError = null // report once; keep retrying frames in case it's transient
    }
    this.frameId = requestAnimationFrame(this.animate)
  }

  setBackground(mode: Background) {
    // No fog: the scene has no distant background geometry to atmospherically
    // fade (no ground plane, nothing far from the model), so fog only ever
    // acted on the model itself. Its fixed density was tuned against small
    // sample models -- for a larger structure (e.g. a multi-chain protein
    // with a much bigger bounding radius), the camera backs up proportionally
    // further to frame it, and at that distance fixed-density exponential
    // fog fades the entire model into the exact background color: a total,
    // silent, no-error disappearance.
    this.scene.background = new THREE.Color(mode === 'dark' ? 0x11141c : 0xeef1f7)
  }

  /**
   * Projects a world-space point to pixel coordinates relative to the
   * canvas's own container (matching the coordinate space that the
   * absolutely-positioned viewport overlays use). Returns null when the
   * container has no size yet; `visible` is false once the point is behind
   * the camera or beyond the far plane, so callers can fade a label out
   * instead of leaving it stuck at a stale/garbage position.
   */
  projectToScreen(worldPos: THREE.Vector3): { x: number; y: number; visible: boolean } | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const ndc = worldPos.clone().project(this.camera)
    return {
      x: (ndc.x * 0.5 + 0.5) * rect.width,
      y: (-ndc.y * 0.5 + 0.5) * rect.height,
      visible: ndc.z < 1,
    }
  }

  /**
   * Picks the nearest hit instance across several InstancedMeshes under a
   * client (viewport) coordinate -- e.g. atom spheres and bond cylinders,
   * which can visually overlap, so the closer surface to the camera should
   * win rather than always preferring one mesh over the other. Skips
   * invisible meshes (e.g. bonds in spacefill mode, where they're never
   * meant to be pickable). Returns null if nothing was hit.
   */
  pickNearest(clientX: number, clientY: number, meshes: THREE.InstancedMesh[]): { mesh: THREE.InstancedMesh; instanceId: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.camera)

    let best: { mesh: THREE.InstancedMesh; instanceId: number; distance: number } | null = null
    for (const mesh of meshes) {
      if (!mesh.visible) continue
      const hit = this.raycaster.intersectObject(mesh)[0]
      if (hit && hit.instanceId !== undefined && (!best || hit.distance < best.distance)) {
        best = { mesh, instanceId: hit.instanceId, distance: hit.distance }
      }
    }
    return best ? { mesh: best.mesh, instanceId: best.instanceId } : null
  }

  /**
   * Raycasts a plain (non-instanced) object list -- e.g. the cross-section
   * plane drag handles -- and returns whichever is hit closest to the
   * camera, or null. Invisible objects are naturally skipped by three.js's
   * own raycast traversal.
   */
  pickObject(clientX: number, clientY: number, objects: THREE.Object3D[]): THREE.Object3D | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.camera)

    let best: { object: THREE.Object3D; distance: number } | null = null
    for (const obj of objects) {
      const hit = this.raycaster.intersectObject(obj, false)[0]
      if (hit && (!best || hit.distance < best.distance)) best = { object: obj, distance: hit.distance }
    }
    return best?.object ?? null
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
