import { buildAtomLine, buildConectLines } from './legacyPdbText'
import { bondOrderKey, type BondOrderMap } from './bondOrders'

/**
 * Minimal SDF/MOL (V2000 "connection table") reader, converted into
 * synthetic fixed-column legacy-PDB text -- same strategy as mmcif.ts, so
 * the rest of the app (PDBLoader, chain/element coloring, bond rendering)
 * doesn't need a separate code path for small molecules pulled from
 * PubChem or uploaded directly as .sdf/.mol.
 *
 * Unlike a PDB/mmCIF structure, an SDF molecule has no chain or residue
 * concept -- every atom is written as a single HETATM "LIG" residue in
 * chain A, matching how a small-molecule ligand is conventionally recorded
 * inside a real PDB file. Atom names are synthesized from the element
 * symbol plus a running per-element count (e.g. "C1", "C2", "O1") since
 * SDF doesn't carry atom names at all -- deliberately never bare "CA" with
 * no suffix, since that's the one atom name pdb.ts's cartoon tracer treats
 * as significant (the alpha-carbon backbone atom).
 *
 * SDF bonds are explicit (unlike a PDB file, which usually omits CONECT
 * for standard residues and relies on distance-based inference) -- writing
 * them out as real CONECT records gives small molecules more accurate
 * bonds than the app's own distance heuristic would.
 */
export function sdfToLegacyPDB(sdf: string): { text: string; bondOrders: BondOrderMap } {
  // A PubChem SDF response (or a multi-molecule file) can concatenate
  // several molecules separated by a "$$$$" line -- only the first is
  // ever relevant here (a single compound-name lookup, or the first
  // molecule of an uploaded file).
  const block = sdf.split(/^\$\$\$\$\s*$/m)[0]
  const lines = block.split('\n')
  if (lines.length < 4) {
    throw new Error('이 SDF 파일에서 분자 데이터를 찾지 못했습니다.')
  }

  const countsLine = lines[3]
  const atomCount = parseInt(countsLine.slice(0, 3), 10) || 0
  const bondCount = parseInt(countsLine.slice(3, 6), 10) || 0
  if (atomCount === 0) {
    throw new Error('이 SDF 파일에서 원자 좌표를 찾지 못했습니다.')
  }

  const atomLines = lines.slice(4, 4 + atomCount)
  const bondLines = lines.slice(4 + atomCount, 4 + atomCount + bondCount)

  const out: string[] = []
  const elementCounts: Record<string, number> = {}
  for (let i = 0; i < atomLines.length; i++) {
    const line = atomLines[i]
    const x = parseFloat(line.slice(0, 10))
    const y = parseFloat(line.slice(10, 20))
    const z = parseFloat(line.slice(20, 30))
    const symbol = line.slice(31, 34).trim() || 'C'
    const n = (elementCounts[symbol] = (elementCounts[symbol] ?? 0) + 1)
    out.push(buildAtomLine(i + 1, 'HETATM', `${symbol}${n}`, 'LIG', 1, x, y, z, symbol))
  }

  const adjacency = new Map<number, number[]>()
  // Column 7-9 of a V2000 bond line is the bond type (1=single, 2=double,
  // 3=triple, 4=aromatic) -- keyed on 0-based atom indices (SDF numbers
  // atoms from 1) so it lines up directly with pdb.ts's own positions/
  // atomDetails indexing once this text is re-parsed.
  const bondOrders: BondOrderMap = new Map()
  for (const line of bondLines) {
    const a = parseInt(line.slice(0, 3), 10)
    const b = parseInt(line.slice(3, 6), 10)
    if (!a || !b) continue
    ;(adjacency.get(a) ?? adjacency.set(a, []).get(a)!).push(b)
    ;(adjacency.get(b) ?? adjacency.set(b, []).get(b)!).push(a)
    bondOrders.set(bondOrderKey(a - 1, b - 1), parseInt(line.slice(6, 9), 10) || 1)
  }
  out.push(...buildConectLines(adjacency))

  out.push('END')
  return { text: out.join('\n'), bondOrders }
}

/** Cheap check that a fetched response is actually SDF content, not e.g. an HTML error page returned with a 200 status. */
export function looksLikeSdf(text: string): boolean {
  return /^M\s+END\s*$/m.test(text) || /^\$\$\$\$\s*$/m.test(text)
}
