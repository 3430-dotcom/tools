import * as THREE from 'three'
import { PDBLoader } from 'three/examples/jsm/loaders/PDBLoader.js'
import { elementRadius } from './colors'
import { buildCartoonGroup, CARTOON_COLORS, type SSClass } from './cartoon'

export type PDBRenderMode = 'ball-stick' | 'spacefill' | 'cartoon'
export type PDBColorMode = 'element' | 'structure'

export interface AtomDetail {
  element: string
  atomName: string
  resName: string
  resSeq: number
  chain: string
  isHetero: boolean
}

export interface PDBMetadata {
  title: string | null
  organism: string | null
  method: string | null
  helixCount: number
  sheetCount: number
}

export interface PDBModel {
  group: THREE.Group
  atomMesh: THREE.InstancedMesh
  bondMesh: THREE.InstancedMesh
  atomCount: number
  bondCount: number
  elementCounts: Record<string, number>
  atomDetails: AtomDetail[]
  /** Local-space (group-relative) atom positions, in the same order as atomDetails/instance indices. */
  positions: THREE.Vector3[]
  /** [atomIndexA, atomIndexB] per bond instance, in the same order as bondMesh's instances. */
  bondAtomIndices: [number, number][]
  metadata: PDBMetadata
  hasCartoon: boolean
  box: THREE.Box3
  setRenderMode: (mode: PDBRenderMode) => void
  setColorMode: (mode: PDBColorMode) => void
  /** Highlights an atom (and the bonds attached to it) in-place, or clears the highlight when passed null. */
  setSelectedAtom: (index: number | null) => void
  /** Highlights a bond (and its two endpoint atoms) in-place, or clears the highlight when passed null. */
  setSelectedBond: (index: number | null) => void
  /** Bond instance indices attached to a given atom, for callers that need it independent of the highlight. */
  bondsForAtom: (index: number) => number[]
}

const loader = new PDBLoader()

const sphereGeometry = new THREE.SphereGeometry(1, 20, 16)
const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 10)
cylinderGeometry.translate(0, 0.5, 0)

const BOND_RADIUS = 0.12
const BALL_STICK_ATOM_SCALE = 0.28
const UP = new THREE.Vector3(0, 1, 0)

