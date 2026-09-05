import type { AtomDetail } from './pdb'

/**
 * A small set of organic functional groups worth telling apart visually in
 * a classroom setting. This is a best-effort heuristic classifier working
 * only off the bond graph (who's bonded to whom) and element symbols --
 * there's no bond-order or explicit hydrogen information to lean on for a
 * PDB file's distance-inferred bonds, so patterns are recognized by each
 * atom's element and degree (how many neighbors it has) rather than true
 * valence. A PubChem-sourced compound (real CONECT bonds from its SDF) will
 * still classify more reliably than a PDB file's inferred ones, since the
 * bond graph itself is more trustworthy there.
 */
export type FunctionalGroup = 'carboxyl' | 'ester' | 'amide' | 'carbonyl' | 'hydroxyl' | 'ether' | 'amine' | 'nitro' | 'aromatic' | 'none'

export const FUNCTIONAL_GROUP_COLORS: Record<FunctionalGroup, number> = {
  carboxyl: 0xff4757,
  ester: 0xff9f43,
  amide: 0xa55eea,
  carbonyl: 0xffd32a,
  hydroxyl: 0x2ed573,
  ether: 0x1e90ff,
  amine: 0x00d2d3,
  nitro: 0xe84393,
  aromatic: 0x8395a7,
  none: 0xd8dbe3,
}

export const FUNCTIONAL_GROUP_LABELS: Record<FunctionalGroup, string> = {
  carboxyl: '카복실기 (-COOH)',
  ester: '에스터 결합 (-COO-)',
  amide: '아마이드 결합 (-CONH-)',
  carbonyl: '카보닐기 (C=O)',
  hydroxyl: '하이드록시기 (-OH)',
  ether: '에터 결합 (-O-)',
  amine: '아민기 (-NH₂, -NH-)',
  nitro: '나이트로기 (-NO₂)',
  aromatic: '방향족 고리 (벤젠 등)',
  none: '해당 없음',
}

/** Finds every 6-membered all-carbon ring and flags its atoms as aromatic -- a cheap stand-in for real aromaticity perception (which needs bond order) that still reliably catches benzene rings, the common case in teaching examples. */
function findAromaticCarbonRings(adj: number[][], elements: string[]): boolean[] {
  const n = elements.length
  const inRing = new Array(n).fill(false)

  function dfs(start: number, current: number, path: number[], visited: boolean[], depth: number) {
    if (depth > 6) return
    for (const next of adj[current]) {
      if (next === start) {
        if (depth === 6) for (const idx of path) inRing[idx] = true
        continue
      }
      // Only explore neighbors with a higher index than `start` -- every
      // ring still gets found (from its lowest-indexed member), just once
      // instead of once per member, and this also keeps the search from
      // wandering back out through already-completed lower-indexed atoms.
      if (next < start || visited[next] || elements[next] !== 'C') continue
      visited[next] = true
      path.push(next)
      dfs(start, next, path, visited, depth + 1)
      path.pop()
      visited[next] = false
    }
  }

  for (let start = 0; start < n; start++) {
    if (elements[start] !== 'C') continue
    const visited = new Array(n).fill(false)
    visited[start] = true
    dfs(start, start, [start], visited, 1)
  }
  return inRing
}

