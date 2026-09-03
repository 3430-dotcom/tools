/**
 * Minimal mmCIF `_atom_site` loop reader, converted into synthetic
 * fixed-column legacy-PDB ATOM/HETATM text -- so the rest of the app
 * (three.js's PDBLoader, our own parseAtomDetails/chain-color/cartoon
 * grouping) can stay legacy-PDB-only and doesn't need a parallel mmCIF
 * code path.
 *
 * Why this exists: many cryo-EM entries (and other large assemblies) have
 * NO legacy .pdb/.pdb1 file at all -- that format's 1-character chain-ID
 * and 5-digit atom-serial limits can't hold them, so RCSB simply doesn't
 * generate one and files.rcsb.org 404s. mmCIF (.cif) is the one format
 * RCSB always provides, so converting it is what makes those entries
 * loadable at all instead of failing outright.
 *
 * Deliberately narrow: only reads the fields the rest of the app actually
 * needs (coordinates, element, atom/residue name, chain, residue number).
 * Secondary-structure records (_struct_conf/_struct_sheet_range) aren't
 * parsed, so CIF-sourced models always show as coil in "2차 구조별" mode --
 * element and chain coloring (the two modes that matter for a multi-copy
 * assembly like a viral capsid) are unaffected.
 *
 * Each distinct auth_asym_id is written as its own MODEL/ENDMDL block with
 * the chain letter always "A" -- the legacy chain-ID column only has room
 * for one character, but our own chain-coloring/cartoon code already
 * groups by (chain, MODEL block) together (see pdb.ts's chainKey), so this
 * gives every physical chain copy its own color/backbone trace without
 * changing any of that logic. Assumes atom_site rows are grouped by chain
 * (true of every mmCIF writer in practice) -- an interleaved file would
 * fragment a chain's atoms across multiple synthetic MODEL blocks.
 */
export function mmcifToLegacyPDB(cif: string): string {
  const lines = cif.split('\n')
  let i = 0
  while (i < lines.length && !/^_atom_site\./.test(lines[i].trim())) i++
  if (i >= lines.length) {
    throw new Error('이 mmCIF 파일에서 원자 좌표(_atom_site) 목록을 찾지 못했습니다.')
  }

  const columns: string[] = []
  while (i < lines.length && /^_atom_site\./.test(lines[i].trim())) {
    columns.push(lines[i].trim().slice('_atom_site.'.length))
    i++
  }
  const col = (name: string) => columns.indexOf(name)
  const idxGroup = col('group_PDB')
  const idxType = col('type_symbol')
  const idxAtomName = col('auth_atom_id') !== -1 ? col('auth_atom_id') : col('label_atom_id')
  const idxResName = col('auth_comp_id') !== -1 ? col('auth_comp_id') : col('label_comp_id')
  const idxChain = col('auth_asym_id') !== -1 ? col('auth_asym_id') : col('label_asym_id')
  const idxResSeq = col('auth_seq_id') !== -1 ? col('auth_seq_id') : col('label_seq_id')
  const idxX = col('Cartn_x')
  const idxY = col('Cartn_y')
  const idxZ = col('Cartn_z')
  if ([idxGroup, idxType, idxAtomName, idxResName, idxChain, idxResSeq, idxX, idxY, idxZ].some((n) => n === -1)) {
    throw new Error('mmCIF의 _atom_site 목록에 필요한 열이 없습니다.')
  }

  const chainToModel = new Map<string, number>()
  const out: string[] = []
  let serial = 0
  let currentModel = -1

  for (; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed === '') continue
    if (trimmed === 'loop_' || trimmed === 'stop_' || trimmed[0] === '_' || trimmed[0] === '#') break

    const fields = tokenizeCifRow(trimmed)
    if (fields.length < columns.length) continue

    const chain = fields[idxChain]
    let modelIndex = chainToModel.get(chain)
    if (modelIndex === undefined) {
      modelIndex = chainToModel.size
      chainToModel.set(chain, modelIndex)
    }
    if (modelIndex !== currentModel) {
      if (currentModel !== -1) out.push('ENDMDL')
      out.push(`MODEL     ${modelIndex + 1}`)
      currentModel = modelIndex
    }

    serial++
    out.push(
      buildAtomLine(
        serial,
        fields[idxGroup],
        fields[idxAtomName],
        fields[idxResName],
        parseInt(fields[idxResSeq], 10) || 0,
        parseFloat(fields[idxX]),
        parseFloat(fields[idxY]),
        parseFloat(fields[idxZ]),
        fields[idxType],
      ),
    )
  }
  if (currentModel !== -1) out.push('ENDMDL')
  out.push('END')
  return out.join('\n')
}

/** Splits one mmCIF data row into tokens, honoring '...'/"..." quoting for values containing whitespace. */
function tokenizeCifRow(line: string): string[] {
  const tokens: string[] = []
  let i = 0
  const n = line.length
  while (i < n) {
    while (i < n && /\s/.test(line[i])) i++
    if (i >= n) break
    const c = line[i]
    if (c === '"' || c === "'") {
      i++
      const start = i
      while (i < n && line[i] !== c) i++
      tokens.push(line.slice(start, i))
      i++
    } else {
      const start = i
      while (i < n && !/\s/.test(line[i])) i++
      tokens.push(line.slice(start, i))
    }
  }
  return tokens
}

function rjust(text: string, width: number): string {
  return text.length >= width ? text.slice(text.length - width) : text.padStart(width)
}

function ljust(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text.padEnd(width)
}

/** Formats a coordinate to fit the narrow 7-char field three.js's PDBLoader actually reads (see pdb.ts's fetchPDBById comment), reducing decimal places rather than truncating digits off a huge value. */
function fitCoord(v: number): string {
  if (!Number.isFinite(v)) return '0'.padStart(7)
  for (const dp of [3, 2, 1, 0]) {
    const s = v.toFixed(dp)
    if (s.length <= 7) return s
  }
  return v.toFixed(0).slice(0, 7)
}

function buildAtomLine(
  serial: number,
  group: string,
  atomName: string,
  resName: string,
  resSeq: number,
  x: number,
  y: number,
  z: number,
  element: string,
): string {
  const record = group.toUpperCase() === 'HETATM' ? 'HETATM' : 'ATOM  '
  const chars = new Array(80).fill(' ')
  const put = (start: number, text: string) => {
    for (let k = 0; k < text.length; k++) chars[start + k] = text[k]
  }
  put(0, record)
  put(6, rjust(String(serial % 100000), 5))
  put(12, ljust(atomName.slice(0, 4), 4))
  put(17, ljust(resName.slice(0, 3), 3))
  put(21, 'A')
  put(22, rjust(String(resSeq), 4))
  put(30, rjust(fitCoord(x), 7))
  put(38, rjust(fitCoord(y), 7))
  put(46, rjust(fitCoord(z), 7))
  put(76, rjust(element.slice(0, 2), 2))
  return chars.join('')
}