export async function loadPDBFromText(text: string, mode: PDBRenderMode = 'spacefill'): Promise<PDBModel> {
  const pdb = loader.parse(text)
  const { geometryAtoms, geometryBonds, json } = pdb as {
    geometryAtoms: THREE.BufferGeometry
    geometryBonds: THREE.BufferGeometry
    json: { atoms: [number, number, number, number[], string][] }
  }

  const atoms = json.atoms
  const atomCount = atoms.length
  if (atomCount === 0) {
    throw new Error('이 파일에서 원자 좌표를 찾지 못했습니다. PDB 형식(ATOM/HETATM 레코드)이 아니거나 지원하지 않는 항목일 수 있어요.')
  }

  // PDBLoader's own parsed output only carries position/color/element per
  // atom, not residue/chain -- re-scan the raw text ourselves, in the exact
  // same order/predicate PDBLoader uses (ATOM or HETATM lines, top to
  // bottom), so index i here lines up with atoms[i] and every rendered
  // instance can be traced back to a residue and chain on click.
  const atomDetails = parseAtomDetails(text)
  const metadata = parsePDBMetadata(text)
  const ssRanges = parseSecondaryStructureRanges(text)
  const ssClass: SSClass[] = atomDetails.map((a) => classifySecondaryStructure(a, ssRanges))

  geometryAtoms.computeBoundingBox()
  const box = geometryAtoms.boundingBox ?? new THREE.Box3()
  const center = box.getCenter(new THREE.Vector3())

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
    // Base material color must stay white -- instance colors (setColorAt)
    // multiply into it, so anything less than white would tint every atom.
    new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.05 }),
    atomCount,
  )
  atomMesh.name = 'pdb-atoms'

  // Most crystallographic PDB files (e.g. real protein structures) omit
  // CONECT records for standard residues, relying on viewers to infer bonds
  // from a chemical dictionary. Our loader has no such dictionary, so when
  // CONECT data is too sparse to be useful, fall back to distance-based
  // covalent bond perception instead of rendering a disconnected atom cloud.
  //
  // Bonds are tracked as atom index pairs (not raw positions) so a selected
  // atom can look up which bond instances touch it, for highlighting.
  const conectPos = geometryBonds.getAttribute('position')
  const conectBondCount = conectPos ? conectPos.count / 2 : 0
  const bondPairs: [number, number][] =
    conectBondCount >= atomCount * 0.5 ? resolveConectBondIndices(conectPos, conectBondCount, positions, center) : inferBondsByDistance(positions, radii)

  const bondMesh = new THREE.InstancedMesh(
    cylinderGeometry,
    // Base material color must stay white for the same instance-color reason as atomMesh.
    new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.05 }),
    Math.max(bondPairs.length, 1),
  )
  bondMesh.name = 'pdb-bonds'

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  const color = new THREE.Color()

  const ATOM_HIGHLIGHT_COLOR = new THREE.Color(0x22e3ff)
  const BOND_DEFAULT_COLOR = new THREE.Color(0xaaaaaa)
  const BOND_HIGHLIGHT_COLOR = new THREE.Color(0xffc93f)

  function atomDisplayColor(i: number, currentColorMode: PDBColorMode): THREE.Color {
    if (currentColorMode === 'structure') return color.copy(CARTOON_COLORS[ssClass[i]])
    return color.setRGB(colorAttr.getX(i), colorAttr.getY(i), colorAttr.getZ(i))
  }

  function applyAtoms(currentMode: PDBRenderMode, currentColorMode: PDBColorMode) {
    for (let i = 0; i < atomCount; i++) {
      const scale = currentMode === 'spacefill' ? radii[i] : radii[i] * BALL_STICK_ATOM_SCALE
      m.compose(positions[i], q.identity(), s.set(scale, scale, scale))
      atomMesh.setMatrixAt(i, m)
      atomMesh.setColorAt(i, highlightedAtoms.includes(i) ? ATOM_HIGHLIGHT_COLOR : atomDisplayColor(i, currentColorMode))
    }
    atomMesh.instanceMatrix.needsUpdate = true
    if (atomMesh.instanceColor) atomMesh.instanceColor.needsUpdate = true
    atomMesh.visible = true
  }

  function applyBonds(currentMode: PDBRenderMode) {
    bondMesh.visible = currentMode === 'ball-stick' && bondPairs.length > 0
    if (!bondMesh.visible) return
    for (let i = 0; i < bondPairs.length; i++) {
      const [a, b] = bondPairs[i]
      const start = positions[a]
      const end = positions[b]
      const mid = start.clone().add(end).multiplyScalar(0.5)
      const dir = end.clone().sub(start)
      const length = dir.length() || 0.0001
      dir.normalize()
      q.setFromUnitVectors(UP, dir)
      m.compose(mid, q, s.set(BOND_RADIUS, length, BOND_RADIUS))
      bondMesh.setMatrixAt(i, m)
      bondMesh.setColorAt(i, highlightedBonds.includes(i) ? BOND_HIGHLIGHT_COLOR : BOND_DEFAULT_COLOR)
    }
    bondMesh.instanceMatrix.needsUpdate = true
    if (bondMesh.instanceColor) bondMesh.instanceColor.needsUpdate = true
  }

  function bondsForAtomFn(index: number): number[] {
    const result: number[] = []
    for (let i = 0; i < bondPairs.length; i++) {
      if (bondPairs[i][0] === index || bondPairs[i][1] === index) result.push(i)
    }
    return result
  }

  // A selection can originate from either an atom click (highlighting the
  // atom plus every bond touching it) or a bond click (highlighting the
  // bond plus its two endpoint atoms) -- both just reduce to "these atom
  // indices + these bond indices get tinted," so one pair of arrays and one
  // apply/clear routine covers both origins.
  let highlightedAtoms: number[] = []
  let highlightedBonds: number[] = []

  function clearHighlight() {
    for (const i of highlightedAtoms) atomMesh.setColorAt(i, atomDisplayColor(i, currentColorMode))
    for (const bi of highlightedBonds) bondMesh.setColorAt(bi, BOND_DEFAULT_COLOR)
    highlightedAtoms = []
    highlightedBonds = []
  }

  function applyHighlight(atoms: number[], bonds: number[]) {
    highlightedAtoms = atoms
    highlightedBonds = bonds
    for (const i of highlightedAtoms) atomMesh.setColorAt(i, ATOM_HIGHLIGHT_COLOR)
    for (const bi of highlightedBonds) bondMesh.setColorAt(bi, BOND_HIGHLIGHT_COLOR)
  }

  function finishHighlightUpdate() {
    if (atomMesh.instanceColor) atomMesh.instanceColor.needsUpdate = true
    if (bondMesh.instanceColor) bondMesh.instanceColor.needsUpdate = true
  }

  function setSelectedAtomFn(index: number | null) {
    clearHighlight()
    if (index !== null) applyHighlight([index], bondsForAtomFn(index))
    finishHighlightUpdate()
  }

  function setSelectedBondFn(index: number | null) {
    clearHighlight()
    if (index !== null) applyHighlight([...bondPairs[index]], [index])
    finishHighlightUpdate()
  }

  const cartoonGroup = buildCartoonGroup(positions, atomDetails, ssClass)
  cartoonGroup.visible = false

  function applyMode(currentMode: PDBRenderMode) {
    atomMesh.visible = currentMode !== 'cartoon'
    cartoonGroup.visible = currentMode === 'cartoon'
  }

  let currentRenderMode = mode
  let currentColorMode: PDBColorMode = 'element'
  applyAtoms(currentRenderMode, currentColorMode)
  applyBonds(currentRenderMode)
  applyMode(currentRenderMode)

  const group = new THREE.Group()
  group.add(atomMesh, bondMesh, cartoonGroup)
  group.name = 'pdb-model'

  const localBox = new THREE.Box3().setFromObject(group)

  return {
    group,
    atomMesh,
    bondMesh,
    atomCount,
    bondCount: bondPairs.length,
    elementCounts,
    atomDetails,
    positions,
    bondAtomIndices: bondPairs,
    metadata,
    hasCartoon: cartoonGroup.children.length > 0,
    box: localBox,
    setRenderMode: (newMode: PDBRenderMode) => {
      currentRenderMode = newMode
      applyAtoms(currentRenderMode, currentColorMode)
      applyBonds(currentRenderMode)
      applyMode(currentRenderMode)
    },
    setColorMode: (newColorMode: PDBColorMode) => {
      currentColorMode = newColorMode
      applyAtoms(currentRenderMode, currentColorMode)
    },
    setSelectedAtom: setSelectedAtomFn,
    setSelectedBond: setSelectedBondFn,
    bondsForAtom: bondsForAtomFn,
  }
}

