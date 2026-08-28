import * as THREE from 'three'
import { PDBLoader } from 'three/examples/jsm/loaders/PDBLoader.js'
import { elementRadius } from './colors'

export type PDBRenderMode = 'ball-stick' | 'spacefill'

export interface PDBModel {
  group: THREE.Group
  atomCount: number
  bondCount: number
  elementCounts: Record<string, number>
  box: THREE.Box3
  setRenderMode: (mode: PDBRenderMode) => void
}

const loader = new PDBLoader()

const sphereGeometry = new THREE.SphereGeometry(1, 20, 16)
const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 10)
cylinderGeometry.translate(0, 0.5, 0)

const BOND_RADIUS = 0.12
const BALL_STICK_ATOM_SCALE = 0.28
const UP = new THREE.Vector3(0, 1, 0)

export async function loadPDBFromText(text: string, mode: PDBRenderMode = 'ball-stick'): Promise<PDBModel> {
  const pdb = loader.parse(text)
  const { geometryAtoms, geometryBonds, json } = pdb as {
    geometryAtoms: THREE.BufferGeometry
    geometryBonds: THREE.BufferGeometry
    json: { atoms: [number, number, number, number[], string][] }
  }

  geometryAtoms.computeBoundingBox()
  const box = geometryAtoms.boundingBox ?? new THREE.Box3()
  const center = box.getCenter(new THREE.Vector3())

  const atoms = json.atoms
  const atomCount = atoms.length
  const positionAttr = geometryAtoms.getAttribute('position')
  const colorAttr = geometryAtoms.getAttribute('color')

  const elementCounts: Record<string, number> = {}
  const radii = new Float32Array(atomCount)
  const positions: THREE.Vector3[] = new Array(atomCount)
  for (let i = 0; i < atomCount; i++) {
    const symbol = atoms[i][4] ?? 'C'
    radii[i] = elementRadius(symbol)
    elementCounts[symbol] = (elementCounts[symbol] ?? 0) + 1
    positions[i] = new THREE.Vector3(
      positionAttr.getX(i) - center.x,
      positionAttr.getY(i) - center.y,
      positionAttr.getZ(i) - center.z,
    )
  }

  const atomMesh = new THREE.InstancedMesh(
    sphereGeometry,
    new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.05 }),
    atomCount,
  )
  atomMesh.name = 'pdb-atoms'

  // Most crystallographic PDB files (e.g. real protein structures) omit
  // CONECT records for standard residues, relying on viewers to infer bonds
  // from a chemical dictionary. Our loader has no such dictionary, so when
  // CONECT data is too sparse to be useful, fall back to distance-based
  // covalent bond perception instead of rendering a disconnected atom cloud.
  const conectPos = geometryBonds.getAttribute('position')
  const conectBondCount = conectPos ? conectPos.count / 2 : 0
  const bondPairs: [THREE.Vector3, THREE.Vector3][] =
    conectBondCount >= atomCount * 0.5
      ? Array.from({ length: conectBondCount }, (_, i) => [
          new THREE.Vector3(
            conectPos.getX(i * 2) - center.x,
            conectPos.getY(i * 2) - center.y,
            conectPos.getZ(i * 2) - center.z,
          ),
          new THREE.Vector3(
            conectPos.getX(i * 2 + 1) - center.x,
            conectPos.getY(i * 2 + 1) - center.y,
            conectPos.getZ(i * 2 + 1) - center.z,
          ),
        ])
      : inferBondsByDistance(positions, radii)

  const bondMesh = new THREE.InstancedMesh(
    cylinderGeometry,
    new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.5, metalness: 0.05 }),
    Math.max(bondPairs.length, 1),
  )
  bondMesh.name = 'pdb-bonds'

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  const color = new THREE.Color()

  function applyAtoms(currentMode: PDBRenderMode) {
    for (let i = 0; i < atomCount; i++) {
      const scale = currentMode === 'spacefill' ? radii[i] : radii[i] * BALL_STICK_ATOM_SCALE
      m.compose(positions[i], q.identity(), s.set(scale, scale, scale))
      atomMesh.setMatrixAt(i, m)
      color.setRGB(colorAttr.getX(i), colorAttr.getY(i), colorAttr.getZ(i))
      atomMesh.setColorAt(i, color)
    }
    atomMesh.instanceMatrix.needsUpdate = true
    if (atomMesh.instanceColor) atomMesh.instanceColor.needsUpdate = true
    atomMesh.visible = true
  }

  function applyBonds(currentMode: PDBRenderMode) {
    bondMesh.visible = currentMode === 'ball-stick' && bondPairs.length > 0
    if (!bondMesh.visible) return
    for (let i = 0; i < bondPairs.length; i++) {
      const [start, end] = bondPairs[i]
      const mid = start.clone().add(end).multiplyScalar(0.5)
      const dir = end.clone().sub(start)
      const length = dir.length() || 0.0001
      dir.normalize()
      q.setFromUnitVectors(UP, dir)
      m.compose(mid, q, s.set(BOND_RADIUS, length, BOND_RADIUS))
      bondMesh.setMatrixAt(i, m)
    }
    bondMesh.instanceMatrix.needsUpdate = true
  }

  applyAtoms(mode)
  applyBonds(mode)

  const group = new THREE.Group()
  group.add(atomMesh, bondMesh)
  group.name = 'pdb-model'

  const localBox = new THREE.Box3().setFromObject(group)

  return {
    group,
    atomCount,
    bondCount: bondPairs.length,
    elementCounts,
    box: localBox,
    setRenderMode: (newMode: PDBRenderMode) => {
      applyAtoms(newMode)
      applyBonds(newMode)
    },
  }
}

