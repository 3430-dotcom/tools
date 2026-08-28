import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'

export interface STLModel {
  mesh: THREE.Mesh
  triangleCount: number
  size: THREE.Vector3
  volumeMm3: number
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
  const geometry = loader.parse(buffer)
  geometry.computeVertexNormals()
  geometry.center()
  geometry.computeBoundingBox()

  const box = geometry.boundingBox ?? new THREE.Box3()
  const size = box.getSize(new THREE.Vector3())

  const material = new THREE.MeshStandardMaterial({
    color: 0x4f9dde,
    roughness: 0.35,
    metalness: 0.1,
    side: THREE.DoubleSide,
    clipShadows: true,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'stl-model'

  return {
    mesh,
    triangleCount: pos(geometry),
    size,
    volumeMm3: computeSignedVolume(geometry),
  }
}

function pos(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex()
  const count = index ? index.count : geometry.getAttribute('position').count
  return count / 3
}