function isAtomLine(line: string): boolean {
  return line.slice(0, 4) === 'ATOM' || line.slice(0, 6) === 'HETATM'
}

/** Re-parses residue/chain/atom-name info directly, matching PDBLoader's atom order exactly. */
function parseAtomDetails(text: string): AtomDetail[] {
  const details: AtomDetail[] = []
  for (const line of text.split('\n')) {
    if (!isAtomLine(line)) continue
    let element = line.slice(76, 78).trim()
    if (!element) element = line.slice(12, 14).trim()
    details.push({
      element: element.charAt(0).toUpperCase() + element.slice(1).toLowerCase(),
      atomName: line.slice(12, 16).trim(),
      resName: line.slice(17, 20).trim(),
      resSeq: parseInt(line.slice(22, 26), 10) || 0,
      chain: line.slice(21, 22).trim() || '-',
      isHetero: line.slice(0, 6) === 'HETATM',
    })
  }
  return details
}

interface SSRange {
  chain: string
  start: number
  end: number
  kind: 'helix' | 'sheet'
}

/** Parses HELIX/SHEET record residue ranges so atoms can be colored by secondary structure. */
function parseSecondaryStructureRanges(text: string): SSRange[] {
  const ranges: SSRange[] = []
  for (const line of text.split('\n')) {
    if (line.slice(0, 5) === 'HELIX') {
      const chain = line.slice(19, 20).trim()
      const start = parseInt(line.slice(21, 25), 10)
      const end = parseInt(line.slice(33, 37), 10)
      if (chain && Number.isFinite(start) && Number.isFinite(end)) {
        ranges.push({ chain, start, end, kind: 'helix' })
      }
    } else if (line.slice(0, 5) === 'SHEET') {
      const chain = line.slice(21, 22).trim()
      const start = parseInt(line.slice(22, 26), 10)
      const end = parseInt(line.slice(33, 37), 10)
      if (chain && Number.isFinite(start) && Number.isFinite(end)) {
        ranges.push({ chain, start, end, kind: 'sheet' })
      }
    }
  }
  return ranges
}

