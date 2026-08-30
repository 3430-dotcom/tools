import * as THREE from 'three'
import type { AtomDetail } from './pdb'

export type SSClass = 'helix' | 'sheet' | 'coil'

const SAMPLES_PER_RESIDUE = 6
const HELIX_WIDTH = 1.8
const HELIX_THICKNESS = 0.5
const SHEET_WIDTH = 1.8
const SHEET_THICKNESS = 0.35
const COIL_RADIUS = 0.3
/** How many residues before a strand's end the arrowhead starts tapering to a point. */
const ARROW_TAPER_RESIDUES = 1.6

export const CARTOON_COLORS: Record<SSClass, THREE.Color> = {
  helix: new THREE.Color(0xff4d6d),
  sheet: new THREE.Color(0xffd23f),
  coil: new THREE.Color(0xdfe6f0),
}

interface ChainResidue {
  resSeq: number
  position: THREE.Vector3
  ss: SSClass
}

/**
 * Builds a proper cartoon/ribbon representation: the CA backbone trace is
 * smoothed into a spline per chain, then extruded with a cross-section that
 * depends on secondary structure -- a flat wide ribbon for helices, a flat
 * ribbon that tapers to a point (arrowhead) at the end of each beta strand,
 * and a thin tube for loops/coil. This is the standard representation real
 * molecular viewers (PyMOL, Chimera, Mol*) use to make fold/topology
 * actually readable, as opposed to coloring a cloud of individual atoms.
 */
export function buildCartoonGroup(positions: THREE.Vector3[], atomDetails: AtomDetail[], ssClass: SSClass[]): THREE.Group {
  const group = new THREE.Group()
  group.name = 'pdb-cartoon'

  const byChain = new Map<string, ChainResidue[]>()
  for (let i = 0; i < atomDetails.length; i++) {
    const a = atomDetails[i]
    if (a.atomName !== 'CA') continue
    let arr = byChain.get(a.chain)
    if (!arr) byChain.set(a.chain, (arr = []))
    arr.push({ resSeq: a.resSeq, position: positions[i], ss: ssClass[i] })
  }

  for (const residues of byChain.values()) {
    residues.sort((a, b) => a.resSeq - b.resSeq)
    const mesh = buildChainRibbon(residues)
    if (mesh) group.add(mesh)
  }

  return group
}

function buildChainRibbon(residues: ChainResidue[]): THREE.Mesh | null {
  const n = residues.length
  if (n < 2) return null

  const points = residues.map((r) => r.position)
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5)
  const totalSamples = (n - 1) * SAMPLES_PER_RESIDUE + 1
  const samplePoints = curve.getPoints(totalSamples - 1)

  const sheetRunEnd = computeRunEnds(
    residues.map((r) => r.ss),
    'sheet',
  )
  const ssOf = (residueIdx: number) => residues[clamp(residueIdx, 0, n - 1)].ss

  const tangents: THREE.Vector3[] = new Array(totalSamples)
  for (let k = 0; k < totalSamples; k++) {
    const u = clamp(k / (totalSamples - 1), 0.0001, 0.9999)
    tangents[k] = curve.getTangentAt(u).normalize()
  }

  // Parallel-transported reference vector: at each step, project the
  // previous frame's reference onto the plane perpendicular to the new
  // tangent. This is a simple rotation-minimizing frame -- it keeps the
  // ribbon from twisting/flipping along the curve the way naive per-sample
  // Frenet frames would at inflection points (very common in protein
  // backbones).
  const refs: THREE.Vector3[] = new Array(totalSamples)
  {
    const worldUp = new THREE.Vector3(0, 1, 0)
    let seed = new THREE.Vector3().crossVectors(tangents[0], worldUp)
    if (seed.lengthSq() < 1e-6) seed = new THREE.Vector3().crossVectors(tangents[0], new THREE.Vector3(1, 0, 0))
    refs[0] = seed.normalize()
    for (let k = 1; k < totalSamples; k++) {
      const prev = refs[k - 1]
      const t = tangents[k]
      const projected = prev.clone().sub(t.clone().multiplyScalar(prev.dot(t)))
      refs[k] = projected.lengthSq() < 1e-8 ? prev.clone() : projected.normalize()
    }
  }

  const positionsArr: number[] = []
  const colorsArr: number[] = []
  const indices: number[] = []

  let vertBase = 0
  for (let k = 0; k < totalSamples; k++) {
    const t = k / SAMPLES_PER_RESIDUE
    const residueIdx = Math.round(t)
    const ss = ssOf(residueIdx)

    let halfW: number
    let halfT: number
    if (ss === 'helix') {
      halfW = HELIX_WIDTH / 2
      halfT = HELIX_THICKNESS / 2
    } else if (ss === 'sheet') {
      const end = sheetRunEnd[clamp(residueIdx, 0, n - 1)]
      const distToEnd = end - t
      const taper = clamp(distToEnd / ARROW_TAPER_RESIDUES, 0.06, 1)
      halfW = (SHEET_WIDTH / 2) * taper
      halfT = SHEET_THICKNESS / 2
    } else {
      halfW = COIL_RADIUS
      halfT = COIL_RADIUS
    }

    const center = samplePoints[k]
    const tangent = tangents[k]
    const ref = refs[k]
    const bin = new THREE.Vector3().crossVectors(tangent, ref).normalize()

    const col = CARTOON_COLORS[ss]
    for (const [sx, sy] of [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ]) {
      const c = center.clone().addScaledVector(ref, sx * halfW).addScaledVector(bin, sy * halfT)
      positionsArr.push(c.x, c.y, c.z)
      colorsArr.push(col.r, col.g, col.b)
    }

    if (k > 0) {
      const p = vertBase - 4
      const cIdx = vertBase
      for (let s = 0; s < 4; s++) {
        const a0 = p + s
        const a1 = p + ((s + 1) % 4)
        const b0 = cIdx + s
        const b1 = cIdx + ((s + 1) % 4)
        indices.push(a0, b0, b1, a0, b1, a1)
      }
    }
    vertBase += 4
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positionsArr, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colorsArr, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.45,
    metalness: 0.05,
    side: THREE.DoubleSide,
  })

  return new THREE.Mesh(geometry, material)
}

function computeRunEnds(list: SSClass[], kind: SSClass): number[] {
  const runEnd = new Array(list.length).fill(-1)
  let i = 0
  while (i < list.length) {
    if (list[i] === kind) {
      let j = i
      while (j + 1 < list.length && list[j + 1] === kind) j++
      for (let k = i; k <= j; k++) runEnd[k] = j
      i = j + 1
    } else {
      i++
    }
  }
  return runEnd
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}
