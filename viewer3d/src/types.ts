import type { PDBMetadata } from './viewer/pdb'

export type ModelKind = 'pdb' | 'stl' | null

export interface PDBInfo {
  kind: 'pdb'
  atomCount: number
  bondCount: number
  elementCounts: Record<string, number>
  metadata: PDBMetadata
  hasCartoon: boolean
}

export interface STLInfo {
  kind: 'stl'
  triangleCount: number
  size: { x: number; y: number; z: number }
  volumeMm3: number
}

export type ModelInfo = PDBInfo | STLInfo | null

export interface SampleEntry {
  label: string
  kind: 'pdb' | 'stl'
  source: string
}