function classifySecondaryStructure(atom: AtomDetail, ranges: SSRange[]): SSClass {
  for (const r of ranges) {
    if (r.chain === atom.chain && atom.resSeq >= r.start && atom.resSeq <= r.end) return r.kind
  }
  return 'coil'
}

/**
 * Some generators (e.g. the CACTUS structure service behind our small-molecule
 * samples) pad every header line with a legacy card ID like "NONE   2" in the
 * far-right columns even when the real field content is blank -- strip that
 * off so an empty TITLE doesn't come through as the literal text "NONE 2".
 */
function cleanHeaderField(value: string): string | null {
  const cleaned = value.replace(/\s*NONE\s+\d+\s*$/, '').trim()
  return cleaned || null
}

/** Best-effort extraction of the handful of PDB header fields worth showing to a viewer. */
function parsePDBMetadata(text: string): PDBMetadata {
  const lines = text.split('\n')

  const titleParts = lines.filter((l) => l.slice(0, 5) === 'TITLE').map((l) => cleanHeaderField(l.slice(10)) ?? '')
  const title = cleanHeaderField(titleParts.join(' ').replace(/\s+/g, ' '))

  const compndText = lines
    .filter((l) => l.slice(0, 6) === 'COMPND')
    .map((l) => cleanHeaderField(l.slice(10)) ?? '')
    .join(' ')
  const moleculeMatch = compndText.match(/MOLECULE:\s*([^;]+);/)
  const organismText = lines
    .filter((l) => l.slice(0, 6) === 'SOURCE')
    .map((l) => cleanHeaderField(l.slice(10)) ?? '')
    .join(' ')
  const organismMatch = organismText.match(/ORGANISM_SCIENTIFIC:\s*([^;]+);/)

  const expdtaLine = lines.find((l) => l.slice(0, 6) === 'EXPDTA')
  const method = expdtaLine ? cleanHeaderField(expdtaLine.slice(10).replace(/\s+/g, ' ')) : null

  const helixCount = lines.filter((l) => l.slice(0, 5) === 'HELIX').length
  const sheetCount = lines.filter((l) => l.slice(0, 5) === 'SHEET').length

  return {
    title: title || cleanHeaderField(moleculeMatch?.[1] ?? ''),
    organism: cleanHeaderField(organismMatch?.[1] ?? ''),
    method,
    helixCount,
    sheetCount,
  }
}

const BOND_TOLERANCE = 1.15
const MAX_BOND_LENGTH = 2.2
const MIN_BOND_LENGTH = 0.35

