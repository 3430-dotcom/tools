import * as THREE from 'three'

export type Axis = 'x' | 'y' | 'z'

export interface AxisState {
  enabled: boolean
  invert: boolean
  /** -1..1, mapped to the model's bounding radius */
  offset: number
}

const AXIS_NORMALS: Record<Axis, THREE.Vector3> = {
  x: new THREE.Vector3(-1, 0, 0),
  y: new THREE.Vector3(0, -1, 0),
  z: new THREE.Vector3(0, 0, -1),
}

const AXES: Axis[] = ['x', 'y', 'z']

/**
 * Builds solid cross-section "caps" using the stencil-buffer technique so a
 * clipped solid mesh reads as a real cut surface instead of a hollow shell.
 * See three.js's webgl_clipping_stencil example for the underlying recipe.
 */
export class CrossSectionController {
  readonly planes: Record<Axis, THREE.Plane>
  readonly planeHelpers: Record<Axis, THREE.PlaneHelper>
  readonly helperGroup = new THREE.Group()
  private stencilRoot = new THREE.Group()
  private capGroup = new THREE.Group()
  private capMaterials: THREE.MeshStandardMaterial[] = []
  private radius = 1
  readonly group: THREE.Group

  constructor(group: THREE.Group) {
    this.group = group
    this.planes = {
      x: new THREE.Plane(AXIS_NORMALS.x.clone(), 0),
      y: new THREE.Plane(AXIS_NORMALS.y.clone(), 0),
      z: new THREE.Plane(AXIS_NORMALS.z.clone(), 0),
    }
    this.planeHelpers = {
      x: new THREE.PlaneHelper(this.planes.x, 2, 0xff4d6d),
      y: new THREE.PlaneHelper(this.planes.y, 2, 0x4dff88),
      z: new THREE.PlaneHelper(this.planes.z, 2, 0x4d9dff),
    }
    for (const axis of AXES) {
      this.planeHelpers[axis].visible = false
      this.helperGroup.add(this.planeHelpers[axis])
    }
    this.group.add(this.stencilRoot, this.capGroup)
  }

  /**
   * Sets the model's bounding radius, which the offset slider (-1..1) is
   * scaled against and which the guide-plane helpers are sized from. Must be
   * called for every loaded model (PDB included) -- without it the radius
   * stays at its tiny constructor default and the slider only sweeps a
   * sliver near the very center of the model.
   */
  setRadius(radius: number) {
    this.radius = Math.max(radius, 0.001)
    const helperSize = this.radius * 3
    for (const axis of AXES) {
      this.planeHelpers[axis].size = helperSize
    }
  }

  /** (Re)builds the stencil groups + cap planes for a given geometry (STL solids only). */
  attachGeometry(geometry: THREE.BufferGeometry, boundingRadius: number) {
    this.clearStencil()
    this.setRadius(boundingRadius)
    const planeSize = this.radius * 4

    for (const axis of AXES) {
      const plane = this.planes[axis]
      this.stencilRoot.add(createPlaneStencilGroup(geometry, plane, AXES.indexOf(axis) + 1))

      const capMat = new THREE.MeshStandardMaterial({
        color: 0xe91e63,
        metalness: 0.1,
        roughness: 0.7,
        side: THREE.DoubleSide,
        stencilWrite: true,
        stencilRef: 0,
        stencilFunc: THREE.NotEqualStencilFunc,
        stencilFail: THREE.ReplaceStencilOp,
        stencilZFail: THREE.ReplaceStencilOp,
        stencilZPass: THREE.ReplaceStencilOp,
      })
      this.capMaterials.push(capMat)

      const capMesh = new THREE.Mesh(new THREE.PlaneGeometry(planeSize, planeSize), capMat)
      capMesh.onAfterRender = (renderer) => renderer.clearStencil()
      capMesh.renderOrder = AXES.indexOf(axis) + 1.1
      alignCapToPlane(capMesh, plane)
      this.capGroup.add(capMesh)
    }
  }

