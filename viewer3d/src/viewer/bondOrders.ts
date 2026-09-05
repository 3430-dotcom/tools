import * as THREE from 'three'
import { findRings } from './functionalGroups'

/** Per-bond double/triple-bond order, keyed by `bondOrderKey` on 0-based atom indices -- the shape both an SDF's real bond-type column (sdf.ts) and the structural-formula overlay (pdb.ts) key their data with, so file-sourced and inferred orders slot into the same map shape. */
export type BondOrderMap = Map<string, number>

/** Order-independent key for a bond between two 0-based atom indices, shared by every reader/writer of a BondOrderMap so both sides always agree on how a pair maps to a key. */
export function bondOrderKey(a: number, b: number): string {
  return `${Math.min(a, b)}-${Math.max(a, b)}`
}

// Length thresholds (Angstroms) below which a bond is short enough to be a
// double/triple rather than single -- ordered longest-cutoff-first so the
// first match wins. Element pairs are looked up alphabetically regardless of
// which side of the bond each atom is on. Pairs not listed here (or any
// bond touching hydrogen) always come back single -- hydrogen forms no
// multiple bonds, and every other element pair in a teaching-sized molecule
// is single in practice.
const THRESHOLDS: Record<string, { max: number; order: number }[]> = {
  'C-C': [
    { max: 1.3, order: 3 },
    { max: 1.42, order: 2 },
  ],
  'C-N': [
    { max: 1.25, order: 3 },
    { max: 1.38, order: 2 },
  ],
  'C-O': [{ max: 1.28, order: 2 }],
  'N-O': [{ max: 1.3, order: 2 }],
  'N-N': [
    { max: 1.2, order: 3 },
    { max: 1.35, order: 2 },
  ],
}

function baseOrder(distance: number, elementA: string, elementB: string): number {
  if (elementA === 'H' || elementB === 'H') return 1
  const rules = THRESHOLDS[[elementA, elementB].sort().join('-')]
  if (!rules) return 1
  for (const rule of rules) if (distance < rule.max) return rule.order
  return 1
}

// A ring where every bond falls in this band reads as aromatic (benzene's
// real C-C bond length, ~1.39 A, sits in the middle of it) -- rather than
// mark every one of those bonds "double" (which draws nothing like a real
// structural formula), they get Kekule-alternated below instead.
const AROMATIC_MIN = 1.34
const AROMATIC_MAX = 1.43

/**
 * Estimates a double/triple-bond order per entry of `bondPairs` from bond
 * length alone, for any source (local PDB samples, RCSB, an uploaded .pdb)
 * that doesn't carry real bond-order data the way an SDF/MOL file's own
 * bond-type column does (see sdf.ts) -- used only as a fallback when no
 * BondOrderMap came from the file itself.
 */
export function inferBondOrders(positions: THREE.Vector3[], elements: string[], bondPairs: [number, number][]): number[] {
  const orders = bondPairs.map(([a, b]) => baseOrder(positions[a].distanceTo(positions[b]), elements[a], elements[b]))

  const adj: number[][] = Array.from({ length: positions.length }, () => [])
  for (const [a, b] of bondPairs) {
    adj[a].push(b)
    adj[b].push(a)
  }
  const bondIndex = new Map<string, number>()
  bondPairs.forEach(([a, b], i) => bondIndex.set(bondOrderKey(a, b), i))

  const rings = findRings(adj, elements, { sizes: [5, 6] })
  for (const ring of rings) {
    const ringBondIndices: number[] = []
    let isAromaticRing = true
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k]
      const b = ring[(k + 1) % ring.length]
      const idx = bondIndex.get(bondOrderKey(a, b))
      const distance = positions[a].distanceTo(positions[b])
      if (idx === undefined || distance < AROMATIC_MIN || distance > AROMATIC_MAX) {
        isAromaticRing = false
        break
      }
      ringBondIndices.push(idx)
    }
    if (!isAromaticRing) continue
    // Alternate double/single around the cycle (a benzene ring comes out as
    // three double + three single, matching how a real structural formula
    // draws it) instead of marking every ring bond double.
    ringBondIndices.forEach((idx, k) => {
      orders[idx] = k % 2 === 0 ? 2 : 1
    })
  }

  return orders
}
