import { fetchWithTimeout } from './net'
import { sdfToLegacyPDB, looksLikeSdf } from './sdf'

const PUBCHEM_BASE = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug'

/**
 * Looks up a compound by name via PubChem's public PUG REST API and
 * returns its structure already converted to legacy-PDB text (see sdf.ts).
 * RCSB (the app's other data source) only covers proteins/nucleic acids --
 * small organic compounds like "dibutyl phthalate" simply aren't in it, so
 * this is a second, separate lookup path for that whole class of molecule.
 *
 * Tries PubChem's standardized 3D conformer first, falling back to
 * whatever 2D structure it has on file for compounds without one (the
 * model renders flat/planar in that case -- still more useful than
 * refusing to load).
 */
export async function fetchCompoundByName(name: string): Promise<string> {
  const encoded = encodeURIComponent(name.trim())
  if (!encoded) throw new Error('화합물 이름을 입력하세요.')

  try {
    const res3d = await fetchWithTimeout(`${PUBCHEM_BASE}/compound/name/${encoded}/SDF?record_type=3d`)
    if (res3d.ok) {
      const text = await res3d.text()
      if (looksLikeSdf(text)) return sdfToLegacyPDB(text)
    }
  } catch {
    // fall through to the 2D fallback below
  }

  const res2d = await fetchWithTimeout(`${PUBCHEM_BASE}/compound/name/${encoded}/SDF`)
  if (!res2d.ok) {
    throw new Error(`PubChem에서 "${name}"을(를) 찾지 못했습니다 (${res2d.status}).`)
  }
  const text2d = await res2d.text()
  if (!looksLikeSdf(text2d)) {
    throw new Error(`PubChem에서 "${name}"에 대한 구조 데이터를 받지 못했습니다.`)
  }
  return sdfToLegacyPDB(text2d)
}