/** Classifies every atom into at most one functional group, returned as one entry per atom index (matching atomDetails/bond-pair indexing). */
export function classifyFunctionalGroups(atomDetails: AtomDetail[], bondPairs: [number, number][]): FunctionalGroup[] {
  const n = atomDetails.length
  const elements = atomDetails.map((a) => a.element.toUpperCase())
  const adj: number[][] = Array.from({ length: n }, () => [])
  for (const [a, b] of bondPairs) {
    adj[a].push(b)
    adj[b].push(a)
  }

  const groups: FunctionalGroup[] = new Array(n).fill('none')

  const aromatic = findAromaticCarbonRings(adj, elements)
  for (let i = 0; i < n; i++) if (aromatic[i]) groups[i] = 'aromatic'

  // "Terminal" vs. "bridging" is decided by how many OTHER heavy (non-H)
  // atoms an oxygen/nitrogen connects onward to -- a hydroxyl oxygen bonded
  // to its carbon AND an explicit hydrogen (some sources include H atoms
  // with real CONECT bonds, others omit H entirely) is terminal either way,
  // so hydrogen neighbors don't count toward degree here.
  const heavyDegree = (i: number) => adj[i].filter((j) => elements[j] !== 'H').length
  const hasHydrogenNeighbor = (i: number) => adj[i].some((j) => elements[j] === 'H')
  // Whether this file carries explicit hydrogens at all -- a plain alcohol
  // (C-OH) and a ketone/aldehyde (C=O) are otherwise indistinguishable from
  // connectivity alone (both are just "one carbon, one terminal oxygen,
  // nothing else"); an attached H is the only signal telling them apart.
  const hasAnyHydrogen = elements.includes('H')

  // Carbon-centered patterns keyed on how many oxygens it carries and
  // whether each of those oxygens is terminal (bonded onward to only this
  // carbon, e.g. C=O or C-OH) or bridging (bonded onward to a second heavy
  // atom too, e.g. the ether oxygen in an ester's -O-C).
  for (let c = 0; c < n; c++) {
    if (elements[c] !== 'C') continue
    const oNeighbors = adj[c].filter((j) => elements[j] === 'O')
    if (oNeighbors.length === 0) continue
    const terminalOs = oNeighbors.filter((j) => heavyDegree(j) === 1)
    const bridgingOs = oNeighbors.filter((j) => heavyDegree(j) >= 2)

    if (oNeighbors.length === 2 && terminalOs.length === 2) {
      groups[c] = 'carboxyl'
      for (const o of oNeighbors) groups[o] = 'carboxyl'
    } else if (terminalOs.length === 1 && bridgingOs.length === 1) {
      groups[c] = 'ester'
      groups[terminalOs[0]] = 'ester'
      groups[bridgingOs[0]] = 'ester'
    } else if (terminalOs.length === 1 && bridgingOs.length === 0 && hasAnyHydrogen) {
      // A lone terminal oxygen on this carbon is a hydroxyl (C-OH) if it has
      // its own hydrogen, or a carbonyl (C=O) if it doesn't -- without any H
      // atoms in the file at all, this same pattern is equally consistent
      // with either, so it's left unclassified rather than guessing.
      const o = terminalOs[0]
      if (hasHydrogenNeighbor(o)) {
        groups[o] = 'hydroxyl'
      } else {
        groups[c] = 'carbonyl'
        groups[o] = 'carbonyl'
      }
    }
  }

  // Amide: a carbonyl carbon (one terminal O) that's also bonded straight to
  // a nitrogen -- reclassifies that carbon/oxygen/nitrogen trio together.
  for (let c = 0; c < n; c++) {
    if (elements[c] !== 'C') continue
    const carbonylO = adj[c].find((j) => elements[j] === 'O' && heavyDegree(j) === 1 && (!hasAnyHydrogen || !hasHydrogenNeighbor(j)))
    const nNeighbors = adj[c].filter((j) => elements[j] === 'N')
    if (carbonylO !== undefined && nNeighbors.length > 0) {
      groups[c] = 'amide'
      groups[carbonylO] = 'amide'
      for (const nIdx of nNeighbors) groups[nIdx] = 'amide'
    }
  }

  // Remaining, not-yet-classified oxygens: bridging-between-two-carbons is
  // an ether (unambiguous regardless of hydrogen data). A lone terminal
  // oxygen reaching this point only happens when the file has no hydrogens
  // at all -- the same C-OH/C=O ambiguity as above, left unclassified for
  // the same reason rather than guessing "hydroxyl" by default.
  for (let o = 0; o < n; o++) {
    if (elements[o] !== 'O' || groups[o] !== 'none') continue
    const heavyNeighbors = adj[o].filter((j) => elements[j] !== 'H')
    if (heavyNeighbors.length >= 2 && heavyNeighbors.every((j) => elements[j] === 'C')) groups[o] = 'ether'
  }

  // Nitro: a nitrogen carrying two terminal oxygens (-NO2).
  for (let nIdx = 0; nIdx < n; nIdx++) {
    if (elements[nIdx] !== 'N') continue
    const terminalOs = adj[nIdx].filter((j) => elements[j] === 'O' && heavyDegree(j) === 1)
    if (terminalOs.length === 2) {
      groups[nIdx] = 'nitro'
      for (const o of terminalOs) groups[o] = 'nitro'
    }
  }

  // Anything left on a nitrogen is a plain amine.
  for (let nIdx = 0; nIdx < n; nIdx++) {
    if (elements[nIdx] === 'N' && groups[nIdx] === 'none') groups[nIdx] = 'amine'
  }

  return groups
}
