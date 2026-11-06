// What the 3D view's things and walls are drawn into before they're meshes: triangles in metres
// (three's axes: x, up, z = the plan's y), each with its normal and a linear RGBA colour — the
// kit's (furn/native.ts) and the walls' (furn/walls-native.ts) — kept apart by how they're lit:
// lit faces (the cel's mark in their alpha), what glows, what's see-through; pictures on faces
// (decals); contact shadows on the floor. (The sketches' 3D kit, MeshSketch, went with the item art:
// docs/plan/72-the-3d-core.md, phase 12.)

export type V3 = [number, number, number];

// ── buffers ──────────────────────────────────────────────────────────────────
// Non-indexed triangles: position, normal, rgba colour (linear).
export class Geo {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  get empty() {
    return this.pos.length === 0;
  }
  // (wound to face `n`, whatever order the corners come in)
  tri(a: V3, b: V3, c: V3, n: V3, rgba: number[]) {
    const ok = dot(cross(sub(b, a), sub(c, a)), n) >= 0;
    for (const p of ok ? [a, b, c] : [a, c, b]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.col.push(rgba[0], rgba[1], rgba[2], rgba[3]);
    }
  }
  // a, b, c, d counter-clockwise seen from the side `n` points to
  quad(a: V3, b: V3, c: V3, d: V3, n: V3, rgba: number[]) {
    this.tri(a, b, c, n, rgba);
    this.tri(a, c, d, n, rgba);
  }
}

export interface Soft {
  // contact shadows, plan metres: rects (with rounding) and dots
  rects: { x0: number; y0: number; x1: number; y1: number; op: number; round: number }[];
  dots: { x: number; y: number; r: number; op: number }[];
}

// A decal: an SVG picture on a face (a bay's name board's name), its corners' UVs into the picture.
export interface Decal {
  svg: string;
  pos: number[];
  nor: number[];
  uv: number[];
  glow: boolean;
}

export class Out {
  lit = new Geo();
  glow = new Geo();
  clear = new Geo(); // see-through (glass)
  decals: Decal[] = [];
  soft: Soft = { rects: [], dots: [] };
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
