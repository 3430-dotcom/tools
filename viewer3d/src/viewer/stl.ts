import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'

export interface STLModel {
  mesh: THREE.Mesh
  triangleCount: number
  size: THREE.Vector3
  volumeMm3: number
  /** Whether this STL embedded its own per-facet color (a de-facto binary-STL extension some 3D-printing/scanning tools use). */
  hasEmbeddedColor: boolean
}

/** three.js's STLLoader sets these directly on the parsed geometry -- not part of its public TS types, so they need a local extension. */
interface STLGeometryWithColor extends THREE.BufferGeometry {
  hasColors?: boolean
  alpha?: number
}

const loader = new STLLoader()

function computeSignedVolume(geometry: THREE.BufferGeometry): number {
  const pos = geometry.getAttribute('position')
  let volume = 0
  const p1 = new THREE.Vector3()
  const p2 = new THREE.Vector3()
  const p3 = new THREE.Vector3()
  for (let i = 0; i < pos.count; i += 3) {
    p1.fromBufferAttribute(pos, i)
    p2.fromBufferAttribute(pos, i + 1)
    p3.fromBufferAttribute(pos, i + 2)
    volume += p1.dot(p2.clone().cross(p3)) / 6
  }
  return Math.abs(volume)
}

export function parseSTL(buffer: ArrayBuffer): STLModel {
  const geometry = loader.parse(buffer) as STLGeometryWithColor
  geometry.computeVertexNormals()
  geometry.center()
  geometry.computeBoundingBox()

  const box = geometry.boundingBox ?? new THREE.Box3()
  const size = box.getSize(new THREE.Vector3())

  // Some binary STL files embed their own per-facet color (a de-facto,
  // non-standard extension some 3D-printing/scanning tools use to save a
  // "COLOR=" header + a packed RGB555 color per facet). three.js's
  // STLLoader already detects and parses this into a vertex-color
  // attribute -- use it instead of our fixed default so the model matches
  // what the file (and any external preview of it) actually shows, rather
  // than silently overwriting a color the file itself specifies.
  const hasEmbeddedColor = geometry.hasColors === true
  const alpha = geometry.alpha ?? 1

  const material = new THREE.MeshStandardMaterial({
    color: hasEmbeddedColor ? 0xffffff : 0x4f9dde,
    vertexColors: hasEmbeddedColor,
    roughness: 0.35,
    metalness: 0.1,
    side: THREE.DoubleSide,
    clipShadows: true,
    transparent: hasEmbeddedColor && alpha < 1,
    opacity: hasEmbeddedColor ? alpha : 1,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'stl-model'

  return {
    mesh,
    triangleCount: pos(geometry),
    size,
    volumeMm3: computeSignedVolume(geometry),
    hasEmbeddedColor,
  }
}

function pos(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex()
  const count = index ? index.count : geometry.getAttribute('position').count
  return count / 3
}
