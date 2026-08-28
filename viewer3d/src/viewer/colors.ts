// CPK-style element colors and van-der-Waals-ish display radii for ball-and-stick / spacefill rendering.
export const ELEMENT_COLORS: Record<string, string> = {
  H: '#ffffff',
  C: '#909090',
  N: '#3050f8',
  O: '#ff0d0d',
  F: '#90e050',
  CL: '#1ff01f',
  BR: '#a62929',
  I: '#940094',
  S: '#ffff30',
  P: '#ff8000',
  FE: '#e06633',
  CA: '#3dff00',
  MG: '#8aff00',
  ZN: '#7d80b0',
  NA: '#ab5cf2',
  K: '#8f40d4',
  MN: '#9c7ac7',
  CU: '#c88033',
  DEFAULT: '#e0b0ff',
}

export const ELEMENT_RADII: Record<string, number> = {
  H: 0.31,
  C: 0.76,
  N: 0.71,
  O: 0.66,
  F: 0.57,
  CL: 0.99,
  BR: 1.14,
  I: 1.33,
  S: 1.05,
  P: 1.07,
  FE: 1.32,
  CA: 1.76,
  MG: 1.41,
  ZN: 1.22,
  NA: 1.66,
  K: 2.03,
  MN: 1.39,
  CU: 1.32,
  DEFAULT: 0.8,
}

export function elementColor(symbol: string): string {
  return ELEMENT_COLORS[symbol.toUpperCase()] ?? ELEMENT_COLORS.DEFAULT
}

export function elementRadius(symbol: string): number {
  return ELEMENT_RADII[symbol.toUpperCase()] ?? ELEMENT_RADII.DEFAULT
}
