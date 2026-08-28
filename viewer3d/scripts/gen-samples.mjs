import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { writeFileSync } from 'node:fs'

const exporter = new STLExporter()

function save(name, geometry) {
  geometry.computeVertexNormals()
  const mesh = new THREE.Mesh(geometry)
  const stl = exporter.parse(mesh, { binary: true })
  writeFileSync(new URL(`../public/samples/${name}.stl`, import.meta.url), Buffer.from(stl.buffer))
  console.log(`wrote ${name}.stl`)
}

save('torus-knot', new THREE.TorusKnotGeometry(9, 3, 120, 16))

function gearShape(teeth, innerR, outerR, boreR) {
  const shape = new THREE.Shape()
  const step = (Math.PI * 2) / teeth
  for (let i = 0; i < teeth; i++) {
    const a0 = i * step
    const a1 = a0 + step * 0.4
    const a2 = a0 + step * 0.5
    const a3 = a0 + step * 0.9
    const pts = [
      [Math.cos(a0) * innerR, Math.sin(a0) * innerR],
      [Math.cos(a1) * outerR, Math.sin(a1) * outerR],
      [Math.cos(a2) * outerR, Math.sin(a2) * outerR],
      [Math.cos(a3) * innerR, Math.sin(a3) * innerR],
    ]
    pts.forEach(([x, y], idx) => {
      if (i === 0 && idx === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    })
  }
  shape.closePath()
  const hole = new THREE.Path()
  hole.absarc(0, 0, boreR, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  return shape
}

const gear = gearShape(12, 14, 18, 5)
const gearGeom = new THREE.ExtrudeGeometry(gear, { depth: 6, bevelEnabled: true, bevelSize: 0.5, bevelThickness: 0.5, curveSegments: 24 })
gearGeom.rotateX(Math.PI / 2)
save('gear-bracket', gearGeom)

save('torus', new THREE.TorusGeometry(8, 3, 24, 48))

// Vase: a single closed lathe profile that goes up the outer wall and back
// down the inner wall, so the revolved solid has a real hollow interior and
// wall thickness -- cutting it actually reveals something, unlike a solid.
function vaseProfile() {
  const outerR = (y) => 5 + 3.2 * Math.sin((y / 20) * Math.PI * 0.9) + (y / 20) * 2
  const wall = 1
  const height = 20
  const steps = 40
  const pts = [new THREE.Vector2(0, 0)]
  for (let i = 0; i <= steps; i++) {
    const y = (i / steps) * height
    pts.push(new THREE.Vector2(outerR(y), y))
  }
  for (let i = steps; i >= 0; i--) {
    const y = (i / steps) * height
    pts.push(new THREE.Vector2(Math.max(outerR(y) - wall, 0.001), y))
  }
  pts.push(new THREE.Vector2(0, 0.001))
  return pts
}
save('vase', new THREE.LatheGeometry(vaseProfile(), 48))
