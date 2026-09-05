import type { PDBMetadata } from './viewer/pdb'
import type { CompoundInfo } from './viewer/pubchem'
import type { FunctionalGroup } from './viewer/functionalGroups'

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
  /** How many atoms fell into each detected functional group, for the "작용기별" color mode's legend. Omits groups with zero atoms. */
  functionalGroupCounts: Partial<Record<FunctionalGroup, number>>
  /** Whether the structural-formula overlay's double/triple-bond data came from the source file or was inferred from bond length -- see PDBModel.bondOrderSource. */
  bondOrderSource: 'file' | 'inferred'
  /** Present only when this model came from a PubChem compound-name lookup -- chemistry info the info panel shows alongside the usual atom/bond breakdown. */
  compound?: CompoundInfo
  /** The compound name to look up PubChem's flat-depiction PNG under (see StructureFormulaCard) -- either the compound-lookup's own name, or a curated sample's pubchemName. Absent for an uploaded file or a protein, which hides the flat-structure card and its checkbox entirely. */
  depictionName?: string
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