const BOND_TOLERANCE = 1.15
const MAX_BOND_LENGTH = 2.2
const MIN_BOND_LENGTH = 0.35

/** Grid-accelerated covalent bond perception: connects atoms within ~sum-of-covalent-radii. */
function inferBondsByDistance(positions: THREE.Vector3[], radii: Float32Array): [THREE.Vector3, THREE.Vector3][] {
  const cellSize = MAX_BOND_LENGTH
  const cellOf = (v: THREE.Vector3): [number, number, number] => [
    Math.floor(v.x / cellSize),
    Math.floor(v.y / cellSize),
    Math.floor(v.z / cellSize),
  ]
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`

  const grid = new Map<string, number[]>()
  for (let i = 0; i < positions.length; i++) {
    const [cx, cy, cz] = cellOf(positions[i])
    const k = key(cx, cy, cz)
    const bucket = grid.get(k)
    if (bucket) bucket.push(i)
    else grid.set(k, [i])
  }

  const pairs: [THREE.Vector3, THREE.Vector3][] = []
  for (let i = 0; i < positions.length; i++) {
    const [cx, cy, cz] = cellOf(positions[i])
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = grid.get(key(cx + dx, cy + dy, cz + dz))
          if (!bucket) continue
          for (const j of bucket) {
            if (j <= i) continue
            const dist = positions[i].distanceTo(positions[j])
            const cutoff = Math.min((radii[i] + radii[j]) * BOND_TOLERANCE, MAX_BOND_LENGTH)
            if (dist > MIN_BOND_LENGTH && dist <= cutoff) {
              pairs.push([positions[i], positions[j]])
            }
          }
        }
      }
    }
  }
  return pairs
}

export async function fetchPDBById(pdbId: string): Promise<string> {
  const id = pdbId.trim().toUpperCase()
  const res = await fetch(`https://files.rcsb.org/download/${id}.pdb`)
  if (!res.ok) {
    throw new Error(`PDB ID "${id}"를 불러오지 못했습니다 (${res.status})`)
  }
  return res.text()
}
