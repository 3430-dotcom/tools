import type { PDBMetadata } from './viewer/pdb'
import type { CompoundInfo } from './viewer/pubchem'

export type ModelKind = 'pdb' | 'stl' | null

export interface PDBInfo {
  kind: 'pdb'
  atomCount: number
  bondCount: number
  elementCounts: Record<string, number>
  metadata: PDBMetadata
  hasCartoon: boolean
  /** Chain ID -> assigned color (hex number), for the "체인별" color mode's legend. */
  chainColors: Record<string, number>
  /** Present only when this model came from a PubChem compound-name lookup -- chemistry info the info panel shows alongside the usual atom/bond breakdown. */
  compound?: CompoundInfo
}

export interface STLInfo {
  kind: 'stl'
  triangleCount: number
  size: { x: number; y: number; z: number }
  volumeMm3: number
  /** Whether this STL embedded its own per-facet color (a de-facto binary-STL extension) -- if so, the viewer shows that instead of the default material color. */
  hasEmbeddedColor: boolean
}

export type ModelInfo = PDBInfo | STLInfo | null

export interface SampleEntry {
  label: string
  kind: 'pdb' | 'stl'
  source: string
}