/** Grid-accelerated covalent bond perception: connects atoms within ~sum-of-covalent-radii. */
function inferBondsByDistance(positions: THREE.Vector3[], radii: Float32Array): [number, number][] {
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

  const pairs: [number, number][] = []
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
              pairs.push([i, j])
            }
          }
        }
      }
    }
  }
  return pairs
}

/**
 * CONECT records give bond endpoints as raw coordinates (already resolved
 * by PDBLoader), not atom indices -- recover the index by matching each
 * endpoint back to our own (equally centered) positions array. Coordinates
 * come from parsing the same source text with the same float precision, so
 * a tight rounding key is enough to resolve them exactly.
 */
function resolveConectBondIndices(
  conectPos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  bondCount: number,
  positions: THREE.Vector3[],
  center: THREE.Vector3,
): [number, number][] {
  const key = (x: number, y: number, z: number) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`
  const byPosition = new Map<string, number>()
  for (let i = 0; i < positions.length; i++) {
    byPosition.set(key(positions[i].x, positions[i].y, positions[i].z), i)
  }

  const pairs: [number, number][] = []
  for (let i = 0; i < bondCount; i++) {
    const a = byPosition.get(key(conectPos.getX(i * 2) - center.x, conectPos.getY(i * 2) - center.y, conectPos.getZ(i * 2) - center.z))
    const b = byPosition.get(
      key(conectPos.getX(i * 2 + 1) - center.x, conectPos.getY(i * 2 + 1) - center.y, conectPos.getZ(i * 2 + 1) - center.z),
    )
    if (a !== undefined && b !== undefined) pairs.push([a, b])
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

export interface PDBSearchResult {
  id: string
  title: string
}

/**
 * Searches the RCSB Protein Data Bank (the standard public hub for solved
 * molecular structures) by free-text name, e.g. "hemoglobin" or "insulin".
 * Uses RCSB's public, key-free search + data REST APIs.
 */
export async function searchPDB(query: string): Promise<PDBSearchResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const searchQuery = {
    query: {
      type: 'terminal',
      service: 'full_text',
      parameters: { value: trimmed },
    },
    return_type: 'entry',
    request_options: { paginate: { start: 0, rows: 8 } },
  }
  const searchUrl = `https://search.rcsb.org/rcsbsearch/v2/query?json=${encodeURIComponent(JSON.stringify(searchQuery))}`

  const res = await fetch(searchUrl)
  if (res.status === 204) return []
  if (!res.ok) {
    throw new Error(`검색에 실패했습니다 (${res.status})`)
  }
  const data = (await res.json()) as { result_set?: { identifier: string }[] }
  // RCSB search can also surface computed structure models (e.g. "AF_AFP...")
  // which live at a different URL scheme our simple downloader doesn't
  // handle -- restrict to standard 4-character experimental entry IDs.
  const ids = (data.result_set ?? [])
    .map((r) => r.identifier)
    .filter((id) => /^[0-9][A-Za-z0-9]{3}$/.test(id))

  // Fetch each candidate's title (best-effort, one lightweight request per
  // result). We used to also fetch the full legacy-PDB file up front to
  // filter out coordinate-less entries, but that doubled the request count
  // (up to 16 in-flight requests for 8 results) and made search unreliable
  // on slower/restrictive networks -- a single flaky request would silently
  // drop an otherwise perfectly loadable result. The rare unloadable entry
  // is still caught with a clear error at load time (see loadPDBFromText).
  const results = await Promise.all(
    ids.map(async (id): Promise<PDBSearchResult> => {
      try {
        const entryRes = await fetch(`https://data.rcsb.org/rest/v1/core/entry/${id}`)
        const entry = (await entryRes.json()) as { struct?: { title?: string } }
        return { id, title: entry.struct?.title ?? id }
      } catch {
        return { id, title: id }
      }
    }),
  )
  return results
}
