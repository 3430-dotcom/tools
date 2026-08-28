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
  for (let i = 0; i < atomCount; i++) {
    const symbol = atoms[i][4] ?? 'C'
    radii[i] = elementRadius(symbol)
    elementCounts[symbol] = (elementCounts[symbol] ?? 0) + 1
  }

  const atomMesh = new THREE.InstancedMesh(
    sphereGeometry,
    new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.05 }),
    atomCount,
  )
  atomMesh.name = 'pdb-atoms'

  const bondPos = geometryBonds.getAttribute('position')
  const bondCount = bondPos ? bondPos.count / 2 : 0
  const bondMesh = new THREE.InstancedMesh(
    cylinderGeometry,
    new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.5, metalness: 0.05 }),
    Math.max(bondCount, 1),
  )
  bondMesh.name = 'pdb-bonds'

  const m = new THREE.Matrix4()
  const p = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  const color = new THREE.Color()

  function applyAtoms(currentMode: PDBRenderMode) {
    for (let i = 0; i < atomCount; i++) {
      p.set(
        positionAttr.getX(i) - center.x,
        positionAttr.getY(i) - center.y,
        positionAttr.getZ(i) - center.z,
      )
      const scale = currentMode === 'spacefill' ? radii[i] : radii[i] * BALL_STICK_ATOM_SCALE
      m.compose(p, q.identity(), s.set(scale, scale, scale))
      atomMesh.setMatrixAt(i, m)
      color.setRGB(colorAttr.getX(i), colorAttr.getY(i), colorAttr.getZ(i))
      atomMesh.setColorAt(i, color)
    }
    atomMesh.instanceMatrix.needsUpdate = true
    if (atomMesh.instanceColor) atomMesh.instanceColor.needsUpdate = true
    atomMesh.visible = true
  }

  function applyBonds(currentMode: PDBRenderMode) {
    bondMesh.visible = currentMode === 'ball-stick' && bondCount > 0
    if (!bondMesh.visible) return
    for (let i = 0; i < bondCount; i++) {
      const ax = bondPos.getX(i * 2) - center.x
      const ay = bondPos.getY(i * 2) - center.y
      const az = bondPos.getZ(i * 2) - center.z
      const bx = bondPos.getX(i * 2 + 1) - center.x
      const by = bondPos.getY(i * 2 + 1) - center.y
      const bz = bondPos.getZ(i * 2 + 1) - center.z

      const start = new THREE.Vector3(ax, ay, az)
      const end = new THREE.Vector3(bx, by, bz)
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
    bondCount,
    elementCounts,
    box: localBox,
    setRenderMode: (newMode: PDBRenderMode) => {
      applyAtoms(newMode)
      applyBonds(newMode)
    },
  }
}

export async function fetchPDBById(pdbId: string): Promise<string> {
  const id = pdbId.trim().toUpperCase()
  const res = await fetch(`https://files.rcsb.org/download/${id}.pdb`)
  if (!res.ok) {
    throw new Error(`PDB ID "${id}"를 불러오지 못했습니다 (${res.status})`)
  }
  return res.text()
}
