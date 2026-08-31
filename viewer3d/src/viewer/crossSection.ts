import * as THREE from 'three'

export type Axis = 'x' | 'y' | 'z'

export interface AxisState {
  enabled: boolean
  invert: boolean
  /** -1..1, mapped to the model's bounding radius */
  offset: number
}

export const AXIS_NORMALS: Record<Axis, THREE.Vector3> = {
  x: new THREE.Vector3(-1, 0, 0),
  y: new THREE.Vector3(0, -1, 0),
  z: new THREE.Vector3(0, 0, -1),
}

export const AXES: Axis[] = ['x', 'y', 'z']

/**
 * A renderable whose closed surface(s) should count toward the cross-section
 * cap: a plain solid Mesh (STL) or an InstancedMesh where every instance is
 * itself a closed solid (PDB atom spheres / bond cylinders).
 */
export type CapSource = THREE.Mesh | THREE.InstancedMesh

/**
 * Builds solid cross-section "caps" using the stencil-buffer technique so a
 * clipped solid mesh reads as a real cut surface instead of a hollow shell.
 * See three.js's webgl_clipping_stencil example for the underlying recipe.
 *
 * The even-odd stencil parity trick generalizes to a *union* of multiple
 * overlapping closed solids -- not just one watertight mesh -- so the same
 * code caps a single STL mesh as well as a whole InstancedMesh of PDB atom
 * spheres (or atoms + bond cylinders together) without needing to boolean
 * them into one geometry first.
 */
export class CrossSectionController {
  readonly planes: Record<Axis, THREE.Plane>
  readonly planeHelpers: Record<Axis, THREE.PlaneHelper>
  readonly helperGroup = new THREE.Group()
  /**
   * Invisible (opacity 0) planes that track each axis's cut plane, existing
   * purely as a raycast target so the viewport can support grabbing and
   * dragging a cut plane directly instead of only via the sidebar slider.
   * Kept separate from the visible cap meshes (capGroup) since those aren't
   * rebuilt/present for every render mode (e.g. spacefill has no flat cap
   * at all now -- see PDBModel.updateAtomCaps) while the plane itself is
   * always draggable whenever its axis is enabled.
   */
  readonly dragHandles: Record<Axis, THREE.Mesh>
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
    this.dragHandles = {} as Record<Axis, THREE.Mesh>
    for (const axis of AXES) {
      this.planeHelpers[axis].visible = false
      this.helperGroup.add(this.planeHelpers[axis])

      const handle = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false, side: THREE.DoubleSide }),
      )
      handle.visible = false
      this.dragHandles[axis] = handle
      this.helperGroup.add(handle)
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
      this.dragHandles[axis].scale.setScalar(this.radius * 4)
    }
  }

  /**
   * (Re)builds the stencil groups + cap planes for one or more solid sources
   * (an STL mesh, or the PDB atom/bond InstancedMeshes relevant to the
   * current render mode). Pass `null`/`[]` to keep plane clipping without a
   * solid cap (e.g. the cartoon ribbon, which isn't a closed solid).
   */
  attachGeometry(sources: CapSource | CapSource[] | null, boundingRadius: number, capColor: THREE.ColorRepresentation = 0xe91e63) {
    this.clearStencil()
    this.setRadius(boundingRadius)
    const list = sources ? (Array.isArray(sources) ? sources : [sources]) : []
    if (list.length === 0) return
    const planeSize = this.radius * 4

    for (const axis of AXES) {
      const plane = this.planes[axis]
      this.stencilRoot.add(createPlaneStencilGroup(list, plane, AXES.indexOf(axis) + 1))

      const capMat = new THREE.MeshStandardMaterial({
        color: capColor,
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
      alignCapToPlane(this.dragHandles[axis], plane)
      this.dragHandles[axis].visible = s.enabled
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

function makeStencilMaterial(side: THREE.Side, plane: THREE.Plane, op: THREE.StencilOp): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial()
  mat.depthWrite = false
  mat.depthTest = false
  mat.colorWrite = false
  mat.stencilWrite = true
  mat.stencilFunc = THREE.AlwaysStencilFunc
  mat.side = side
  mat.clippingPlanes = [plane]
  mat.stencilFail = op
  mat.stencilZFail = op
  mat.stencilZPass = op
  return mat
}

/** Clones a cap source for one stencil pass, sharing its geometry (and, for instances, its transforms) rather than copying them. */
function cloneForStencil(source: CapSource, material: THREE.Material): THREE.Mesh | THREE.InstancedMesh {
  if (source instanceof THREE.InstancedMesh) {
    const clone = new THREE.InstancedMesh(source.geometry, material, source.count)
    clone.instanceMatrix = source.instanceMatrix
    clone.frustumCulled = false
    return clone
  }
  const clone = new THREE.Mesh(source.geometry, material)
  clone.frustumCulled = false
  return clone
}

/**
 * One plane's stencil pass across every source: each source contributes a
 * back-face (increment) and front-face (decrement) sub-pass, so overlapping
 * solids (e.g. atom spheres + bond cylinders) accumulate into a single
 * even-odd parity that represents their union, not each solid separately.
 */
function createPlaneStencilGroup(sources: CapSource[], plane: THREE.Plane, renderOrder: number): THREE.Group {
  const group = new THREE.Group()
  const backMat = makeStencilMaterial(THREE.BackSide, plane, THREE.IncrementWrapStencilOp)
  const frontMat = makeStencilMaterial(THREE.FrontSide, plane, THREE.DecrementWrapStencilOp)

  for (const source of sources) {
    const backMesh = cloneForStencil(source, backMat)
    backMesh.renderOrder = renderOrder
    group.add(backMesh)

    const frontMesh = cloneForStencil(source, frontMat)
    frontMesh.renderOrder = renderOrder
    group.add(frontMesh)
  }

  return group
}

export function defaultAxisState(): Record<Axis, AxisState> {
  return {
    x: { enabled: false, invert: false, offset: 0 },
    y: { enabled: false, invert: false, offset: 0 },
    z: { enabled: false, invert: false, offset: 0 },
  }
}
