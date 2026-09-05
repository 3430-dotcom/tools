/**
 * Shared fixed-column legacy-PDB text writer, used by every "convert some
 * other format into legacy-PDB text" module (mmcif.ts, sdf.ts) so the rest
 * of the app (three.js's PDBLoader, our own parseAtomDetails) only ever has
 * to understand one input shape. Column positions match what PDBLoader.js
 * itself actually reads (see its ATOM-line slice offsets), not the full
 * official PDB spec width, since matching the real reader is what matters
 * here -- see mmcif.ts's fetchPDBById-adjacent comment for the 7-char
 * coordinate-field origin story.
 */

export function rjust(text: string, width: number): string {
  return text.length >= width ? text.slice(text.length - width) : text.padStart(width)
}

export function ljust(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text.padEnd(width)
}

/** Formats a coordinate to fit the narrow 7-char field, reducing decimal places rather than truncating digits off a huge value. */
export function fitCoord(v: number): string {
  if (!Number.isFinite(v)) return '0'.padStart(7)
  for (const dp of [3, 2, 1, 0]) {
    const s = v.toFixed(dp)
    if (s.length <= 7) return s
  }
  return v.toFixed(0).slice(0, 7)
}

export function buildAtomLine(
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

/**
 * Builds CONECT lines for a full bond adjacency list -- each atom gets one
 * line listing up to 4 bonded-atom serials (columns matching what
 * PDBLoader.js's CONECT parser reads: serial at [6,11), then up to four
 * neighbors at [11,16)/[16,21)/[21,26)/[26,31)), with extra lines chunked
 * in groups of 4 for an atom with more than 4 bonds.
 */
export function buildConectLines(adjacency: Map<number, number[]>): string[] {
  const lines: string[] = []
  for (const [serial, neighbors] of adjacency) {
    for (let i = 0; i < neighbors.length; i += 4) {
      const chunk = neighbors.slice(i, i + 4)
      const chars = new Array(31).fill(' ')
      const put = (start: number, text: string) => {
        for (let k = 0; k < text.length; k++) chars[start + k] = text[k]
      }
      put(0, 'CONECT')
      put(6, rjust(String(serial), 5))
      chunk.forEach((n, j) => put(11 + j * 5, rjust(String(n), 5)))
      lines.push(chars.join('').trimEnd())
    }
  }
  return lines
}
