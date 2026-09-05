import { fetchWithTimeout } from './net'
import { sdfToLegacyPDB, looksLikeSdf } from './sdf'

const PUBCHEM_BASE = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug'

/** Chemistry metadata PubChem provides for a compound, shown in the model info panel alongside (not instead of) the usual atom/bond breakdown. */
export interface CompoundInfo {
  molecularFormula: string | null
  molecularWeight: number | null
  iupacName: string | null
  /** False when PubChem had no 3D conformer and this loaded its 2D structure instead -- the model will render flat/planar, which the UI should explain rather than leave looking like a bug. */
  is3d: boolean
}

export interface CompoundLookupResult {
  text: string
  info: CompoundInfo
}

/**
 * Looks up a compound by name via PubChem's public PUG REST API and
 * returns its structure already converted to legacy-PDB text (see sdf.ts),
 * plus whatever chemistry metadata PubChem has on file. RCSB (the app's
 * other data source) only covers proteins/nucleic acids -- small organic
 * compounds like "dibutyl phthalate" simply aren't in it, so this is a
 * second, separate lookup path for that whole class of molecule.
 *
 * Tries PubChem's standardized 3D conformer first, falling back to
 * whatever 2D structure it has on file for compounds without one (the
 * model renders flat/planar in that case -- still more useful than
 * refusing to load).
 */
export async function fetchCompoundByName(name: string): Promise<CompoundLookupResult> {
  const encoded = encodeURIComponent(name.trim())
  if (!encoded) throw new Error('화합물 이름을 입력하세요.')

  let text: string | null = null
  let is3d = true

  try {
    const res3d = await fetchWithTimeout(`${PUBCHEM_BASE}/compound/name/${encoded}/SDF?record_type=3d`)
    if (res3d.ok) {
      const candidate = await res3d.text()
      if (looksLikeSdf(candidate)) text = candidate
    }
  } catch {
    // fall through to the 2D fallback below
  }

  if (text === null) {
    is3d = false
    const res2d = await fetchWithTimeout(`${PUBCHEM_BASE}/compound/name/${encoded}/SDF`)
    if (!res2d.ok) {
      throw new Error(`PubChem에서 "${name}"을(를) 찾지 못했습니다 (${res2d.status}).`)
    }
    const candidate = await res2d.text()
    if (!looksLikeSdf(candidate)) {
      throw new Error(`PubChem에서 "${name}"에 대한 구조 데이터를 받지 못했습니다.`)
    }
    text = candidate
  }

  // Best-effort: a compound is still loadable without this succeeding, so a
  // failure here shouldn't block the load the way a failed structure fetch
  // does above.
  const info = await fetchCompoundProperties(encoded, is3d).catch(
    (): CompoundInfo => ({ molecularFormula: null, molecularWeight: null, iupacName: null, is3d }),
  )

  return { text: sdfToLegacyPDB(text), info }
}

async function fetchCompoundProperties(encodedName: string, is3d: boolean): Promise<CompoundInfo> {
  const res = await fetchWithTimeout(`${PUBCHEM_BASE}/compound/name/${encodedName}/property/MolecularFormula,MolecularWeight,IUPACName/JSON`)
  if (!res.ok) return { molecularFormula: null, molecularWeight: null, iupacName: null, is3d }
  const data = (await res.json()) as { PropertyTable?: { Properties?: Record<string, string | number>[] } }
  const props = data.PropertyTable?.Properties?.[0] ?? {}
  return {
    molecularFormula: typeof props.MolecularFormula === 'string' ? props.MolecularFormula : null,
    molecularWeight: typeof props.MolecularWeight === 'number' ? props.MolecularWeight : Number(props.MolecularWeight) || null,
    iupacName: typeof props.IUPACName === 'string' ? props.IUPACName : null,
    is3d,
  }
}

export interface PubchemSearchResult {
  kind: 'compound'
  name: string
  thumbnailUrl: string
}

/**
 * Best-effort compound-name search via PubChem's autocomplete endpoint --
 * PubChem has no free-text "search" API the way RCSB does, but autocomplete
 * matches partial/misspelled names against its dictionary, which serves
 * the same purpose here. Returns [] (never throws) on any failure, since
 * this always runs alongside an RCSB search and shouldn't be able to
 * surface its own error on top of that one.
 */
export async function searchCompounds(query: string): Promise<PubchemSearchResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  try {
    const res = await fetchWithTimeout(
      `https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/compound/${encodeURIComponent(trimmed)}/json?limit=8`,
    )
    if (!res.ok) return []
    const data = (await res.json()) as { dictionary_terms?: { compound?: string[] } }
    const names = data.dictionary_terms?.compound ?? []
    return names.map((name) => ({
      kind: 'compound',
      name,
      thumbnailUrl: `${PUBCHEM_BASE}/compound/name/${encodeURIComponent(name)}/PNG?image_size=300x300`,
    }))
  } catch {
    return []
  }
}