  private clearStencil() {
    this.stencilRoot.clear()
    this.capGroup.clear()
    this.capMaterials = []
  }

  /** Applies the active plane set (for clipping) to the given materials, and keeps cap materials in sync. */
  applyTo(materials: THREE.Material[], state: Record<Axis, AxisState>) {
    const active: THREE.Plane[] = []
    for (const axis of AXES) {
      const s = state[axis]
      const plane = this.planes[axis]
      const sign = s.invert ? -1 : 1
      plane.normal.copy(AXIS_NORMALS[axis]).multiplyScalar(sign)
      plane.constant = s.offset * this.radius * sign
      this.planeHelpers[axis].visible = s.enabled
      if (s.enabled) active.push(plane)
    }

    for (const mat of materials) {
      ;(mat as THREE.Material & { clippingPlanes: THREE.Plane[] | null }).clippingPlanes = active
    }

    this.capMaterials.forEach((capMat, i) => {
      const axis = AXES[i]
      capMat.clippingPlanes = active.filter((p) => p !== this.planes[axis])
      capMat.visible = state[axis].enabled
    })

    const capMeshes = this.capGroup.children as THREE.Mesh[]
    if (capMeshes.length === AXES.length) {
      AXES.forEach((axis, i) => {
        alignCapToPlane(capMeshes[i], this.planes[axis])
        capMeshes[i].visible = state[axis].enabled
      })
    }

    const stencilGroups = this.stencilRoot.children
    if (stencilGroups.length === AXES.length) {
      AXES.forEach((axis, i) => {
        stencilGroups[i].visible = state[axis].enabled
      })
    }
  }

  setHelpersVisible(state: Record<Axis, AxisState>, show: boolean) {
    for (const axis of AXES) {
      this.planeHelpers[axis].visible = show && state[axis].enabled
    }
  }

  dispose() {
    this.clearStencil()
    this.group.remove(this.stencilRoot, this.capGroup)
  }
}

function alignCapToPlane(mesh: THREE.Mesh, plane: THREE.Plane) {
  const normal = plane.normal
  mesh.position.copy(normal).multiplyScalar(-plane.constant)
  mesh.lookAt(mesh.position.clone().add(normal))
}

function createPlaneStencilGroup(geometry: THREE.BufferGeometry, plane: THREE.Plane, renderOrder: number): THREE.Group {
  const group = new THREE.Group()
  const baseMat = new THREE.MeshBasicMaterial()
  baseMat.depthWrite = false
  baseMat.depthTest = false
  baseMat.colorWrite = false
  baseMat.stencilWrite = true
  baseMat.stencilFunc = THREE.AlwaysStencilFunc

  const backMat = baseMat.clone()
  backMat.side = THREE.BackSide
  backMat.clippingPlanes = [plane]
  backMat.stencilFail = THREE.IncrementWrapStencilOp
  backMat.stencilZFail = THREE.IncrementWrapStencilOp
  backMat.stencilZPass = THREE.IncrementWrapStencilOp
  const backMesh = new THREE.Mesh(geometry, backMat)
  backMesh.renderOrder = renderOrder
  group.add(backMesh)

  const frontMat = baseMat.clone()
  frontMat.side = THREE.FrontSide
  frontMat.clippingPlanes = [plane]
  frontMat.stencilFail = THREE.DecrementWrapStencilOp
  frontMat.stencilZFail = THREE.DecrementWrapStencilOp
  frontMat.stencilZPass = THREE.DecrementWrapStencilOp
  const frontMesh = new THREE.Mesh(geometry, frontMat)
  frontMesh.renderOrder = renderOrder
  group.add(frontMesh)

  return group
}

export function defaultAxisState(): Record<Axis, AxisState> {
  return {
    x: { enabled: false, invert: false, offset: 0 },
    y: { enabled: false, invert: false, offset: 0 },
    z: { enabled: false, invert: false, offset: 0 },
  }
}
