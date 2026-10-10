// Yondra's warm 80s hi-fi palette: walnut, cream, amber VFD, rust, olive. No neon.
export const C = {
  walnut: 0x5b3a26,
  walnutDark: 0x3e2718,
  walnutLight: 0x7a5236,
  teak: 0x8a5a36,
  cream: 0xefe4cc,
  creamDark: 0xd9cba9,
  paper: 0xf7f0de,
  amber: 0xffa630,
  amberSoft: 0xe8a33d,
  vfd: 0xffb35c,
  rust: 0xb5562f,
  rustDark: 0x8a3b2e,
  olive: 0x6e7b3a,
  oliveDark: 0x4f5a28,
  sage: 0x8f9a6a,
  slate: 0x3d4a5c,
  ink: 0x2a2420,
  graphite: 0x2b2a26,
  aluminium: 0xb9b2a3,
  alumDark: 0x8d877a,
  felt: 0x7a3b2e,
  feltLight: 0x93503b,
  carpet: 0x6b6a3a,
  carpetLight: 0x7c7b46,
  tile: 0xe6dcc4,
  tileDark: 0xcfc3a5,
  stage: 0x2f2620,
  stageLight: 0x3c3129,
  grate: 0x4a4740,
  grateLight: 0x5a564d,
  leaf: 0x5f7a3a,
  leafDark: 0x435a28,
  leafLight: 0x7d9a4a,
  terracotta: 0xb8643c,
  screenOff: 0x1d211c,
  phosphor: 0x9aa67e,
  red: 0xc4402b,
  shadow: 0x1a120c,
  night: 0x1b1430,
} as const;

export function shade(color: number, f: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((color >> 8) & 255) * f));
  const b = Math.min(255, Math.round((color & 255) * f));
  return (r << 16) | (g << 8) | b;
}

export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return (
    (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t)
  );
}

export function hex(s: string, fallback = 0x888888): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(s.trim());
  return m ? Number.parseInt(m[1], 16) : fallback;
}

// Small deterministic noise for floor grain etc.
export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
